import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { migrateMediaToAzure } from '../server/src/services/azureMediaCopy.js';
export { migrateMediaToAzure } from '../server/src/services/azureMediaCopy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function runCli() {
  dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
  const args = process.argv.slice(2);
  const manifestIndex = args.indexOf('--manifest');
  const manifestPath = manifestIndex >= 0 ? args[manifestIndex + 1] : null;
  const copy = args.includes('--copy');
  const audit = args.includes('--audit-references');
  if (manifestIndex >= 0 && (!manifestPath || manifestPath.startsWith('--'))) throw new Error('Provide a file path after --manifest.');
  const { config } = await import('../server/src/config/index.js');
  const { prepareRuntime } = await import('../server/src/services/runtimeConfiguration.js');
  const { ensureSupabaseConfigured, checkBetterGetafeSchema } = await import('../server/src/config/supabaseSetup.js');
  const setup = await ensureSupabaseConfigured();
  if (setup.cancelled) return;
  await checkBetterGetafeSchema(setup.url);
  config.prepare = prepareRuntime;
  await config.load(true);
  const lines = [];
  const result = await migrateMediaToAzure({ copy }, {
    settings: config.values,
    onStage: stage => { console.info(`[Migration] ${stage}.`); },
    onRecord: record => { lines.push(record); },
  });
  if (manifestPath) {
    const target = path.resolve(manifestPath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, lines.map(line => JSON.stringify(line)).join('\n') + '\n', { mode: 0o600 });
    console.info(`[Migration] Manifest saved to ${target}. Object keys may identify private media; store it securely.`);
  }
  if (audit) {
    const { auditAzureMigrationReferences } = await import('../server/src/services/mediaMigration.js');
    const cms = await (await import('../server/src/services/database.js')).getCmsPool();
    const findings = await auditAzureMigrationReferences(result.verifiedKeys, config.values['storage.bucket'], config.values, cms);
    console.info(`[Migration] PostgreSQL reference findings: ${findings.findings.reduce((sum, item) => sum + item.count, 0)}.`);
  }
  console.info(`[Migration] Summary: ${JSON.stringify(result.totals)}`);
  if (result.totals.missing || result.totals.unresolved) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch(error => {
    console.error(`[Migration] ${error.message}`);
    process.exitCode = 1;
  });
}
