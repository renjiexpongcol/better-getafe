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
      console.info('[Supabase] Connection and Better Getafe schema verified.');
      break;
    } catch (error) {
      if (!error.retryable || attempt >= 3) throw error;
      console.warn('[Supabase] ' + error.message + ' Retrying (' + (attempt + 1) + '/3).');
      await delay(attempt * 1000);
    }
  }
} catch (error) {
  console.error('[Supabase] ' + error.message);
  await closeConfigStore();
  process.exit(1);
}

await import('./server/index.js');
