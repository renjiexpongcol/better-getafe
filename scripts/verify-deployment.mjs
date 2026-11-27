import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizedNpmEnvironment } from './vercel-npm.mjs';
import { deploymentConfiguration } from '../server/src/config/deployment.js';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const report = { checks: [], runtime: 'not verified by compilation', productionPromotionAllowed: false };
const env = normalizedNpmEnvironment();
const run = (name, args, { quiet = false } = {}) => {
  const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', timeout: 180000, maxBuffer: 20 * 1024 * 1024, windowsHide: true });
  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  report.checks.push({ name, passed: !result.error && result.status === 0 });
  if (result.error || result.status !== 0) throw new Error(`${name} failed.`);
};
try {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Deployment validation requires Node 24.x.');
  run('application/API/SQL dependency discovery', ['scripts/discover-system.mjs']);
  run('complete schema reference and migration checksum binding', ['scripts/check-schema-manifest.mjs']);
  run('source, export, dependency, casing and ignore audit', ['scripts/audit-dependencies.mjs']);
  run('production API imports and route registration', ['scripts/smoke-runtime.mjs']);
  run('resident exports, npm configuration and API routing contracts', ['--test', 'scripts/test-deployment-contracts.mjs']);
  let syntaxFiles = 0;
  async function syntax(directory) {
    for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
      if (['node_modules', 'data', '.cache'].includes(entry.name)) continue;
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await syntax(file);
      else if (/\.(?:js|mjs)$/.test(file)) { run(`syntax ${file}`, ['--check', file], { quiet: true }); syntaxFiles++; }
    }
  }
  await syntax('server'); await syntax('api');
  run('root backend syntax', ['--check', 'server.js'], { quiet: true });
  console.info(`[Validation] Checked ${syntaxFiles + 1} backend/function files.`);
  const environmentFiles = (await fs.readdir(root)).filter(name => name.startsWith('.env'));
  const clientKeys = new Set(Object.keys(env).filter(key => key.startsWith('VITE_')));
  for (const file of environmentFiles) {
    const text = await fs.readFile(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/^\s*(VITE_[A-Z0-9_]+)\s*=/gm)) clientKeys.add(match[1]);
  }
  if ([...clientKeys].some(key => /SECRET|PASSWORD|CONNECTION_STRING|DATABASE_URL|SERVICE_ROLE|PRIVATE_KEY|REDIS_URL/.test(key))) throw new Error('A server credential has a browser-visible VITE_ name.');
  run('repository credential scan', ['scripts/audit-secrets.mjs']);
  const secretScan = JSON.parse(await fs.readFile(path.join(root, 'artifacts/production-readiness/secret-scan.json'), 'utf8'));
  if (secretScan.candidates.some(candidate => !candidate.fixturePossible)) throw new Error('Review credential-scan candidates before deployment. Values are not included in the report.');
  if (process.argv.includes('--runtime')) {
    const runtime = deploymentConfiguration({ ...env, VERCEL: '1' });
    if (runtime.errors.length) throw new Error('Runtime configuration is incomplete; required settings must be verified before promotion.');
    report.runtime = 'bootstrap settings structurally valid; live service checks still required';
  }
  run('production frontend compilation', ['scripts/build-frontend.mjs']);
  const protectedNames = /^(?:(?:MY_PREFIX_)?POSTGRES_(?:URL(?:_NON_POOLING|_PRISMA)?|PRISMA_URL|PASSWORD)|(?:MY_PREFIX_)?SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY|JWT_SECRET)|AUTH_SESSION_SECRET|CMS_SESSION_SECRET|SESSION_SECRET|SETTINGS_ENCRYPTION_KEY|MFA_ENCRYPTION_KEY|DATABASE_URL|CMS_SUPABASE_DATABASE_URL|MY_REDIS_REDIS_URL|REDIS_URL|AZURE_STORAGE_CONNECTION_STRING|GOOGLE_CLIENT_SECRET|OPENAI_API_KEY|B2_APPLICATION_KEY|SMTP_PASSWORD)$/;
  const protectedValues = Object.entries(env).filter(([key, value]) => protectedNames.test(key) && value.length >= 16 && !/SENSITIVE|replace-with|fixture|example/i.test(value));
  async function inspect(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await inspect(file);
      else if (/\.(?:html|js|css|json)$/.test(file)) {
        const content = await fs.readFile(file, 'utf8');
        if (protectedValues.some(([, value]) => content.includes(value))) throw new Error('A protected environment value appears in the browser build.');
      }
    }
  }
  await inspect(path.join(root, 'dist'));
  report.browserSecrets = 'no protected injected values found; public VITE_ names checked';
  report.status = 'passed';
  console.info('[Validation] Deployment source and production build checks passed. Runtime service verification remains a separate promotion gate.');
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  console.error(`[Validation] ${error.message}`);
  process.exitCode = 1;
} finally {
  await fs.mkdir(path.join(root, 'artifacts/deployment-fix'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts/deployment-fix/validation.json'), JSON.stringify(report, null, 2));
}
