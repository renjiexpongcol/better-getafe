import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { checkInstalledDependencies } from './dependency-preflight.mjs';
import ignore from 'ignore';

test('Vercel keeps application data modules while excluding root runtime data and secrets', async () => {
  // Git's global-excludes emulation is overridden by intentional Git env
  // tracking rules. Deployment filtering evaluates .vercelignore separately.
  const deploymentIgnore = ignore().add(await fs.readFile(new URL('../.vercelignore', import.meta.url), 'utf8'));
  for (const source of ['src/data/serviceApplication.js', 'src/data/residentContact.js']) {
    assert.equal(deploymentIgnore.ignores(source), false, `Application source must be uploaded: ${source}`);
  }
  for (const file of ['.env.development.local', 'data/private-upload', 'uploads/private']) {
    assert.equal(deploymentIgnore.ignores(file), true, `Private/runtime file must stay out of deployment uploads: ${file}`);
  }
});

test('production preflight accepts omitted build tools and development preflight explains their absence', () => {
  const require = createRequire(import.meta.url);
  const resolve = name => { if (name === 'vite') throw new Error('omitted'); return require.resolve(name); };
  assert.doesNotThrow(() => checkInstalledDependencies({ resolve }));
  assert.throws(() => checkInstalledDependencies({ resolve, development: true }), error => error.dependencies.includes('vite') && error.message.includes('npm ci --include=dev'));
  assert.throws(() => checkInstalledDependencies({ version: '26.0.0' }), /Node.js 24.x/);
});

test('dev startup reports missing pg once with root install instructions before database setup', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getafe-missing-driver-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const loader = path.join(directory, 'deny-pg.mjs');
  await fs.writeFile(loader, `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      if (specifier === 'pg') throw Object.assign(new Error("Cannot find package 'pg' imported from " + context.parentURL), { code: 'ERR_MODULE_NOT_FOUND' });
      return next(specifier, context);
    } });
  `);
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(loader).href, 'scripts/dev-runner.mjs'], {
    encoding: 'utf8', timeout: 15000, windowsHide: true,
    env: { SystemRoot: process.env.SystemRoot, NODE_ENV: 'development', CI: 'true' },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[Dependencies\].*pg/);
  assert.match(result.stderr, /npm ci/);
  assert.doesNotMatch(result.stderr, /node:internal|Supabase configuration is missing|restart_scheduled/);
});
