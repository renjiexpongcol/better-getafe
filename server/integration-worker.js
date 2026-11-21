import './src/config/bootstrap.js';
import crypto from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { config } from './src/config/index.js';
import { closeConfigStore } from './src/config/DatabaseSettingsProvider.js';
import { closeDatabaseConnection, buildDatabase, activateDatabase } from './src/services/database.js';
import { supabaseConnectionOptions } from './src/services/postgres.js';
import { closeRedis } from './src/infrastructure/redis/redisClient.js';
import { integrationHub } from './src/integrationHub/service.js';
import { safeCode } from './src/integrationHub/security.js';
import { ensureSupabaseConfigured, checkBetterGetafeSchema } from './src/config/supabaseSetup.js';

const workerId = crypto.randomUUID(), controller = new AbortController();
let databaseSettings;
let nextMaintenanceAt = 0;
let failureStreak = 0;
let migrationPaused = false;
let lastFailure;
const rotateVault = process.argv.includes('--rotate-vault');

async function refreshDatabase() {
  await config.load(migrationPaused || !config.available);
  if (!config.available) throw Object.assign(new Error('Settings are unavailable'), { code: 'WORKER_SETTINGS_UNAVAILABLE' });
  const settings = Object.entries(config.values).filter(([key]) => key.startsWith('database.'));
  const changed = !databaseSettings || settings.some(([key, value]) => !Object.is(value, databaseSettings[key]));
  if (!changed) return;
  activateDatabase('database', await buildDatabase(config.values, 'database'));
  databaseSettings = Object.fromEntries(settings);
  nextMaintenanceAt = 0;
}

function workerFailure(error) {
  // A runtime wrapper can attach the PostgreSQL error as its cause.
  const code = [error?.code, error?.cause?.code].find(value =>
    typeof value === 'string' && /^(?:[0-9A-Z]{5}|E[A-Z0-9_]+|WORKER_SETTINGS_UNAVAILABLE|WORKER_SUPABASE_CONFIGURATION)$/.test(value));
  const hints = {
    '42P01': 'Verify that integration schema migration 028 is applied to the active CMS database.',
    '42703': 'The active CMS database integration schema differs from the worker version.',
    '42501': 'Check the worker database role permissions on the integration tables.',
    '28P01': 'Check the credentials in the CMS Supabase connection string.',
    '28000': 'Check the identity and access of the CMS Supabase database role.',
    WORKER_SETTINGS_UNAVAILABLE: 'Check the backend settings database connection.',
      WORKER_SUPABASE_CONFIGURATION: 'Set a valid CMS_SUPABASE_DATABASE_URL in the server environment and restart the worker.',
    vault_unavailable: 'Configure the existing INTEGRATION_VAULT_KEYS and INTEGRATION_VAULT_VERSION and restart the worker.',
  };
  const timeout = [error, error?.cause].some(value => /^(query read timeout|timeout exceeded when trying to connect|connection terminated due to connection timeout)$/i.test(value?.message || ''));
  if (!code && timeout) return { code: 'database_timeout', hint: 'Check for a database lock or an exhausted connection pool.' };
  const reason = code || safeCode(error);
  return { code: reason, hint: hints[reason] };
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());
if (process.send) {
  process.once('disconnect', () => controller.abort());
  if (!process.connected) controller.abort();
}
let startupStage = 'supabase_configuration';
try {
  const managed = Boolean(process.send) && process.argv.includes('--after-api-ready');
  let attempts = 0, retryMs = 1000;
  while (!managed && !controller.signal.aborted) {
    try {
      const setup = await ensureSupabaseConfigured({ interactive: false });
      await checkBetterGetafeSchema(setup.url);
      console.info('[Supabase] Better Getafe database ready for integration worker.');
      break;
    } catch (error) {
      if (!error.retryable || rotateVault || ++attempts >= 3) throw error;
      console.warn(JSON.stringify({ event: 'integration_worker_waiting_for_database', hint: error.message, retryMs }));
      await pause(retryMs, undefined, { signal: controller.signal }).catch(() => {});
      retryMs = Math.min(60000, retryMs * 2);
    }
  }
  if (controller.signal.aborted) process.exit(0);
  try { supabaseConnectionOptions('database'); }
  catch { throw Object.assign(new Error(), { code: 'WORKER_SUPABASE_CONFIGURATION' }); }
  startupStage = 'vault_configuration';
  integrationHub.vault.keys();
  if (rotateVault) {
    startupStage = 'rotate_vault';
    await refreshDatabase();
    const count = await integrationHub.repo.rotateVault(integrationHub.vault);
    console.info(JSON.stringify({ event: 'integration_vault_rotated', installations: count }));
    controller.abort();
  }
  while (!controller.signal.aborted) {
    let stage = 'refresh_database';
    try {
      await refreshDatabase();
      if (Date.now() >= nextMaintenanceAt) {
        try {
          await integrationHub.repo.maintenance();
          nextMaintenanceAt = Date.now() + 3600000;
        } catch (error) {
          if (controller.signal.aborted) break;
          if (error.code === 'MIGRATION_WRITE_PAUSED') throw error;
          nextMaintenanceAt = Date.now() + 300000;
          console.warn(JSON.stringify({ event: 'integration_worker_maintenance_failed', workerId, ...workerFailure(error) }));
        }
      }
      stage = 'claim';
      const job = await integrationHub.repo.claim(workerId);
      if (migrationPaused) console.info(JSON.stringify({ event: 'integration_worker_resumed_after_migration', workerId }));
      migrationPaused = false;
      stage = 'run';
      if (job) await integrationHub.run(job, controller.signal);
      else await pause(1000, undefined, { signal: controller.signal });
      if (failureStreak) console.info(JSON.stringify({ event: 'integration_worker_recovered', workerId }));
      failureStreak = 0;
      lastFailure = undefined;
    } catch (error) {
      if (controller.signal.aborted) break;
      if (error.code === 'MIGRATION_WRITE_PAUSED') {
        if (!migrationPaused) console.info(JSON.stringify({ event: 'integration_worker_paused_for_migration', workerId }));
        migrationPaused = true;
        // Refresh settings before asking for work again. Cutover can change
        // which database owns the job queue.
        await pause(1000, undefined, { signal: controller.signal }).catch(() => {});
        continue;
      }
      const retryMs = Math.min(60000, 5000 * 2 ** Math.min(failureStreak++, 4));
      const failure = workerFailure(error);
      const now = Date.now();
      if (lastFailure?.stage !== stage || lastFailure.code !== failure.code || now - lastFailure.at >= 300000) {
        console.error(JSON.stringify({ event: 'integration_worker_degraded', workerId, stage, ...failure, retryMs }));
        lastFailure = { stage, code: failure.code, at: now };
      }
      await pause(retryMs, undefined, { signal: controller.signal }).catch(() => {});
    }
  }
} catch (error) {
  console.error(JSON.stringify({ event: 'integration_worker_startup_failed', stage: startupStage, ...workerFailure(error) }));
  process.exitCode = startupStage.endsWith('_configuration') ? 78 : 1;
}
finally { await Promise.allSettled([closeDatabaseConnection(), closeRedis(), closeConfigStore()]); }
