import "dotenv/config";
import { config } from "../server/src/config/index.js";
import {
  initializeStorage,
  ensureCitizenStoragePrivate,
} from "../server/src/services/storage.js";
import { closeConfigStore } from "../server/src/config/DatabaseSettingsProvider.js";
let resource;
try {
  await config.load();
  resource = await initializeStorage();
  await ensureCitizenStoragePrivate();
  console.log("E-service private bucket ACL verified.");
} catch (error) {
  console.error(
    "E-service private storage check failed:",
    error.code || error.name,
  );
  process.exitCode = 1;
} finally {
  resource?.client?.destroy();
  await closeConfigStore();
}
