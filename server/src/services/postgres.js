import pg from 'pg';

const { Pool } = pg;

function toPostgresQuery(sql, params = []) {
  let index = 0;
  const text = String(sql).replace(/\?/g, () => `$${++index}`);
  if (index !== params.length) throw new Error('Database parameter count mismatch.');
  return { text, values: params };
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
  const url = category === 'database' ? process.env.DATABASE_URL : process.env.PORTAL_DATABASE_URL;
  const sslMode = get('sslMode') || (get('ssl') ? 'required' : 'disable');
  const ssl = sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-ca' };
  const pool = new Pool({
    ...(url ? { connectionString: url } : { host: get('host'), port: get('port'), database: get('name'), user: get('username'), password: get('password') }),
    ssl,
    max: get('connectionLimit'),
    connectionTimeoutMillis: get('connectTimeout'),
    idleTimeoutMillis: get('idleTimeout'),
    allowExitOnIdle: false,
    application_name: 'getafe-portal',
  });
  const execute = async (sql, params = []) => {
    try {
      const result = await pool.query(toPostgresQuery(sql, params));
      return [result.rows, result];
    } catch (error) {
      error.safeMessage = safeConnectionError(error).message;
      throw error;
    }
  };
  const resource = { pool, connector: null, users: 0, driver: 'postgresql', category, prefix };
  resource.execute = execute;
  resource.getConnection = async () => {
    const client = await pool.connect();
    const originalRelease = client.release.bind(client);
    let released = false;
    client.execute = async (sql, params = []) => {
      const result = await client.query(toPostgresQuery(sql, params));
      return [result.rows, result];
    };
    client.beginTransaction = () => client.query('BEGIN');
    client.commit = () => client.query('COMMIT');
    client.rollback = () => client.query('ROLLBACK');
    client.release = () => { if (!released) { released = true; originalRelease(); resource.users--; } };
    resource.users++;
    return client;
  };
  resource.verify = async () => {
    try {
      const result = await pool.query('SELECT current_database() AS database, version() AS version');
      if (category === 'database') {
        for (const table of ['users', 'categories', 'news', 'media', 'media_uploads']) await pool.query(`SELECT 1 FROM ${table} LIMIT 0`);
        if (actor) {
          const users = await pool.query('SELECT id, role FROM users WHERE id = $1', [actor.id]);
          if (!users.rows.some(user => ['admin', 'super_admin'].includes(user.role))) throw new Error('The target database must contain your administrator account.');
        }
      } else await pool.query('SELECT 1 FROM portal_users LIMIT 0');
      return { database: result.rows[0].database, version: result.rows[0].version };
    } catch (error) {
      await pool.end().catch(() => {});
      throw error;
    }
  };
  return resource;
}

export { safeConnectionError };
