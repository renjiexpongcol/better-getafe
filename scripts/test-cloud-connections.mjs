import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { publicSupabaseConfiguration } from './cloud-connections.mjs';
import { outgoingEnvironmentFiles } from './check-push-secrets.mjs';
import { getSupabaseDatabaseUrl, supabaseConnectionOptions } from '../server/src/services/postgres.js';

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getafe-cloud-test-'));
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test('native Marketplace database variables connect without a duplicated project-ref setting', () => {
  const url = 'postgresql://postgres.abcdefghijklmnopqrst:fixture-password@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require';
  const env = { VERCEL: '1', VERCEL_ENV: 'preview', POSTGRES_URL_NON_POOLING: url };
  assert.equal(getSupabaseDatabaseUrl(env).variable, 'POSTGRES_URL_NON_POOLING');
  assert.equal(supabaseConnectionOptions('database', env).ssl.rejectUnauthorized, true);
  assert.throws(() => supabaseConnectionOptions('database', { ...env, SUPABASE_PROJECT_REF: 'anotherproject' }), /must match/);
  assert.throws(() => supabaseConnectionOptions('database', { ...env, POSTGRES_URL_NON_POOLING: url.replace('abcdefghijklmnopqrst', 'wrgbfwexraarwxpoqzpv') }), /isolated/);
  assert.throws(() => supabaseConnectionOptions('database', { ...env, POSTGRES_URL_NON_POOLING: url.replace(':5432', ':6543') }), /Session pooler/);
  assert.equal(getSupabaseDatabaseUrl({ ...env, DATABASE_URL: 'explicit-setting' }).url, 'explicit-setting');
});

test('Marketplace browser mapping exposes only the URL and publishable key', () => {
  const env = { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_public_key', SUPABASE_SECRET_KEY: 'sb_secret_fixture_server_key', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-role', POSTGRES_PASSWORD: 'fixture-password' };
  assert.deepEqual(publicSupabaseConfiguration(env), { url: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY });
  assert.equal(publicSupabaseConfiguration({ SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY }).publishableKey, '');
  assert.throws(() => publicSupabaseConfiguration({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_SECRET_KEY }), /publishable key/);
  assert.throws(() => publicSupabaseConfiguration({ ...env, SUPABASE_URL: 'https://user:fixture@example.invalid' }), /HTTPS origin/);
});

test('database-only entry point never checks schema, starts workers or requires Redis/storage', async t => {
  const directory = await temporary(t);
  await fs.mkdir(path.join(directory, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(directory, 'server/src/config'), { recursive: true });
  await fs.writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  for (const name of ['dev-runner.mjs', 'readiness-probe.mjs']) await fs.copyFile(new URL(name, import.meta.url), path.join(directory, 'scripts', name));
  await fs.writeFile(path.join(directory, 'scripts/dependency-preflight.mjs'), `export function checkInstalledDependencies(options) { if(options.development) throw Error('build tools should not be needed'); } export function reportStartupDependencyError() {}`);
  await fs.writeFile(path.join(directory, 'server/src/config/supabaseSetup.js'), `export async function loadLocalEnvironment() {} export function selectedCmsUrl() { return 'fixture'; } export async function ensureSupabaseConfigured() { console.log('read-only verified'); return {url:'fixture'}; } export function checkBetterGetafeSchema() { throw Error('schema must not be checked'); }`);
  const result = spawnSync(process.execPath, ['scripts/dev-runner.mjs', '--database-only'], { cwd: directory, env: { SystemRoot: process.env.SystemRoot, CI: 'true' }, encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /read-only verified/);
  assert.match(result.stdout, /Schema, Redis, storage and portal initialization were not run/);
});

test('push check finds environment files in earlier outgoing commits even after their deletion', async t => {
  const cwd = await temporary(t);
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  git(['init', '--quiet']);
  git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  const commit = message => { git(['add', '--all']); git(['-c', 'commit.gpgSign=false', 'commit', '--quiet', '-m', message]); return git(['rev-parse', 'HEAD']).trim(); };
  await fs.writeFile(path.join(cwd, '.env.example'), 'DATABASE_URL=\n');
  const base = commit('template');
  assert.deepEqual(outgoingEnvironmentFiles(base, cwd), []);
  await fs.writeFile(path.join(cwd, '.env.development.local'), 'DATABASE_URL=fixture\n');
  const introducing = commit('runtime file');
  await fs.unlink(path.join(cwd, '.env.development.local')); commit('remove runtime file');
  assert.deepEqual(outgoingEnvironmentFiles(base, cwd), [{ commit: introducing, file: '.env.development.local' }]);
});
