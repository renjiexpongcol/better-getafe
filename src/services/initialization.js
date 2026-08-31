import { getCmsPool, getPortalPool } from './cloudSql.js';
import { initializeStorage } from './storage.js';

export const serviceStatus = {
  cmsDatabase: 'pending',
  portalDatabase: 'pending',
  storage: 'pending'
};

function withTimeout(promise, timeout, name) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${name} initialization timed out after ${timeout}ms`)),
        timeout
      )
    )
  ]);
}

export async function initializeServices() {
  const INITIALIZATION_TIMEOUT = 10000;
  const isProd = process.env.NODE_ENV === 'production';

  // 1. Initialize Portal Users Cloud SQL
  if ((process.env.PORTAL_DATABASE_PROVIDER || process.env.USER_DATABASE_PROVIDER || "local") === "gcp") {
    try {
      const portalPool = await getPortalPool();
      if (!portalPool) throw new Error("Portal pool could not be established");
      await withTimeout(portalPool.execute("SELECT 1"), INITIALIZATION_TIMEOUT, 'Portal database');
      serviceStatus.portalDatabase = 'connected';
    } catch (err) {
      serviceStatus.portalDatabase = 'failed';
      if (isProd) throw err;
      console.error("⚠ Portal database initialization failed:", err.message || err);
    }
  } else {
    serviceStatus.portalDatabase = 'local';
    if (isProd) throw new Error("Portal database must use GCP in production");
  }

  // 2. Initialize CMS Cloud SQL
  if ((process.env.CMS_DATABASE_PROVIDER || "local") === "gcp") {
    try {
      const cmsPool = await getCmsPool();
      if (!cmsPool) throw new Error("CMS pool could not be established");
      await withTimeout(cmsPool.execute("SELECT 1"), INITIALIZATION_TIMEOUT, 'CMS database');
      serviceStatus.cmsDatabase = 'connected';
    } catch (err) {
      serviceStatus.cmsDatabase = 'failed';
      if (isProd) throw err;
      console.error("⚠ CMS database initialization failed:", err.message || err);
    }
  } else {
    serviceStatus.cmsDatabase = 'local';
    if (isProd) throw new Error("CMS database must use GCP in production");
  }

  // 3. Initialize Cloud Storage
  if ((process.env.CMS_MEDIA_PROVIDER || "local") === "gcp") {
    try {
      await withTimeout(initializeStorage(), INITIALIZATION_TIMEOUT, 'Cloud Storage');
      serviceStatus.storage = 'connected';
    } catch (err) {
      serviceStatus.storage = 'failed';
      if (isProd) throw err;
      console.error("⚠ Cloud Storage initialization failed:", err.message || err);
    }
  } else {
    serviceStatus.storage = 'local';
    if (isProd) throw new Error("Cloud Storage must use GCP in production");
  }
}
