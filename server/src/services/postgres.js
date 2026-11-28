import pg from 'pg';
import { acquirePostgresPool } from './postgresPool.js';
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { installPoolErrorHandler } from './dependencyFailures.js';

const { Pool } = pg;
export const DATABASE_MIGRATION_FREEZE_LOCK_ID = 69218437;

const isWriteSql = sql => /^\s*(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT|REFRESH|CALL|DO|COPY)\b/i.test(String(sql))
  || /^\s*SELECT\b[\s\S]*\bFOR\s+(?:NO\s+KEY\s+)?(?:UPDATE|SHARE)\b/i.test(String(sql))
  || /^\s*WITH\b[\s\S]*\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i.test(String(sql));
const isMigrationJournalWrite = sql => /\bdatabase_migration_(?:runs|tables)\b/i.test(String(sql));

async function withSharedMigrationLock(pool, statement) {
  const guard = await pool.connect();
  let reusable = false;
  try {
    await guard.query('SELECT pg_advisory_lock_shared($1)', [DATABASE_MIGRATION_FREEZE_LOCK_ID]);
    try {
      return await guard.query(statement);
    } finally {
      // A failed or timed-out unlock must not return a locked session to the pool.
      const result = await guard.query('SELECT pg_advisory_unlock_shared($1) AS released', [DATABASE_MIGRATION_FREEZE_LOCK_ID]).catch(() => null);
      reusable = result?.rows[0]?.released === true;
    }
  } finally {
    guard.release(!reusable);
  }
}

