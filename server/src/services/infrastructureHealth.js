import { config } from '../config/index.js';
import { deployment } from '../config/deployment.js';
import { getCmsPool } from './database.js';
import { isRedisReady, redisConfig } from '../infrastructure/redis/redisClient.js';
import { storageHealth } from './storage.js';
import { emailHealth } from './email.js';
import { systemStatus } from './runtimeConfiguration.js';

// Status comes from actual checks or persisted heartbeats, never credential
// presence alone. No connection URLs, provider errors or secrets are returned.
export async function infrastructureStatus() {
  const now = new Date().toISOString();
  let workers = { status: 'unavailable', reason: 'Worker heartbeat has not been verified.' };
  let scheduledTasks = { status: 'unavailable', reason: 'Scheduled execution has not been verified.' };
  try {
    const pool = await getCmsPool();
    const [[row]] = await pool.execute('SELECT heartbeat_at AS heartbeat FROM managed_worker_state WHERE id=true');
    const recent = row?.heartbeat && Date.now() - new Date(row.heartbeat).getTime() < 60000;
    workers = { provider: 'external Node worker', status: recent ? 'healthy' : 'unavailable', checkedAt: row?.heartbeat || null };
    const [runs] = await pool.execute('SELECT name,status,updated_at FROM scheduled_job_runs ORDER BY updated_at DESC LIMIT 10');
    scheduledTasks = { provider: 'Vercel Cron', status: !runs.length ? 'unconfigured' : runs[0].status === 'succeeded' && Date.now() - new Date(runs[0].updated_at).getTime() < 48 * 3600000 ? 'healthy' : 'degraded', checkedAt: runs[0]?.updated_at || null };
  } catch { /* Unapplied job migration is visible as unavailable. */ }
  return {
    application: { provider: deployment.serverless ? 'Vercel Node.js' : 'Node.js', status: config.available ? 'healthy' : 'degraded', checkedAt: now },
    redis: { provider: 'Vercel Marketplace Redis', status: redisConfig.source === 'invalid' ? 'unavailable' : !redisConfig.enabled ? 'unconfigured' : isRedisReady() ? 'healthy' : 'unavailable', checkedAt: now },
    authentication: { provider: 'Redis session registry', status: isRedisReady() ? 'healthy' : 'unavailable', checkedAt: now },
    storage: { ...systemStatus.storage, ...storageHealth() },
    email: { ...systemStatus.email, ...emailHealth() },
    ai: { provider: 'OpenAI', status: config.get('features.ai') ? 'unconfigured' : 'disabled', reason: 'Use AI Management for provider verification.' },
    backgroundJobs: workers, scheduledTasks,
  };
}
