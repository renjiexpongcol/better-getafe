import { buildDatabase, activateDatabase, discardDatabase } from './cloudSql.js';
import { buildStorage, activateStorage } from './storage.js';
import { buildEmail, activateEmail } from './email.js';
export const systemStatus = {};
let initialized = false;
function changed(prefix, next, previous) { return Object.keys(next).some(key => key.startsWith(`${prefix}.`) && next[key] !== previous[key]); }
export async function prepareRuntime(values, previous, context = {}) {
  if ((values['authentication.mfaEnabled'] || values['authentication.requireEmailVerification']) && !values['email.enabled']) throw new Error('Enable and configure SMTP before requiring email verification or sign-in codes.');
  const prepared = [];
  try {
    for (const category of ['database', 'portalDatabase']) {
      // A failed/absent database must not block an unrelated SMTP or Storage
      // update. Reconnect only during startup or when that category changed.
      if (context.initializing || changed(category, values, previous)) {
        const start = Date.now();
        const resource = await buildDatabase(values, category, context.actor);
        prepared.push({ activate: () => { activateDatabase(category, resource); systemStatus[category] = { status: resource ? 'connected' : 'local', checkedAt: new Date().toISOString(), latencyMs: Date.now() - start }; }, discard: () => discardDatabase(resource) });
      }
    }
    if (!initialized || changed('storage', values, previous)) {
      const start = Date.now();
      let storage;
      try { storage = await buildStorage(values); }
      catch (error) {
        if (context.initializing && values['storage.provider'] === 'backblaze') {
          console.error('[STARTUP] Backblaze B2 initialization failed; local storage fallback is disabled.');
          systemStatus.storage = { status: 'degraded', provider: 'backblaze-b2', checkedAt: new Date().toISOString() };
        }
        throw error;
      }
      prepared.push({ activate: () => { activateStorage(storage); systemStatus.storage = { status: 'connected', provider: storage.provider, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start }; }, discard: async () => storage.client?.destroy() });
    }
    if (!initialized || changed('email', values, previous)) {
      const start = Date.now(), email = await buildEmail(values);
      prepared.push({ activate: () => { activateEmail(email); systemStatus.email = { status: email ? 'connected' : 'disabled', checkedAt: new Date().toISOString(), latencyMs: Date.now() - start }; }, discard: async () => email?.close() });
    }
    return { activate: () => { for (const item of prepared) item.activate(); initialized = true; }, discard: async () => { await Promise.allSettled(prepared.map(item => item.discard())); } };
  } catch (error) { await Promise.allSettled(prepared.map(item => item.discard())); throw error; }
}
