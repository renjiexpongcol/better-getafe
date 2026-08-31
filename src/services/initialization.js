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
  console.log("→ Initializing application services...");

  const INITIALIZATION_TIMEOUT = 10000;

  // 1. Initialize Portal Users Cloud SQL
  if ((process.env.PORTAL_DATABASE_PROVIDER || process.env.USER_DATABASE_PROVIDER || "local") === "gcp") {
    try {
      console.log("→ Initializing Portal database...");
      const portalPool = await getPortalPool();
      await withTimeout(portalPool.execute("SELECT 1"), INITIALIZATION_TIMEOUT, 'Portal database');
      serviceStatus.portalDatabase = 'connected';
      console.log("✓ Portal database connected");
    } catch (err) {
      serviceStatus.portalDatabase = 'failed';
      console.error("⚠ Portal database initialization failed:", err.message || err);
    }
  } else {
    serviceStatus.portalDatabase = 'local';
  }

  // 2. Initialize CMS Cloud SQL
  if ((process.env.CMS_DATABASE_PROVIDER || "local") === "gcp") {
    try {
      console.log("→ Initializing CMS database...");
      const cmsPool = await getCmsPool();
      await withTimeout(cmsPool.execute("SELECT 1"), INITIALIZATION_TIMEOUT, 'CMS database');
      serviceStatus.cmsDatabase = 'connected';
      console.log("✓ CMS database connected");
    } catch (err) {
      serviceStatus.cmsDatabase = 'failed';
      console.error("⚠ CMS database initialization failed:", err.message || err);
    }
  } else {
    serviceStatus.cmsDatabase = 'local';
  }

  // 3. Initialize Cloud Storage
  if ((process.env.CMS_MEDIA_PROVIDER || "local") === "gcp") {
    try {
      console.log("→ Initializing Cloud Storage...");
      await withTimeout(initializeStorage(), INITIALIZATION_TIMEOUT, 'Cloud Storage');
      serviceStatus.storage = 'connected';
      console.log("✓ Cloud Storage verified");
    } catch (err) {
      serviceStatus.storage = 'failed';
      console.error("⚠ Cloud Storage initialization failed:", err.message || err);
    }
  } else {
    serviceStatus.storage = 'local';
  }
}
