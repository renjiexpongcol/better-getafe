import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitKeypressEvents } from 'node:readline';
import { createInterface as createPromiseInterface } from 'node:readline/promises';
import { Client, Pool } from 'pg';
import dotenv from 'dotenv';
import { getSupabaseDatabaseUrl, supabaseConnectionOptions } from '../services/postgres.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const localEnvPath = path.join(ROOT, '.env');

export function isInteractiveLocal(env = process.env, input = process.stdin, output = process.stdout) {
  return env.NODE_ENV !== 'production' && env.CI !== 'true' && env.CI !== '1' && Boolean(input.isTTY && output.isTTY && input.setRawMode);
}

export function selectedCmsUrl(env = process.env) {
  return getSupabaseDatabaseUrl(env).url;
}

function resolverOptions(url) {
  try {
    return supabaseConnectionOptions('database', { CMS_SUPABASE_DATABASE_URL: url });
  } catch {
    throw new Error('Invalid Supabase PostgreSQL URL. Copy a PostgreSQL connection string from Supabase → Connect and include the database password.');
  }
}

export function connectionFailure(error) {
  const code = error?.code || error?.cause?.code;
  if (['28P01', '28000'].includes(code)) return 'Supabase rejected the database credentials. Check the database password in the connection string.';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) return 'The Supabase database host is unreachable. Check the copied hostname and project status; if you are on an IPv4-only network, choose the Session pooler URL in Supabase → Connect.';
  if (/ssl|tls|certificate/i.test(error?.message || '') || ['CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code)) return 'The Supabase TLS handshake failed. Recopy the connection string from Supabase → Connect and check Database → SSL Configuration. For certificate verification, use the project CA certificate with sslmode=verify-full.';
  if (code === '3D000') return 'The Supabase database was not found. Check that the URL names the postgres database for the intended project.';
  return 'The read-only Supabase connection test failed. Check the URL, credentials, TLS settings, and project availability.';
}

function databaseCheckError(error) {
  const failure = new Error(connectionFailure(error));
  const rootCode = error?.code || error?.cause?.code;
  if (rootCode && /^[A-Z0-9_]{2,48}$/.test(String(rootCode))) failure.code = String(rootCode);
  failure.cause = error;
  failure.retryable = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNRESET', '57P03', '53300'].includes(error?.code)
    || /^(timeout expired|query read timeout|timeout exceeded when trying to connect|connection terminated due to connection timeout)$/i.test(error?.message || '');
  return failure;
}

export async function verifySupabaseConnection(url, { ClientClass = Client } = {}) {
  const client = new ClientClass({ ...resolverOptions(url), connectionTimeoutMillis: 7000, query_timeout: 5000, application_name: 'better-getafe-startup-check' });
  try {
    await client.connect();
    const result = await client.query('SELECT 1 AS connection_verified');
    if (Number(result.rows?.[0]?.connection_verified) !== 1) throw new Error('Connection test returned an unexpected result.');
  } catch (error) {
    throw databaseCheckError(error);
  } finally {
    await client.end().catch(() => {});
  }
}

export async function checkBetterGetafeSchema(url, { PoolClass = Pool, pool: existingPool } = {}) {
  const pool = existingPool || new PoolClass({ ...resolverOptions(url), max: 1, connectionTimeoutMillis: 7000, query_timeout: 5000, application_name: 'better-getafe-schema-check' });
  try {
    const result = await pool.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [[
      'users', 'categories', 'news', 'media', 'media_uploads', 'portal_users',
      'system_settings', 'settings_lock', 'audit_logs',
    ]]);
    const found = new Set(result.rows.map(row => row.table_name));
    const missing = ['users', 'categories', 'news', 'media', 'media_uploads', 'portal_users', 'system_settings', 'settings_lock', 'audit_logs']
      .filter(table => !found.has(table));
    const migrationTable = await pool.query("SELECT to_regclass('public.schema_migrations') AS name");
    let missingMigrations = [];
    if (migrationTable.rows[0]?.name) {
      const applied = await pool.query('SELECT version FROM schema_migrations');
      const appliedVersions = new Set(applied.rows.map(row => row.version));
      const migrationDir = path.resolve(ROOT, 'database/migrations/postgresql');
      const expected = (await fs.readdir(migrationDir)).filter(file => /^\d+.*\.sql$/.test(file)).sort();
      missingMigrations = expected.filter(file => !appliedVersions.has(file));
    } else missingMigrations = ['schema_migrations'];
    if (missing.length || missingMigrations.length) {
      const missingTables = missing.length ? ` Missing tables: ${missing.join(', ')}.` : '';
      const migrationGap = missingMigrations.length ? ` Pending schema migrations: ${missingMigrations.slice(0, 8).join(', ')}${missingMigrations.length > 8 ? ', …' : ''}.` : '';
      throw new Error(`Database connection verified, but Better Getafe schema is not ready.${missingTables}${migrationGap} Next step: run npm run migrate:postgres, then run npm run dev again. Schema migration does not copy local records. The retained local PostgreSQL volume is only a backup and is not used during startup.`);
    }
  } catch (error) {
    if (error.message.startsWith('Database connection verified')) throw error;
    throw databaseCheckError(error);
  } finally {
    if (!existingPool) await pool.end().catch(() => {});
  }
}

