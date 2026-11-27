import { spawnSync } from 'node:child_process';
import { repositoryRoot } from './dependency-preflight.mjs';

// A real production import graph with no network access, credentials or dev
// tooling. Also run this after npm ci --omit=dev in CI.
const script = `
  const assert = (await import('node:assert/strict')).default;
  globalThis.setInterval = () => { throw Error('Permanent timer started during function import'); };
  const pg = await import('pg');
  assert.equal(typeof pg.Client, 'function'); assert.equal(typeof pg.Pool, 'function');
  const setup = await import('./server/src/config/supabaseSetup.js');
  assert.equal(typeof setup.ensureSupabaseConfigured, 'function');
  for (const [name, symbol] of [['@azure/storage-blob','BlobServiceClient'], ['@azure/identity','ManagedIdentityCredential'], ['redis','createClient'], ['express','default'], ['openai','default'], ['nodemailer','createTransport']]) {
    assert.equal(typeof (await import(name))[symbol], 'function', name + ' ESM export');
  }
  const {default:app} = await import('./server/index.js');
  assert.equal(typeof app, 'function');
  console.log('PASS: pg named ESM imports, Azure, Redis, Express, OpenAI, SMTP and the production API import graph.');
`;
const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
  cwd: repositoryRoot, encoding: 'utf8', timeout: 20000, windowsHide: true,
  env: { SystemRoot: process.env.SystemRoot, NODE_OPTIONS:'--experimental-require-module', NODE_ENV: 'production', PORTAL_SERVERLESS: 'true', AUTH_SESSION_SECRET: 'isolated-runtime-import-fixture-without-cloud-credentials' },
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.status !== 0) console.error('[Dependencies] Production runtime import failed. Run npm ci from the repository root, then rerun npm run check:runtime and npm run audit:dependencies.');
// This subprocess has no infrastructure secrets; its module diagnostics are safe.
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.error || result.status !== 0 ? 1 : 0;
