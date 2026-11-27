import pg from 'pg';
import { deployment } from '../config/deployment.js';

const pools = new Map();

// Settings, CMS and resident repositories target the same database. A lease
// keeps retiring one resource from closing the pool used by the other two.
export function acquirePostgresPool(options, { separate = false } = {}) {
  if (!deployment.serverless || separate) return new pg.Pool(options);
  const normalized = {
    ...options, max: 2, idleTimeoutMillis: 10000, allowExitOnIdle: true,
    connectionTimeoutMillis: 5000, query_timeout: 10000,
    application_name: 'getafe-portal',
  };
  const identity = JSON.stringify([normalized.connectionString, normalized.ssl]);
  let entry = pools.get(identity);
  if (!entry) {
    entry = { pool: new pg.Pool(normalized), leases: 0 };
    pools.set(identity, entry);
  }
  entry.leases++;
  let released = false;
  const lease = {
    sharedTarget: entry.pool,
    options: entry.pool.options,
    query: (...args) => entry.pool.query(...args),
    connect: (...args) => entry.pool.connect(...args),
    on: (...args) => { entry.pool.on(...args); return lease; },
    async end() {
      if (released) return;
      released = true;
      if (--entry.leases === 0) {
        pools.delete(identity);
        await entry.pool.end();
      }
    },
  };
  return lease;
}
