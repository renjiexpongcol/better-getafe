import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { ensureSupabaseConfigured, writeCmsUrlToEnv, verifySupabaseConnection, checkBetterGetafeSchema, selectedCmsUrl, askLine } from '../server/src/config/supabaseSetup.js';
import { supabaseConnectionOptions } from '../server/src/services/postgres.js';

const URL = 'postgresql://postgres:secret-value@db.example.supabase.co:5432/postgres?sslmode=require';

test('first run verifies hidden input and edits only the canonical .env variable', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getafe-supabase-setup-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const envFile = path.join(directory, '.env');
  const original = 'APP_NAME=Getafe\r\nSUPABASE_DATABASE_URL=postgresql://old-safe-value\r\nOTHER=value\r\n';
  await fs.writeFile(envFile, original);
  let verified = 0, saved = 0;
  const output = [];
  const result = await ensureSupabaseConfigured({
    env: {}, interactive: true, envFile,
    askForUrl: async () => URL,
    confirm: async () => { saved++; return true; },
    verify: async candidate => { verified++; assert.equal(candidate, URL); },
    print: message => output.push(message),
    save: writeCmsUrlToEnv,
  });
  assert.equal(result.saved, true);
  assert.equal(verified, 1);
  assert.equal(saved, 1);
  assert.equal(result.url, URL);
  assert.ok(!output.join('\n').includes(URL));
  assert.ok(!output.join('\n').includes('secret-value'));
  const updated = await fs.readFile(envFile, 'utf8');
  assert.match(updated, /^APP_NAME=Getafe\r\nSUPABASE_DATABASE_URL=postgresql:\/\/old-safe-value\r\nOTHER=value\r\nCMS_SUPABASE_DATABASE_URL=.*\r\n$/);
  assert.ok(updated.includes(URL));
});

test('existing canonical URL wins without prompting', async () => {
  let prompted = false, verified = 0;
  const env = { CMS_SUPABASE_DATABASE_URL: URL, SUPABASE_DATABASE_URL: 'unused' };
  const result = await ensureSupabaseConfigured({ env, interactive: true,
    askForUrl: async () => { prompted = true; return null; }, verify: async () => { verified++; }, print() {} });
  assert.equal(prompted, false);
  assert.equal(verified, 1);
  assert.equal(result.source, 'environment');
});

test('only the canonical CMS Supabase URL is accepted', () => {
  assert.equal(selectedCmsUrl({ CMS_SUPABASE_DATABASE_URL: URL, SUPABASE_DATABASE_URL: 'unused' }), URL);
  assert.equal(selectedCmsUrl({ CMS_SUPABASE_DATABASE_URL: '  ', SUPABASE_DATABASE_URL: URL }), '');
  assert.throws(() => supabaseConnectionOptions('portalDatabase', { PORTAL_SUPABASE_DATABASE_URL: URL }), /CMS_SUPABASE_DATABASE_URL/);
  const normalized = new globalThis.URL(URL);
  normalized.searchParams.delete('sslmode');
  assert.equal(supabaseConnectionOptions('portalDatabase', { CMS_SUPABASE_DATABASE_URL: URL }).connectionString, normalized.toString());
  assert.throws(() => supabaseConnectionOptions('database', {
    DATABASE_URL: 'postgresql://localhost/getafe_portal',
    DB_HOST: '127.0.0.1', DB_NAME: 'getafe_portal', DB_USER: 'getafe_app', DB_PASSWORD: 'unused',
  }), /CMS_SUPABASE_DATABASE_URL/);
});

test('Supabase uses TLS encryption and enables CA verification for explicit verify modes', () => {
  const options = supabaseConnectionOptions('database', { CMS_SUPABASE_DATABASE_URL: URL });
  assert.equal(options.ssl.rejectUnauthorized, false);
  assert.ok(!options.connectionString.includes('sslmode='));
  const encrypted = supabaseConnectionOptions('database', { CMS_SUPABASE_DATABASE_URL: URL.replace('?sslmode=require', '') });
  assert.equal(encrypted.ssl.rejectUnauthorized, false);
  const strict = supabaseConnectionOptions('database', { CMS_SUPABASE_DATABASE_URL: URL.replace('sslmode=require', 'sslmode=verify-full') });
  assert.equal(strict.ssl.rejectUnauthorized, true);
});

test('retry confirmation prompt returns a Promise and reads a terminal answer', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const answer = askLine('Try again? ', { input, output });
  input.write('n\n');
  assert.equal(await answer, 'n');
  input.destroy();
  output.destroy();
});

