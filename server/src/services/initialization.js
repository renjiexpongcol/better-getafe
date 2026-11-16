import { config } from '../config/index.js';
import { prepareRuntime, systemStatus } from './runtimeConfiguration.js';
import { storageHealth } from './storage.js';
import { syncVerifiedAzureCutover } from './mediaMigration.js';
export const serviceStatus = {
  get cmsDatabase() { return systemStatus.database?.status || 'pending'; },
  get portalDatabase() { return systemStatus.portalDatabase?.status || 'pending'; },
  get storage() { return storageHealth().status === 'healthy' ? 'connected' : 'degraded'; },
};
export async function initializeServices() {
  config.prepare = prepareRuntime;
  await config.load(true);
  await syncVerifiedAzureCutover({ force: true }).catch(error => {
    if (error.code !== '42P01' && serviceStatus.cmsDatabase === 'connected') throw error;
  });
}