function toPostgresSql(sql) {
  return String(sql)
    .replace(/BEGIN\s+IMMEDIATE/gi, 'BEGIN')
    .replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT')
    .replace(/UTC_TIMESTAMP\(\d+\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/datetime\s*\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP');
}

function toPostgresQuery(sql, params = []) {
  let index = 0;
  const text = toPostgresSql(sql).replace(/\?/g, () => `$${++index}`);
  if (index !== params.length) throw new Error('Database parameter count mismatch.');
  return { text, values: params };
}

export function getPostgresConnectionVariable() {
  return getSupabaseDatabaseUrl().variable;
}

export function getSupabaseDatabaseUrl(env = process.env) {
  const runtime = String(env.DATABASE_URL || '').trim();
  if (runtime) return { url: runtime, variable: 'DATABASE_URL' };
  const integrated = String(env.MY_PREFIX_POSTGRES_URL_NON_POOLING || '').trim();
  if (integrated) return { url: integrated, variable: 'MY_PREFIX_POSTGRES_URL_NON_POOLING' };
  const marketplace = String(env.POSTGRES_URL_NON_POOLING || '').trim();
  if (marketplace) return { url: marketplace, variable: 'POSTGRES_URL_NON_POOLING' };
  const canonical = String(env.CMS_SUPABASE_DATABASE_URL || '').trim();
  if (canonical) return { url: canonical, variable: 'CMS_SUPABASE_DATABASE_URL' };
  const legacy = String(env.SUPABASE_DATABASE_URL || '').trim();
  if (legacy) return { url: legacy, variable: 'SUPABASE_DATABASE_URL' };
  return { url: '', variable: 'CMS_SUPABASE_DATABASE_URL' };
}

export function postgresUrlOptions(connectionString, ssl) {
  if (!connectionString || !connectionString.includes('getafe_root_ca=')) return { connectionString, ssl };
  const url = new URL(connectionString);
  const certificate = new X509Certificate(Buffer.from(url.searchParams.get('getafe_root_ca'), 'base64url'));
  url.searchParams.delete('getafe_root_ca');
  // pg replaces the explicit SSL options when it finds sslmode in a URL.
  url.searchParams.delete('sslmode');
  return { connectionString: url.toString(), ssl: { ca: certificate.toString(), rejectUnauthorized: true } };
}

export function supabaseConnectionOptions(_category, env = process.env) {
  const resolved = getSupabaseDatabaseUrl(env);
  const variable = resolved.variable;
  const connectionString = resolved.url;
  if (!connectionString) throw new Error(`Set ${variable} to a Supabase PostgreSQL connection string in the server environment or backend .env file.`);
  let url;
  try { url = new URL(connectionString); } catch { /* Report a redacted configuration error below. */ }
  if (!url || !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !/^(db\.[a-z0-9]+\.supabase\.co|[a-z0-9-]+\.pooler\.supabase\.com)$/.test(url.hostname) ||
      (url.port && url.port !== '5432') || !url.username || !url.password || url.pathname !== '/postgres' ||
      [...url.searchParams.keys()].some(key => !['sslmode', 'getafe_root_ca'].includes(key)) ||
      url.searchParams.getAll('sslmode').some(mode => !['require', 'verify-ca', 'verify-full'].includes(mode))) {
    throw new Error(`Use a TLS-enabled Supabase direct or Session pooler connection string in ${variable}.`);
  }
  if (env.VERCEL === '1') {
    if (!url.hostname.endsWith('.pooler.supabase.com') || (url.port && url.port !== '5432')) {
      throw new Error('Vercel requires the Supabase Session pooler on port 5432 because the application uses session advisory locks.');
    }
    const poolerRef = decodeURIComponent(url.username).split('.').at(-1);
    const projectRef = env.SUPABASE_PROJECT_REF || poolerRef;
    if (!/^[a-z0-9]{20}$/.test(projectRef) || poolerRef !== projectRef) {
      throw new Error('SUPABASE_PROJECT_REF must match the configured pooler user.');
    }
    if (env.VERCEL_ENV === 'preview' && projectRef === 'wrgbfwexraarwxpoqzpv') {
      throw new Error('Preview must use an isolated Supabase project or database branch.');
    }
  }
  const sslMode = url.searchParams.get('sslmode');
  const hasRootCertificate = url.searchParams.has('getafe_root_ca');
  url.searchParams.delete('sslmode');
  try {
    // Require encryption for every Supabase connection. CA verification is
    // enabled when explicitly requested, or when a root CA is provided.
    const ssl = { rejectUnauthorized: env.VERCEL === '1' || hasRootCertificate || ['verify-ca', 'verify-full'].includes(sslMode) };
    const options = postgresUrlOptions(url.toString(), ssl);
    if (env.VERCEL === '1' && !hasRootCertificate) {
      // Supabase's project root is not present in Node's default trust store
      // on every Vercel runtime. Keep certificate verification enabled by
      // supplying the public Supabase root CA bundled with this function.
      return {
        ...options,
        ssl: {
          ...options.ssl,
          ca: readFileSync(new URL('../../../database/certs/supabase-root-2021.crt', import.meta.url), 'utf8'),
        },
      };
    }
    return options;
  } catch {
    throw new Error(`The Supabase root certificate in ${variable} is invalid.`);
  }
}

function safeConnectionError(error) {
  const code = error?.code;
  if (['28P01', '28000'].includes(code)) return new Error('Authentication failed.');
  if (code === '3D000') return new Error('Database not found.');
  if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)) return new Error('Database unavailable.');
  if (['ETIMEDOUT', '57014'].includes(code)) return new Error('Connection timed out.');
  if (/ssl|certificate/i.test(error?.message || '')) return new Error('SSL configuration error.');
  return new Error('Database connection failed.');
}