test('failed credentials can be retried or cancelled without writing .env', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getafe-supabase-failure-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const envFile = path.join(directory, '.env');
  await fs.writeFile(envFile, 'APP_NAME=Untouched\n');
  const env = {};
  const output = [];
  const result = await ensureSupabaseConfigured({ env, interactive: true, envFile,
    askForUrl: async () => URL,
    verify: async () => { throw new Error('Supabase rejected the database credentials.'); },
    confirm: async () => false, print: message => output.push(message),
    save: async () => { throw new Error('must not save'); },
  });
  assert.equal(result.cancelled, true);
  assert.deepEqual(env, {});
  assert.equal(await fs.readFile(envFile, 'utf8'), 'APP_NAME=Untouched\n');
  assert.ok(output.some(message => message.includes('rejected the database credentials')));
  assert.ok(!output.join('\n').includes(URL));
});

test('retrying can succeed and use the verified URL for this run without saving', async () => {
  let prompts = 0, checks = 0;
  const env = {};
  const result = await ensureSupabaseConfigured({ env, interactive: true,
    askForUrl: async () => { prompts++; return URL; },
    verify: async () => { if (++checks === 1) throw new Error('The Supabase database host is unreachable.'); },
    confirm: async () => ++prompts === 2,
    print() {},
    save: async () => assert.fail('Save was declined'),
  });
  assert.equal(result.saved, false);
  assert.equal(result.url, URL);
  assert.equal(env.CMS_SUPABASE_DATABASE_URL, URL);
  assert.equal(checks, 2);
});

test('cancellation leaves the environment untouched', async () => {
  const env = {};
  const result = await ensureSupabaseConfigured({ env, interactive: true, askForUrl: async () => null, print() {} });
  assert.equal(result.cancelled, true);
  assert.deepEqual(env, {});
});

test('non-interactive startup fails with canonical server environment instructions', async () => {
  let prompted = false;
  await assert.rejects(ensureSupabaseConfigured({ env: {}, interactive: false,
    askForUrl: async () => { prompted = true; return URL; }, print() {} }), /CMS_SUPABASE_DATABASE_URL.*server environment or backend \.env/);
  assert.equal(prompted, false);
});

test('invalid URL is reported safely and does not write .env', async () => {
  const env = {};
  const output = [];
  const result = await ensureSupabaseConfigured({ env, interactive: true, askForUrl: async () => 'not-a-url', confirm: async () => false, print: message => output.push(message), save: async () => assert.fail('must not save') });
  assert.equal(result.cancelled, true);
  assert.ok(output.some(message => message.startsWith('Invalid Supabase PostgreSQL URL.')));
  assert.ok(!output.join('\n').includes('not-a-url'));
});

test('read-only URL validation and connection errors do not expose the URL', async () => {
  class RejectingClient {
    constructor() {}
    async connect() { throw Object.assign(new Error('password authentication failed'), { code: '28P01' }); }
    async end() {}
  }
  await assert.rejects(verifySupabaseConnection(URL, { ClientClass: RejectingClient }), /rejected the database credentials/);
  await assert.rejects(verifySupabaseConnection('not-a-url'), error => {
    assert.match(error.message, /Invalid Supabase PostgreSQL URL/);
    assert.ok(!error.message.includes('not-a-url'));
    return true;
  });
});

test('schema readiness is separate from connection verification', async () => {
  class EmptySchemaPool {
    constructor() {}
    async query(sql) {
      if (sql.includes('information_schema.tables')) return { rows: [] };
      if (sql.includes('to_regclass')) return { rows: [{ name: null }] };
      throw new Error('unexpected query');
    }
    async end() {}
  }
  await assert.rejects(checkBetterGetafeSchema(URL, { PoolClass: EmptySchemaPool }), error => {
    assert.match(error.message, /connection verified, but Better Getafe schema is not ready/i);
    assert.match(error.message, /npm run migrate:postgres/);
    return true;
  });
});

test('complete Better Getafe schema and migration journal report database ready', async () => {
  const tables = ['users', 'categories', 'news', 'media', 'media_uploads', 'portal_users', 'system_settings', 'settings_lock', 'audit_logs'];
  const migrations = (await fs.readdir(new globalThis.URL('../database/migrations/postgresql/', import.meta.url))).filter(file => /^\d+.*\.sql$/.test(file));
  class ReadySchemaPool {
    constructor() {}
    async query(sql) {
      if (sql.includes('information_schema.tables')) return { rows: tables.map(table_name => ({ table_name })) };
      if (sql.includes('to_regclass')) return { rows: [{ name: 'schema_migrations' }] };
      if (sql.includes('SELECT version')) return { rows: migrations.map(version => ({ version })) };
      throw new Error('unexpected query');
    }
    async end() {}
  }
  await assert.doesNotReject(checkBetterGetafeSchema(URL, { PoolClass: ReadySchemaPool }));
});
