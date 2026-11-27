// Run on a managed container/worker host, never as a Vercel Function.
import './src/config/bootstrap.js';
import { setTimeout as pause } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { deployment } from './src/config/deployment.js';
import { initializeServices } from './src/services/initialization.js';
import { config } from './src/config/index.js';
import { getConfigPool, closeConfigStore } from './src/config/DatabaseSettingsProvider.js';
import { closeDatabaseConnection } from './src/services/database.js';
import { connectRedis, closeRedis } from './src/infrastructure/redis/redisClient.js';
import { recoverEmailJobs, startEmailWorker, stopEmailWorker } from './src/services/redisInfrastructure.js';
import { startAiKnowledgeWorker, stopAiKnowledgeWorker } from './src/services/aiKnowledgeBase.js';
import { drainEserviceOutbox } from './src/services/eserviceRoutes.js';
import { drainStaffNotifications, markStaffEmailDelivery, validateStaffEmailDelivery } from './src/services/staffNotifications.js';
import { markNotificationDeliveryFailed, markNotificationDeliverySent, validateQueuedNotification } from './src/services/notificationService.js';
import { sendEmail, emailHealth } from './src/services/email.js';
import { integrationHub } from './src/integrationHub/service.js';

if (deployment.serverless) throw new Error('The managed worker requires an external persistent Node host.');
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());
const workerId = randomUUID();
let gate;
try {
  await initializeServices();
  const pool = await getConfigPool();
  gate = await pool.getConnection();
  const lock = await gate.query('SELECT pg_try_advisory_lock(63820500) AS acquired');
  if (!lock.rows[0].acquired) throw new Error('Another managed worker already owns the execution lease.');
  // Recovery is safe only after acquiring the singleton lock. A second replica
  // must never requeue jobs that the first replica is currently sending.
  if (!await connectRedis()) throw new Error('Managed Redis is required by the worker.');
  await recoverEmailJobs();
  const workerReady = () => !controller.signal.aborted && config.available;
  startAiKnowledgeWorker({ isReady: workerReady });
  startEmailWorker(async ({ to, subject, text, html, attachments, deliveryId, staffNotificationId }) => {
    if (deliveryId && !await validateQueuedNotification(deliveryId)) return;
    if (staffNotificationId && !await validateStaffEmailDelivery(staffNotificationId, to)) return;
    await sendEmail(to, subject, text, undefined, undefined, attachments || [], html);
    await markStaffEmailDelivery(staffNotificationId, true);
    await markNotificationDeliverySent(deliveryId);
  }, async ({ deliveryId, staffNotificationId }, _job, error) => {
    await markStaffEmailDelivery(staffNotificationId, false);
    await markNotificationDeliveryFailed(deliveryId, error);
  }, () => workerReady() && emailHealth().status === 'healthy');
  let nextOutbox = 0;
  while (!controller.signal.aborted) {
    // Losing this dedicated connection loses the singleton lock. Stop rather
    // than reconnecting a lease while the worker might still be processing.
    await gate.query('SELECT 1');
    await config.load();
    if (!config.available) throw new Error('Worker settings are unavailable.');
    await pool.execute('INSERT INTO managed_worker_state(id,worker_id,heartbeat_at) VALUES (true,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET worker_id=EXCLUDED.worker_id,heartbeat_at=CURRENT_TIMESTAMP', [workerId]);
    if (Date.now() >= nextOutbox) {
      await drainEserviceOutbox();
      await drainStaffNotifications();
      nextOutbox = Date.now() + 30000;
    }
    if (process.env.INTEGRATION_VAULT_KEYS && process.env.INTEGRATION_VAULT_KEYS !== '{}') {
      const job = await integrationHub.repo.claim(workerId);
      if (job) await integrationHub.run(job, AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]));
    }
    await pause(5000, undefined, { signal: controller.signal }).catch(() => {});
  }
} catch {
  controller.abort();
  console.error(JSON.stringify({ event: 'managed_worker_stopped', reason: 'Check configuration, dependency health and singleton ownership.' }));
  process.exitCode = 1;
} finally {
  controller.abort();
  await Promise.allSettled([stopEmailWorker(), stopAiKnowledgeWorker()]);
  try { await gate?.query('SELECT pg_advisory_unlock(63820500)'); } catch { /* Failed session already released the lock. */ }
  gate?.release();
  await Promise.allSettled([closeRedis(), closeDatabaseConnection(), closeConfigStore()]);
}
