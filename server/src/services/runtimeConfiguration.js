import { buildDatabase, activateDatabase, discardDatabase } from './database.js';
import { buildStorage, activateStorage, getVerifiedAzureStatus, storageHealth } from './storage.js';
import { buildEmail, activateEmail } from './email.js';
import { config } from '../config/index.js';
import { dependencyReason } from './startupDiagnostics.js';
import { storageJournalUnavailable } from './storageSelection.js';
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
  const storageValues = values;
  const activeStorageChanged = ['provider', ...(storageKeys[storageValues['storage.provider']] || [])]
    .some(key => values[`storage.${key}`] !== previous[`storage.${key}`]);
  if (!initialized || activeStorageChanged || storageHealth().status !== 'healthy' || storageJournalUnavailable()) {
    operations.push(async () => {
      if (context.initializing) console.info('[STARTUP 6/8] Initializing media storage');
      const start = Date.now();
      const requestedProvider = storageValues['storage.provider'] || 'unknown';
      const providerLabel = requestedProvider === 'backblaze' ? 'backblaze-b2' : requestedProvider;
      const azureAuthentication = requestedProvider === 'azure' ? storageValues['storage.azureAuthentication'] : null;
      const credentialSource = requestedProvider !== 'azure' ? null
        : azureAuthentication === 'managed-identity' ? 'managed-identity'
          : storageValues['storage.azureConnectionString']
            ? (config.sources?.['storage.azureConnectionString'] === 'environment' ? 'environment' : 'saved-setting')
            : 'missing';
      console.info(JSON.stringify({ event: 'storage_provider_selected', provider: providerLabel, provider_source: config.sources?.['storage.provider'] || 'runtime', authentication: azureAuthentication, credential_source: credentialSource, migration_verified: Boolean(verifiedCutover) }));
      console.info(`[Storage] Selected provider: ${providerLabel}; verifying connection`);
      let storage;
      try { storage = await buildStorage(storageValues, { allowUnavailable: !context.actor, startupCheck: true, verifiedCutover }); }
      catch (error) {
        if (context.actor && activeStorageChanged) throw error;
        console.error(`[STARTUP][MEDIA_STORAGE] FAILED Provider: ${providerLabel} Required: false Reason: ${dependencyReason(error)}`);
        storage = { provider: 'degraded', configuredProvider: requestedProvider, client: null, degraded: true, failureReason: dependencyReason(error) };
      }
      console.info(`[Storage] ${providerLabel}: ${storage.degraded ? 'degraded' : 'connection verified'}`);
      return { activate: () => { activateStorage(storage); systemStatus.storage = { status: storage.degraded ? 'degraded' : 'connected', reason: storage.failureReason, provider: providerLabel, configuredProvider: requestedProvider, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start }; }, discard: async () => storage.client?.destroy?.() };
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
