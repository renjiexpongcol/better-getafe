import { getCmsPool, getPortalPool } from './cloudSql.js';
import { initializeStorage } from './storage.js';

export async function initializeServices() {
  console.log("Initializing application services...");

  // 1. Initialize Portal Users Cloud SQL
  if ((process.env.PORTAL_DATABASE_PROVIDER || process.env.USER_DATABASE_PROVIDER || "local") === "gcp") {
    try {
      const portalPool = await getPortalPool();
      // Verify connection
      await portalPool.execute("SELECT 1");
      console.log("✓ Portal Cloud SQL connected");
    } catch (err) {
      console.error("✗ Portal Cloud SQL connection failed");
      throw err;
    }
  }

  // 2. Initialize CMS Cloud SQL
  if ((process.env.CMS_DATABASE_PROVIDER || "local") === "gcp") {
    try {
      const cmsPool = await getCmsPool();
      // Verify connection
      await cmsPool.execute("SELECT 1");
      console.log("✓ CMS Cloud SQL connected");
    } catch (err) {
      console.error("✗ CMS Cloud SQL connection failed");
      throw err;
    }
  }

  // 3. Initialize Cloud Storage
  if ((process.env.CMS_MEDIA_PROVIDER || "local") === "gcp") {
    try {
      await initializeStorage();
      console.log("✓ Cloud Storage bucket verified");
    } catch (err) {
      console.error("✗ Cloud Storage bucket initialization failed");
      throw err;
    }
  }
}
