import mysql from 'mysql2/promise';
import { Connector, IpAddressTypes, AuthTypes } from '@google-cloud/cloud-sql-connector';
import { config } from '../config/index.js';
const active = new Map();
const retired = new Set();
export async function buildDatabase(values, category, actor) {
  const get = name => values[`${category}.${name}`];
  const legacyProvider = get('provider');
  let mode = get('connectionMode');
  if (!mode) mode = legacyProvider === 'gcp' ? (get('privateIp') ? 'cloudsql-ip' : 'cloudsql-connector') : legacyProvider === 'mysql' ? 'direct' : 'local';
  if (legacyProvider === 'localgcpmysql') throw new Error('Legacy database configuration detected. Select a Database Engine and Connection Method.');
  // Older installations used provider=local for any direct MySQL target.
  // Preserve that configuration when a real remote host is present, while
  // keeping an actual localhost configuration local in development.
  if (mode === 'local' && legacyProvider === 'mysql') mode = 'direct';
  if (mode === 'local') {
    if (process.env.NODE_ENV === 'production') throw new Error('Local databases are disabled in production.');
    return null;
  }
  if (!['direct', 'cloudsql-ip', 'cloudsql-connector'].includes(mode)) throw new Error(`Unsupported database connection mode: ${mode}`);
  if (mode === 'direct' && !get('host')) throw new Error('Database host is required for Direct MySQL mode.');
  if (mode === 'cloudsql-ip' && !get('host')) throw new Error('Cloud SQL IP address is required for Cloud SQL IP mode.');
  if (mode === 'cloudsql-connector' && !/^[-a-z0-9]+:[-a-z0-9]+:[-a-z0-9]+$/i.test(get('instance') || '')) throw new Error('Invalid Cloud SQL instance connection name. Expected PROJECT_ID:REGION:INSTANCE_NAME.');
  let connector;
  let pool;
  try {
    let options = { host: get('host'), port: get('port'), ssl: get('ssl') ? { rejectUnauthorized: true } : undefined };
    if (mode === 'cloudsql-connector') {
      connector = new Connector();
      options = await connector.getOptions({ instanceConnectionName: get('instance'), ipType: get('privateIp') ? IpAddressTypes.PRIVATE : IpAddressTypes.PUBLIC, authType: get('iam') ? AuthTypes.IAM : AuthTypes.PASSWORD });
    }
    pool = mysql.createPool({ ...options, user: get('username'), password: get('password'), database: get('name'), connectionLimit: get('connectionLimit'), queueLimit: get('queueLimit'), connectTimeout: get('connectTimeout'), idleTimeout: get('idleTimeout'), waitForConnections: true, enableKeepAlive: true });
    await pool.execute('SELECT 1');
    // Verify the schema too: SELECT 1 alone can activate an empty, unusable database.
    const tables = category === 'database' ? ['users', 'categories', 'news', 'media', 'media_uploads'] : ['portal_users'];
    for (const table of tables) await pool.execute(`SELECT id FROM ${table} LIMIT 0`);
    if (actor && category === 'database') {
      const [users] = await pool.execute('SELECT id, role FROM users WHERE id = ?', [actor.id]);
      if (!users.some(user => ['admin', 'super_admin'].includes(user.role))) throw new Error('The target database must contain your administrator account.');
    }
    const resource = { pool, connector, users: 0, retiring: false, closed: false };
    return resource;
  } catch (error) {
    await pool?.end().catch(() => {}); connector?.close();
    if (error.message?.includes('default credentials')) throw new Error('Application Default Credentials were not found. Configure Google credentials for Cloud SQL Connector mode.');
    if (error.code === 'ER_ACCESS_DENIED_ERROR') throw new Error(`Authentication failed for MySQL user "${get('username')}". Check the username and password.`);
    if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code)) throw new Error(`Unable to reach MySQL at ${get('host')}:${get('port')}.`);
    if (error.code === 'ER_BAD_DB_ERROR') throw new Error(`Database "${get('name')}" does not exist or is not accessible.`);
    if (/certificate|tls|ssl/i.test(error.message || '')) throw new Error('TLS certificate validation failed. Check the database certificate configuration.');
    const code = ['ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ER_NO_SUCH_TABLE'].includes(error.code) ? ` (${error.code})` : '';
    throw new Error(`Database connection or schema validation failed${code}. Check the target database, administrator account and credentials.`);
  }
}
async function dispose(resource) {
  if (!resource) return;
  if (resource.closing) return resource.closing;
  if (resource.users > 0) return;
  resource.closed = true;
  resource.closing = (async () => { try { await resource.pool.end(); } finally { resource.connector?.close(); retired.delete(resource); } })();
  return resource.closing;
}
function retire(resource) { if (!resource) return; resource.retiring = true; retired.add(resource); void dispose(resource).catch(() => console.error('Retired database cleanup failed')); }
export function activateDatabase(category, resource) { const previous = active.get(category); active.set(category, resource); retire(previous); }
export async function discardDatabase(resource) { await dispose(resource); }
export function hasDatabase(category) { return active.has(category); }
function facade(category) {
  return {
    async execute(...args) {
      const resource = active.get(category);
      if (!resource) throw new Error('Database is not connected');
      resource.users++;
      try { return await resource.pool.execute(...args); }
      finally { resource.users--; if (resource.retiring) retire(resource); }
    },
    async getConnection() {
      const resource = active.get(category);
      if (!resource) throw new Error('Database is not connected');
      resource.users++;
      try {
        const connection = await resource.pool.getConnection();
        const release = connection.release.bind(connection);
        let released = false;
        connection.release = () => { if (released) return; released = true; release(); resource.users--; if (resource.retiring) retire(resource); };
        return connection;
      } catch (error) { resource.users--; if (resource.retiring) retire(resource); throw error; }
    },
  };
}
const cms = facade('database'), portal = facade('portalDatabase');
function usesRemote(category) {
  const provider = config.get(`${category}.provider`);
  const mode = config.get(`${category}.connectionMode`);
  const host = config.get(`${category}.host`);
  return provider !== 'local' || mode !== 'local' || (host && !['localhost', '127.0.0.1', '::1'].includes(String(host).toLowerCase()));
}
export async function getCmsPool() { return usesRemote('database') ? cms : null; }
export async function getPortalPool() { return usesRemote('portalDatabase') ? portal : null; }
export async function closeCloudSql() { for (const resource of active.values()) retire(resource); active.clear(); await Promise.all([...retired].map(dispose)); }
