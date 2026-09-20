import { config } from '../config/index.js';
import { prepareRuntime, systemStatus } from './runtimeConfiguration.js';
export const serviceStatus = {
  get cmsDatabase() { return systemStatus.database?.status || 'pending'; },
  get portalDatabase() { return systemStatus.portalDatabase?.status || 'pending'; },
  get storage() { return systemStatus.storage?.status || 'pending'; },
};
export async function initializeServices() { config.prepare = prepareRuntime; await config.load(true); }
