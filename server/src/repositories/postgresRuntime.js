import { getCmsPool, getPortalPool } from '../services/cloudSql.js';

function postgresSql(sql) {
  return String(sql)
    .replace(/BEGIN\s+IMMEDIATE/gi, 'BEGIN')
    .replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT')
    .replace(/UTC_TIMESTAMP\(3\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/datetime\s*\(/gi, 'CURRENT_TIMESTAMP(');
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
        await runtime.connection.beginTransaction();
      } else if (normalized === 'COMMIT' && runtime.connection) {
        await runtime.connection.commit();
        runtime.connection.release();
        runtime.connection = null;
      } else if (normalized === 'ROLLBACK' && runtime.connection) {
        await runtime.connection.rollback();
        runtime.connection.release();
        runtime.connection = null;
      } else {
        await (runtime.connection || pool).execute(postgresSql(sql));
      }
    },
    async transaction(work) {
      const connection = await pool.getConnection();
      try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; }
      catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
  };
}
