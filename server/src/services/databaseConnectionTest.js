import pg from 'pg';
import { config } from '../config/index.js';
import { definitions } from '../config/defaults.js';
import { getActiveDatabaseConnectionOptions } from './database.js';
import { getPostgresConnectionVariable, postgresUrlOptions } from './postgres.js';

const failures = {
  dns_failure: ['host', 'The backend could not resolve the PostgreSQL host. Check the hostname and backend DNS.'],
  connection_refused: ['port', 'PostgreSQL refused the connection. Check that it is running and that the backend can reach the configured port.'],
  connection_timeout: ['host', 'The PostgreSQL check timed out. Check backend routing, firewall rules, and database availability.'],
  tls_failure: ['sslMode', 'The PostgreSQL TLS handshake or certificate check failed. Check the TLS mode and the certificate trusted by the backend.'],
  credentials_rejected: ['password', 'PostgreSQL rejected the credentials. Check the username and password for the selected database.'],
  database_missing: ['name', 'PostgreSQL could not find the configured database. Check the database name.'],
  insufficient_permissions: ['username', 'The database role lacks permission to connect or run the check. Review its PostgreSQL grants.'],
  pooler_project_not_found: ['host', 'The Supabase pooler could not find this project or database user. Copy the Session pooler host from Connect in your Better Getafe Supabase project.'],
  connection_closed: ['host', 'The database or a network intermediary closed the connection. Check project availability and the backend network.'],
  database_unavailable: ['host', 'The database is starting, restarting, or has reached its connection limit. Check project status and try again shortly.'],
  server_rejected_connection: [null, 'The database server rejected the connection or check query. Review the database logs for details.'],
  socket_not_found: ['host', 'The PostgreSQL socket does not exist. Check that PostgreSQL is running and that the backend uses the correct socket directory or TCP hostname.'],
  connection_file_missing: ['sslMode', 'The backend could not open a file required by the PostgreSQL connection. Check that any configured TLS certificate or key file exists on the backend.'],
  connection_endpoint_missing: ['host', 'The backend reported a missing PostgreSQL connection endpoint. Check the configured hostname and port, or use the Session pooler host from Supabase Connect.'],
};

export function classifyDatabaseConnectionFailure(error) {
  const { code, message = '' } = error || {};
  if (Array.isArray(error?.errors) && error.errors.length) {
    const causes = new Set(error.errors.map(classifyDatabaseConnectionFailure));
    causes.delete('unknown_failure');
    if (causes.size === 1) return [...causes][0];
    if (causes.has('host_unreachable') && ![...causes].some(cause => !['host_unreachable', 'connection_timeout', 'connection_refused'].includes(cause))) return 'host_unreachable';
  }
  if (/tenant or user not found|tenant not found|project not found/i.test(message)) return 'pooler_project_not_found';
  if (['57P01', '57P02', '57P03', '53300', '53400'].includes(code)) return 'database_unavailable';
  if (code === '42501') return 'insufficient_permissions';
  if (['28P01', '28000'].includes(code)) return 'credentials_rejected';
  if (code === '3D000') return 'database_missing';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ENODATA'].includes(code)) return 'dns_failure';
  if (code === 'ECONNREFUSED') return 'connection_refused';
  if (['ETIMEDOUT', '57014'].includes(code) || /timeout|timed out/i.test(message)) return 'connection_timeout';
  if (/^(ERR_TLS|ERR_SSL|CERT_|UNABLE_TO_|SELF_SIGNED|DEPTH_ZERO)/.test(code || '') || /ssl|tls|certificate/i.test(message)) return 'tls_failure';
  if (['EHOSTUNREACH', 'ENETUNREACH', 'EHOSTDOWN', 'ENETDOWN', 'EADDRNOTAVAIL'].includes(code)) return 'host_unreachable';
  if (['ECONNRESET', 'ECONNABORTED', 'EPIPE', '08006'].includes(code) || /connection terminated|connection ended|socket hang up/i.test(message)) return 'connection_closed';
  if (code === 'ENOENT') {
    if (['open', 'stat', 'access', 'lstat'].includes(error.syscall)) return 'connection_file_missing';
    if (/\.s\.PGSQL\.\d+/.test(message)) return 'socket_not_found';
    return 'connection_endpoint_missing';
  }
  if (['ERR_INVALID_URL', 'ERR_INVALID_ARG_VALUE', 'ERR_SOCKET_BAD_PORT'].includes(code)) return 'invalid_configuration';
  if (/^[0-9A-Z]{5}$/.test(code || '')) return 'server_rejected_connection';
  return 'unknown_failure';
}