export function askLine(question, { input = process.stdin, output = process.stdout } = {}) {
  const rl = createPromiseInterface(input, output);
  return rl.question(question).finally(() => rl.close());
}

export async function askHidden(question, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || !input.setRawMode) throw new Error('Hidden input requires an interactive terminal.');
  output.write(question);
  emitKeypressEvents(input);
  const priorRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = result => {
      input.off('keypress', onKey);
      input.setRawMode(Boolean(priorRaw));
      output.write('\n');
      resolve(result);
    };
    const onKey = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(null);
      if (key.name === 'return' || key.name === 'enter') return finish(value.trim());
      if (key.name === 'backspace') { value = value.slice(0, -1); return; }
      if (key.ctrl && key.name === 'u') { value = ''; return; }
      if (character && !key.ctrl && !key.meta && !/[\r\n]/.test(character)) value += character;
    };
    input.on('keypress', onKey);
    input.once('error', reject);
  });
}

export async function writeCmsUrlToEnv(url, file = localEnvPath) {
  let original = '';
  try { original = await fs.readFile(file, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const hadFinalNewline = original.endsWith('\n');
  const lines = original.split(/\r?\n/);
  if (hadFinalNewline) lines.pop();
  const keyLine = /^\s*(?:export\s+)?CMS_SUPABASE_DATABASE_URL\s*=/;
  const replacement = `CMS_SUPABASE_DATABASE_URL=${url}`;
  const index = lines.findLastIndex(line => keyLine.test(line));
  if (index >= 0) {
    lines[index] = replacement;
    for (let i = index - 1; i >= 0; i--) {
      if (keyLine.test(lines[i])) lines.splice(i, 1);
    }
  }
  else lines.push(replacement);
  let updated = lines.join(newline);
  if (hadFinalNewline || original.length === 0) updated += newline;
  await fs.writeFile(file, updated, { mode: 0o600 });
}

export async function ensureSupabaseConfigured({
  env = process.env,
  interactive = isInteractiveLocal(env),
  askForUrl = askHidden,
  confirm = async (message, defaultsYes = true) => /^(?:y|yes)$/i.test((await askLine(`${message} [${defaultsYes ? 'Y/n' : 'y/N'}] `)).trim() || (defaultsYes ? 'y' : 'n')),
  print = message => console.log(message),
  verify = verifySupabaseConnection,
  save = writeCmsUrlToEnv,
  envFile = localEnvPath,
} = {}) {
  if (env === process.env && env.NODE_ENV !== 'production') await loadLocalEnvironment(envFile);
  const url = selectedCmsUrl(env);
  if (url) {
    await verify(url);
    env.CMS_SUPABASE_DATABASE_URL = url;
    return { url, source: 'environment', saved: false };
  }
  if (!interactive) {
    throw new Error('Supabase configuration is missing. Set CMS_SUPABASE_DATABASE_URL in the server environment or backend .env file, then restart. Interactive setup is unavailable in production, CI, and non-interactive terminals.');
  }

  print('Open your Supabase project → Connect → copy a PostgreSQL connection string. Paste it below with your database password filled in.');
  while (true) {
    const candidate = await askForUrl('Supabase PostgreSQL connection string (input hidden; Ctrl+C to cancel): ');
    if (!candidate) return { cancelled: true };
    try {
      resolverOptions(candidate);
      await verify(candidate);
    } catch (error) {
      print(error.message);
      if (!await confirm('Try another connection string?', true)) return { cancelled: true };
      continue;
    }
    print('Connection verified (read-only test).');
    const saveToEnv = await confirm(`Save the verified URL to ${envFile}?`, true);
    if (saveToEnv) {
      try { await save(candidate, envFile); }
      catch { throw new Error(`Connection verified, but .env could not be updated. Save CMS_SUPABASE_DATABASE_URL manually in ${envFile}; the URL value was not written to the console.`); }
      env.CMS_SUPABASE_DATABASE_URL = candidate;
      print(`Saved CMS_SUPABASE_DATABASE_URL to ${envFile}.`);
      return { url: candidate, source: 'prompt', saved: true };
    }
    env.CMS_SUPABASE_DATABASE_URL = candidate;
    print('Using the verified connection for this run only.');
    return { url: candidate, source: 'prompt', saved: false };
  }
}

export async function loadLocalEnvironment(envFile = localEnvPath) {
  dotenv.config({ path: path.join(ROOT, '.env.development.local'), quiet: true });
  dotenv.config({ path: envFile, quiet: true });
}
