import { createPostgresResource, safeConnectionError } from './postgres.js';

const active = new Map();
const retired = new Set();

function categoryValues(values, category) {
  const get = name => values[`${category}.${name}`];
  return { host: get('host'), port: get('port'), name: get('name'), username: get('username'), password: get('password'), sslMode: get('sslMode'), connectionLimit: get('connectionLimit'), connectTimeout: get('connectTimeout'), idleTimeout: get('idleTimeout') };
}

export async function buildDatabase(values, category, actor) {
  const settings = categoryValues(values, category);
  const url = category === 'database' ? process.env.DATABASE_URL : process.env.PORTAL_DATABASE_URL;
  if ((!settings.host || !settings.name || !settings.username || !settings.password) && !url) throw new Error('PostgreSQL host, database, username and password are required.');
  const resource = createPostgresResource(Object.fromEntries(Object.entries(settings).map(([key, value]) => [`${category}.${key}`, value])), category, actor);
  try { const result = await resource.verify(); resource.serverVersion = result.version; resource.databaseName = result.database; return resource; }
  catch (error) { throw new Error(error.safeMessage || safeConnectionError(error).message); }
}

async function dispose(resource) {
  if (!resource || resource.closing) return resource?.closing;
  if (resource.users > 0) return;
  resource.closed = true;
  resource.closing = (async () => { try { await resource.pool.end(); } finally { retired.delete(resource); } })();
  return resource.closing;
}
function retire(resource) { if (!resource) return; resource.retiring = true; retired.add(resource); void dispose(resource).catch(error => console.error('Retired PostgreSQL cleanup failed:', error.message)); }
export function activateDatabase(category, resource) { const previous = active.get(category); active.set(category, resource); retire(previous); }
export async function discardDatabase(resource) { await dispose(resource); }

function facade(category) {
  return {
    async execute(...args) { const resource = active.get(category); if (!resource) throw new Error('PostgreSQL is not connected.'); resource.users++; try { return await resource.execute(...args); } finally { resource.users--; if (resource.retiring) retire(resource); } },
    async getConnection() { const resource = active.get(category); if (!resource) throw new Error('PostgreSQL is not connected.'); const connection = await resource.getConnection(); const release = connection.release.bind(connection); let released = false; connection.release = () => { if (released) return; released = true; release(); if (resource.retiring) retire(resource); }; return connection; },
  };
}
const cms = facade('database');
const portal = facade('portalDatabase');
export async function getCmsPool() { return cms; }
export async function getPortalPool() { return portal; }
export async function databaseHealth(category = 'database') { try { const [rows] = await (category === 'database' ? cms : portal).execute('SELECT 1 AS ok'); return { status: rows[0]?.ok === 1 ? 'healthy' : 'degraded' }; } catch { return { status: 'degraded' }; } }
export async function closeCloudSql() { for (const resource of active.values()) retire(resource); active.clear(); await Promise.all([...retired].map(dispose)); }
