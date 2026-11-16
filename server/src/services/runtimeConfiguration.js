import { buildDatabase, activateDatabase, discardDatabase } from './database.js';
import { buildStorage, activateStorage, getVerifiedAzureStatus } from './storage.js';
import { buildEmail, activateEmail } from './email.js';
import { dependencyReason } from './startupDiagnostics.js';
export const systemStatus = {};
let initialized = false;
function changed(prefix, next, previous) { return Object.keys(next).some(key => key.startsWith(`${prefix}.`) && next[key] !== previous[key]); }

export async function prepareRuntimeResources(operations) {
  const results = await Promise.allSettled(operations.map(operation => operation()));
  const prepared = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) {
    await Promise.allSettled(prepared.map(resource => resource.discard()));
    throw failed.reason;
  }
  return prepared;
}

export async function prepareRuntime(values, previous, context = {}) {
  if (values['email.enabled'] && (values['authentication.mfaEnabled'] || values['authentication.requireEmailVerification']) && !values['email.senderEmail']) throw new Error('Configure an SMTP sender email before requiring email verification or sign-in codes.');
  const operations = [];
  const databaseKeys = ['connectionLimit', 'connectTimeout', 'idleTimeout'];
  for (const category of ['database', 'portalDatabase']) {
    // A failed/absent database must not block an unrelated SMTP or Storage
    // update. Reconnect only during startup or when that category changed.
    if (context.initializing || databaseKeys.some(key => values[`${category}.${key}`] !== previous[`${category}.${key}`])) {
      operations.push(async () => {
        if (context.initializing && category === 'portalDatabase') console.info('[STARTUP 5/8] Initializing user database');
        const start = Date.now();
        let resource;
        try { resource = await buildDatabase(values, category, context.actor, { allowUnavailable: context.initializing }); }
        catch (error) { error.subsystem = category === 'database' ? 'CMS_DB' : 'USER_DB'; throw error; }
        return { activate: () => { activateDatabase(category, resource); systemStatus[category] = { status: resource.degraded ? 'degraded' : 'connected', reason: resource.failureReason, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start }; }, discard: () => discardDatabase(resource) };
      });
    }
  }
  const storageKeys = {
    azure: ['azureAccount', 'azureContainer', 'azureAuthentication', 'azureConnectionString'],
    backblaze: ['bucket', 'endpoint', 'region', 'keyId', 'applicationKey'],
    local: ['localPath'],
  };
  const verifiedCutover = Boolean(getVerifiedAzureStatus());
  const storageValues = verifiedCutover ? { ...values, 'storage.provider': 'azure' } : values;
  const activeStorageChanged = [...(verifiedCutover ? [] : ['provider']), ...(storageKeys[storageValues['storage.provider']] || [])]
    .some(key => values[`storage.${key}`] !== previous[`storage.${key}`]);
  if (!initialized || activeStorageChanged) {
    operations.push(async () => {
      if (context.initializing) console.info('[STARTUP 6/8] Initializing media storage');
      const start = Date.now();
      let storage;
      try { storage = await buildStorage(storageValues, { allowUnavailable: context.initializing, verifiedCutover }); }
      catch (error) {
        if (!context.initializing || values['storage.provider'] === 'azure') throw error;
        console.error(`[STARTUP][B2] FAILED Required: false Reason: ${dependencyReason(error)}`);
        storage = { provider: 'degraded', client: null, failureReason: dependencyReason(error) };
      }
      return { activate: () => { activateStorage(storage); systemStatus.storage = { status: storage.provider === 'degraded' || storage.degraded ? 'degraded' : 'connected', reason: storage.failureReason, provider: storage.provider, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start }; }, discard: async () => storage.client?.destroy?.() };
    });
  }
  if (!initialized || changed('email', values, previous)) {
    operations.push(async () => {
      const start = Date.now();
      let email, failureReason, failed = false;
      try { email = await buildEmail(values, { allowUnavailable: context.initializing }); }
      catch (error) { if (!context.initializing) throw error; failed = true; failureReason = dependencyReason(error); console.error(`[STARTUP][EMAIL] FAILED Reason: ${failureReason}`); }
      return { activate: () => { activateEmail(email); systemStatus.email = { status: failed || email?.degraded ? 'degraded' : email ? 'connected' : 'disabled', reason: failed ? failureReason : email?.degraded ? email.failureReason : undefined, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start }; }, discard: async () => email?.close() };
    });
  }
  const prepared = await prepareRuntimeResources(operations);
  return { activate: () => { for (const item of prepared) item.activate(); initialized = true; }, discard: async () => { await Promise.allSettled(prepared.map(item => item.discard())); } };
}
