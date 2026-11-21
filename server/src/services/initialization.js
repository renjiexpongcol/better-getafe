import { config } from '../config/index.js';
import { prepareRuntime, systemStatus } from './runtimeConfiguration.js';
import { storageHealth } from './storage.js';
export const serviceStatus = {
  get cmsDatabase() { return systemStatus.database?.status || 'pending'; },
  get portalDatabase() { return systemStatus.portalDatabase?.status || 'pending'; },
  get storage() { return storageHealth().status === 'healthy' ? 'connected' : 'degraded'; },
};
export async function initializeServices() {
  config.prepare = prepareRuntime;
  await config.load(true);
}
