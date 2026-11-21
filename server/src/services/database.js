import { createPostgresResource, getPostgresConnectionVariable, safeConnectionError } from './postgres.js';
import { isDependencyFailure } from './dependencyFailures.js';
import { dependencyReason } from './startupDiagnostics.js';
import { DATABASE_MIGRATION_FREEZE_LOCK_ID } from './postgres.js';
import pg from 'pg';

const active = new Map();
const retired = new Set();

function categoryValues(values, category) {
  const get = name => values[`${category}.${name}`];
  return { connectionLimit: get('connectionLimit'), connectTimeout: get('connectTimeout'), idleTimeout: get('idleTimeout') };
}

export async function buildDatabase(values, category, actor, { allowUnavailable = false } = {}) {
  const settings = categoryValues(values, category);
  const resourceValues = Object.fromEntries(Object.entries(settings).map(([key, value]) => [`${category}.${key}`, value]));
  const resource = createPostgresResource(resourceValues, category, actor);
  try { const result = await resource.verify(); resource.serverVersion = result.version; resource.databaseName = result.database; return resource; }
  catch (error) {
    if (allowUnavailable && isDependencyFailure(error)) {
      resource.degraded = true;
      resource.failureReason = dependencyReason(error);
      console.error(JSON.stringify({ event: 'database_startup_degraded', category, reason: resource.failureReason, required: true }));
      return resource;
    }
    await resource.pool.end().catch(() => {});
    throw Object.assign(new Error(error.safeMessage || safeConnectionError(error).message, { cause: error }), { subsystem: category });
  }
}

async function dispose(resource) {
  if (!resource || resource.closing) return resource?.closing;
  if (resource.users > 0) return;
  resource.closed = true;
  resource.closing = (async () => { try { await Promise.all([resource.pool.end(), resource.closeMediaGate?.()]); } finally { retired.delete(resource); } })();
  return resource.closing;
}
function retire(resource) { if (!resource) return; resource.retiring = true; retired.add(resource); void dispose(resource).catch(error => console.error('Retired PostgreSQL cleanup failed:', error.message)); }
export function activateDatabase(category, resource) { const previous = active.get(category); active.set(category, resource); retire(previous); }
export async function discardDatabase(resource) { await dispose(resource); }

function facade(category) {
  return {
    async execute(...args) { const resource = active.get(category); if (!resource) throw new Error('PostgreSQL is not connected.'); resource.users++; try { return await resource.execute(...args); } finally { resource.users--; if (resource.retiring) retire(resource); } },
    async getConnection({ mediaGate = false } = {}) { const resource = active.get(category); if (!resource) throw new Error('PostgreSQL is not connected.'); const connection = await (mediaGate ? resource.getMediaGateConnection() : resource.getConnection()); const release = connection.release.bind(connection); let released = false; connection.release = () => { if (released) return; released = true; release(); if (resource.retiring) retire(resource); }; return connection; },
  };
}
const cms = facade('database');
const portal = facade('portalDatabase');
export async function getCmsPool() { return cms; }
export async function getPortalPool() { return portal; }
export function getActiveDatabaseConnectionOptions(category) {
  return active.get(category)?.pool.options;
}

export function getDatabaseRuntimeStatus(category) {
  const resource = active.get(category);
  const options = resource?.pool.options;
  const provider = resource?.provider ?? null;
  const safe = (value, pattern) => typeof value === 'string' && pattern.test(value) ? value : null;
  const location = params => ({
    host: safe(params.host, /^[\w.:%\-[\]]+$/),
    port: Number.isInteger(params.port) && params.port > 0 && params.port <= 65535 ? params.port : null,
    database: safe(params.database, /^[\w. -]+$/),
    username: safe(params.user, /^[\w.@-]+$/),
  });
  let connection = null;
  if (options) {
    try { connection = location(new pg.Client(options).connectionParameters); } catch { /* No valid endpoint to display. */ }
  }
  const variable = getPostgresConnectionVariable(category, provider);
  return {
    provider, connection,
    usesConnectionUrl: Boolean(options?.connectionString),
    environmentVariable: options?.connectionString && process.env[variable] ? variable : null,
    degraded: Boolean(resource?.degraded),
  };
}
export async function databaseHealth(category = 'database') {
  try {
    const database = category === 'database' ? cms : portal;
    // PostgreSQL checks table existence and SELECT privileges in one round trip.
    const tables = category === 'database' ? ['users', 'categories', 'news', 'media', 'media_uploads'] : ['portal_users'];
    const checks = tables.map(table => `NOT EXISTS (SELECT 1 FROM ${table} LIMIT 0)`);
    const [rows] = await database.execute('SELECT 1 AS ok WHERE ' + checks.join(' AND '));
    return { status: rows[0]?.ok === 1 ? 'healthy' : 'degraded' };
  } catch (error) { return { status: 'unhealthy', reason: dependencyReason(error) }; }
}
export async function closeDatabaseConnection() { for (const resource of active.values()) retire(resource); active.clear(); await Promise.all([...retired].map(dispose)); }