export function createPostgresResource(values, category, actor) {
  const get = name => values[`${category}.${name}`];
  const prefix = category === 'database' ? 'CMS' : 'PORTAL';
  const provider = 'supabase';
  const poolOptions = {
    ...supabaseConnectionOptions(category),
    max: get('connectionLimit'),
    connectionTimeoutMillis: get('connectTimeout'),
    idleTimeoutMillis: get('idleTimeout'),
    allowExitOnIdle: false,
    application_name: 'getafe-portal',
    query_timeout: Math.max(1000, Number(get('connectTimeout')) || 10000),
  };
  const pool = acquirePostgresPool(poolOptions);
  installPoolErrorHandler(pool, category);
  const execute = async (sql, params = []) => {
    try {
      const statement = toPostgresQuery(sql, params);
      const result = isWriteSql(sql) && !isMigrationJournalWrite(sql)
        ? await withSharedMigrationLock(pool, statement)
        : await pool.query(statement);
      return [result.rows, result];
    } catch (error) {
      error.safeMessage = safeConnectionError(error).message;
      throw error;
    }
  };
  const resource = { pool, connector: null, users: 0, driver: 'postgresql', category, prefix, provider };
  resource.execute = execute;
  let mediaGatePool;
  resource.getMediaGateConnection = () => {
    if (!mediaGatePool) {
      mediaGatePool = new Pool({ ...poolOptions, max: 2, application_name: 'getafe-media-write-gate' });
      installPoolErrorHandler(mediaGatePool, category);
    }
    return resource.getConnection(mediaGatePool);
  };
  resource.closeMediaGate = () => mediaGatePool?.end();
  resource.getConnection = async (connectionPool = pool) => {
    const physical = await connectionPool.connect();
    const client = {};
    let released = false;
    const rawQuery = (...args) => {
      if (released) throw new Error('Database connection has been released.');
      return physical.query(...args);
    };
    let transactionLock = false;
    let discard = false;
    const acquireShared = async () => {
      try { await rawQuery('SELECT pg_advisory_lock_shared($1)', [DATABASE_MIGRATION_FREEZE_LOCK_ID]); }
      catch (error) { discard = true; throw error; }
    };
    const releaseShared = async () => {
      const result = await rawQuery('SELECT pg_advisory_unlock_shared($1) AS released', [DATABASE_MIGRATION_FREEZE_LOCK_ID]).catch(() => null);
      if (result?.rows[0]?.released !== true) discard = true;
    };
    client.query = async (...args) => {
      const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text || '';
      if (!isWriteSql(sql) || transactionLock || isMigrationJournalWrite(sql)) return rawQuery(...args);
      await acquireShared();
      try { return await rawQuery(...args); }
      finally { await releaseShared(); }
    };
    client.execute = async (sql, params = []) => {
      const query = () => rawQuery(toPostgresQuery(sql, params));
      let result;
      if (!isWriteSql(sql) || transactionLock || isMigrationJournalWrite(sql)) result = await query();
      else {
        await acquireShared();
        try { result = await query(); }
        finally { await releaseShared(); }
      }
      return [result.rows, result];
    };
    client.beginTransaction = async ({ waitForMigration = true } = {}) => {
      if (transactionLock) throw new Error('A transaction is already active on this connection.');
      if (waitForMigration) {
        await acquireShared();
      } else {
        const { rows: [lock] } = await rawQuery('SELECT pg_try_advisory_lock_shared($1) AS acquired', [DATABASE_MIGRATION_FREEZE_LOCK_ID])
          .catch(error => { discard = true; throw error; });
        if (!lock.acquired) throw Object.assign(new Error('Database migration has paused writes'), { code: 'MIGRATION_WRITE_PAUSED' });
      }
      transactionLock = true;
      try { return await rawQuery('BEGIN'); }
      catch (error) { transactionLock = false; discard = true; throw error; }
    };
    const endTransaction = async command => {
      try { return await rawQuery(command); }
      finally { if (transactionLock) { transactionLock = false; await releaseShared(); } }
    };
    client.commit = () => endTransaction('COMMIT');
    client.rollback = () => endTransaction('ROLLBACK');
    client.release = () => {
      if (released) return;
      released = true;
      physical.release(discard || transactionLock);
      resource.users--;
    };
    resource.users++;
    return client;
  };
  resource.verify = async () => {
    try {
      const result = await pool.query('SELECT current_database() AS database, version() AS version');
      if (category === 'database') {
        if (actor) {
          const users = await pool.query('SELECT id, role FROM users WHERE id = $1', [actor.id]);
          if (!users.rows.some(user => ['admin', 'super_admin'].includes(user.role))) throw new Error('The target database must contain your administrator account.');
        }
      }
      return { database: result.rows[0].database, version: result.rows[0].version };
    } catch (error) {
      throw error;
    }
  };
  return resource;
}

export { safeConnectionError };
