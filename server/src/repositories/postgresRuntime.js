import { getCmsPool, getPortalPool } from '../services/cloudSql.js';

function postgresSql(sql) {
  return String(sql)
    .replace(/BEGIN\s+IMMEDIATE/gi, 'BEGIN')
    .replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT')
    .replace(/UTC_TIMESTAMP\(\d+\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/datetime\s*\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP');
}

function statement(runtime, sql) {
  const text = postgresSql(sql);
  const executor = () => runtime.connection || runtime.pool;
  return {
    async all(...params) { return (await executor().execute(text, params))[0]; },
    async get(...params) { return (await executor().execute(text, params))[0][0]; },
    async run(...params) { const [, result] = await executor().execute(text, params); return { changes: result.rowCount || 0 }; },
  };
}

export async function getPostgresRuntime(category = 'portal') {
  const pool = category === 'database' ? await getCmsPool() : await getPortalPool();
  const runtime = { pool, connection: null };
  return {
    prepare(sql) { return statement(runtime, sql); },
    async exec(sql) {
      const normalized = postgresSql(sql).trim().toUpperCase();
      if (normalized === 'BEGIN') {
        runtime.connection = await pool.getConnection();
        try { await runtime.connection.beginTransaction(); }
        catch (error) { runtime.connection.release(); runtime.connection = null; throw error; }
      } else if (normalized === 'COMMIT' && runtime.connection) {
        try { await runtime.connection.commit(); }
        finally { runtime.connection.release(); runtime.connection = null; }
      } else if (normalized === 'ROLLBACK' && runtime.connection) {
        try { await runtime.connection.rollback(); }
        finally { runtime.connection.release(); runtime.connection = null; }
      } else {
        await (runtime.connection || pool).execute(postgresSql(sql));
      }
    },
    async transaction(work) {
      const connection = await pool.getConnection();
      try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; }
      catch (error) { await connection.rollback().catch(() => {}); throw error; }
      finally { connection.release(); }
    },
  };
}
