import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { checkInstalledDependencies } from './dependency-preflight.mjs';

test('Vercel keeps application data modules while excluding root runtime data and secrets', () => {
  const source = spawnSync('git', ['-c', 'core.excludesFile=.vercelignore', 'check-ignore', '--no-index', 'src/data/serviceApplication.js', 'src/data/residentContact.js'], { encoding: 'utf8', windowsHide: true });
  assert.equal(source.status, 1, `Application source must be uploaded: ${source.stdout}`);
  const privateFiles = spawnSync('git', ['-c', 'core.excludesFile=.vercelignore', 'check-ignore', '--no-index', '.env.development.local', 'data/private-upload', 'uploads/private'], { encoding: 'utf8', windowsHide: true });
  assert.equal(privateFiles.status, 0);
  assert.equal(privateFiles.stdout.trim().split(/\r?\n/).length, 3);
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
