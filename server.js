import { setTimeout as delay } from 'node:timers/promises';
import { ensureSupabaseConfigured, checkBetterGetafeSchema, selectedCmsUrl } from './server/src/config/supabaseSetup.js';
import { getConfigPool, closeConfigStore } from './server/src/config/DatabaseSettingsProvider.js';

if (process.send) {
  const disconnected = () => {
    if (process.listenerCount('SIGTERM')) process.emit('SIGTERM');
    else process.exit(0);
  };
  process.once('disconnect', disconnected);
  if (!process.connected) disconnected();
}

try {
  for (let attempt = 1; ; attempt++) {
    try {
      const setup = await ensureSupabaseConfigured({ verify: async url => {
        await checkBetterGetafeSchema(url, selectedCmsUrl(process.env) === url ? { pool: await getConfigPool() } : {});
      } });
      if (setup.cancelled) process.exit(0);
      console.info(JSON.stringify({ event: 'supabase_ready', pid: process.pid, startup_attempt_id: process.env.PORTAL_STARTUP_ATTEMPT_ID || null }));
      break;
    } catch (error) {
      if (!error.retryable || attempt >= 3) throw error;
      const retryMs = attempt * 1000;
      console.warn(JSON.stringify({ event: 'supabase_unavailable', pid: process.pid, startup_attempt_id: process.env.PORTAL_STARTUP_ATTEMPT_ID || null, code: error.code || 'SUPABASE_UNAVAILABLE', reason: error.message, retry: attempt, retry_limit: 3, retry_ms: retryMs }));
      await delay(retryMs);
    }
  }
} catch (error) {
  console.error(JSON.stringify({ event: 'supabase_startup_failed', pid: process.pid, startup_attempt_id: process.env.PORTAL_STARTUP_ATTEMPT_ID || null, code: error.code || 'SUPABASE_UNAVAILABLE', reason: error.message }));
  await closeConfigStore();
  process.exit(1);
}

await import('./server/index.js');
