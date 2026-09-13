function integer(env, key, fallback, minimum) {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum) throw new Error(`${key} must be an integer of at least ${minimum}`);
  return value;
}
export function createPoolManager({ createConnector, createPool, ipTypes, authTypes, env = process.env }) {
  const pending = new Map();
  let closing;
  async function initialize(prefix) {
    const instanceConnectionName = env[`${prefix}_CLOUD_SQL_INSTANCE`] || env.INSTANCE_CONNECTION_NAME;
    if (!instanceConnectionName) throw new Error(`${prefix}_CLOUD_SQL_INSTANCE is required when ${prefix}_DATABASE_PROVIDER=gcp`);
    const limits = {
      connectionLimit: integer(env, `${prefix}_DB_CONNECTION_LIMIT`, 5, 1),
      queueLimit: integer(env, `${prefix}_DB_QUEUE_LIMIT`, 100, 0),
      connectTimeout: integer(env, `${prefix}_DB_CONNECT_TIMEOUT_MS`, 10000, 1),
    };
    const connector = createConnector();
    try {
      const options = await connector.getOptions({ instanceConnectionName, ipType: env.PRIVATE_IP === 'true' ? ipTypes.PRIVATE : ipTypes.PUBLIC, authType: env[`${prefix}_IAM_AUTH`] === 'true' ? authTypes.IAM : authTypes.PASSWORD });
      const legacy = prefix === 'CMS' ? 'DB' : 'USER_DB';
      const pool = createPool({ ...options, user: env[`${prefix}_DB_USER`] || env[`${legacy}_USER`], password: env[`${prefix}_DB_PASSWORD`] || env[`${legacy}_PASS`], database: env[`${prefix}_DB_NAME`] || env[`${legacy}_NAME`], waitForConnections: true, enableKeepAlive: true, ...limits });
      return { pool, connector };
    } catch (error) { connector.close(); throw error; }
  }
  return {
    async get(prefix) {
      if (closing) throw new Error('Database connections are shutting down');
      const provider = env[`${prefix}_DATABASE_PROVIDER`] || (prefix === 'PORTAL' && env.USER_DATABASE_PROVIDER) || 'local';
      if (provider !== 'gcp') return null;
      if (!pending.has(prefix)) {
        const promise = initialize(prefix).catch(error => { pending.delete(prefix); throw error; });
        pending.set(prefix, promise);
      }
      return (await pending.get(prefix)).pool;
    },
    close() {
      if (!closing) closing = (async () => {
        const results = await Promise.allSettled([...pending.values()].map(async promise => {
          const resource = await promise.catch(() => null);
          if (!resource) return;
          try { await resource.pool.end(); } finally { resource.connector.close(); }
        }));
        const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
        if (errors.length) throw new AggregateError(errors, 'Database shutdown failed');
      })();
      return closing;
    },
  };
}