export async function testDatabaseConnection(category, target, requestId, proposedUrl) {
  const options = target === 'active' ? getActiveDatabaseConnectionOptions(category) : null;
  const variable = getPostgresConnectionVariable(category, target === 'destination' ? 'supabase' : 'postgresql');
  const fieldSources = Object.fromEntries(['host', 'port', 'name', 'username', 'password', 'sslMode'].map(field => {
    const key = `${category}.${field}`;
    const source = config.sources[key];
    const environment = source === 'environment' ? definitions[key]?.env.find(name => config.env[name]) : null;
    return [field, { source, variable: environment }];
  }));
  const connection = {
    target, host: null, port: null, database: null,
    variable: target === 'destination' || options?.connectionString
      ? (target === 'active' && config.values[`${category}.provider`] === 'supabase'
        ? getPostgresConnectionVariable(category, 'supabase') : variable)
      : null,
    fieldSources: target === 'active' && !options?.connectionString ? fieldSources : null,
  };
  if (target === 'active' && options?.connectionString && config.values[`${category}.provider`] === 'supabase' && !process.env[connection.variable]) {
    connection.variable = null;
    connection.saved = true;
  }
  const result = (code, message, field = null) => ({
    ok: code === 'verified', code, message, field, connection, requestId,
    configurationVariable: connection.variable || connection.fieldSources?.[field]?.variable || null,
  });
  const url = proposedUrl || process.env[variable];
  if (target === 'destination' && (proposedUrl || !process.env[variable]) && url) {
    connection.variable = null;
    connection.saved = !proposedUrl;
    connection.fromSetupForm = Boolean(proposedUrl);
  }
  if (target === 'destination' && !url) {
    connection.variable = null;
    return result('invalid_configuration', `Set ${variable} in the backend environment before testing a Supabase connection.`);
  }
  if (target === 'active' && !options) return result('invalid_configuration', 'The active PostgreSQL connection has not initialized. Check the backend startup status.');
  let client;
  let stage = 'configuration';
  try {
    if (target === 'destination') {
      const parsed = new URL(url);
      if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.username || !parsed.password || !parsed.pathname.slice(1)) {
        return result('invalid_configuration', `Set a PostgreSQL URL with a host, database, username, and password in ${variable}.`);
      }
    }
    client = new pg.Client({
      ...(options
        ? { ...options, password: options.password }
        : postgresUrlOptions(url, { rejectUnauthorized: Boolean(proposedUrl || !process.env[variable]) })),
      connectionTimeoutMillis: 4000, query_timeout: 2000,
    });
    const { host, port, database } = client.connectionParameters;
    // Only return individual address components, never a driver option or URL.
    connection.host = /^[\w.:%\-[\]]+$/.test(host) ? host : null;
    connection.port = Number.isInteger(port) ? port : null;
    connection.database = /^[\w. -]+$/.test(database) ? database : null;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return result('invalid_configuration', 'Enter a valid PostgreSQL port.', 'port');
    if (target === 'destination' && (!connection.host || client.connectionParameters.isDomainSocket)) {
      return result('invalid_configuration', 'The Supabase migration destination needs a TCP hostname. Use the direct or Session pooler host from Supabase Connect.', 'host');
    }
    stage = 'connect';
    await client.connect();
    stage = 'query';
    await client.query('SELECT 1');
    return result('verified', 'Connection verified');
  } catch (error) {
    const code = client || error?.code === 'ENOENT' ? classifyDatabaseConnectionFailure(error) : 'invalid_configuration';
    const [field, message] = failures[code] || {
      host_unreachable: ['host', 'The backend has no route to the PostgreSQL host. Check network access from the backend.'],
      invalid_configuration: [null, 'The PostgreSQL connection configuration is invalid. Check the backend connection settings and URL encoding.'],
      unknown_failure: [null, 'The PostgreSQL check failed. Use the request ID to locate the backend log entry.'],
    }[code];
    // Keep diagnostics useful without printing PostgreSQL messages, which can include connection details.
    const driverCodes = [error?.code, ...(Array.isArray(error?.errors) ? error.errors.slice(0, 5).map(cause => cause?.code) : [])]
      .filter(value => typeof value === 'string' && /^(?:[0-9A-Z]{5}|E[A-Z0-9_]{2,55}|CERT_[A-Z0-9_]+)$/.test(value));
    const syscall = ['connect', 'open', 'stat', 'access', 'lstat', 'getaddrinfo'].includes(error?.syscall) ? error.syscall : undefined;
    console.warn(JSON.stringify({ event: 'database_connection_test_failed', requestId, category, target, stage, code, driverCodes, syscall }));
    const poolerHint = target === 'destination' && connection.host?.startsWith('db.') && connection.host.endsWith('.supabase.co')
      && ['host_unreachable', 'connection_timeout', 'dns_failure', 'connection_refused', 'connection_closed'].includes(code)
      ? ' If this backend cannot reach the direct endpoint, use the Session pooler host from Supabase Connect.'
      : '';
    const certificateHint = target === 'destination' && code === 'tls_failure' && proposedUrl
      ? ' Download the server root certificate from this project’s Supabase Database Settings and add it in Connect Supabase. Also confirm that the host matches the Connect screen.'
      : '';
    const credentialsHint = target === 'destination' && code === 'credentials_rejected'
      ? proposedUrl
        ? ' Enter the database password for this Supabase project in Connect Supabase. Confirm the Session pooler host and username against the project’s Connect panel.'
        : ' Check the database password and username in the Supabase destination configuration shown below.'
      : '';
    return result(code, message + poolerHint + certificateHint + credentialsHint, field);
  } finally {
    await client?.end().catch(() => {});
  }
}
