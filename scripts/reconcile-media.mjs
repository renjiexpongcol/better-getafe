import { initializeServices } from '../server/src/services/initialization.js';
import { closeCloudSql } from '../server/src/services/cloudSql.js';
import { closeConfigStore } from '../server/src/config/DatabaseSettingsProvider.js';
import { reconcileMedia } from '../server/src/services/mediaMaintenance.js';

const apply = process.argv.includes('--apply');

try {
  await initializeServices();
  const report = await reconcileMedia({ apply });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...report }, null, 2));
  if (!apply && report.duplicates.length) console.log('Re-run with --apply only after reviewing the duplicate list.');
} finally {
  await closeCloudSql().catch(() => {});
  await closeConfigStore().catch(() => {});
}
