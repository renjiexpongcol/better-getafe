import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 5432), database: process.env.DB_NAME || 'getafe_portal',
  user: process.env.DB_USER || 'getafe_app', password: process.env.DB_PASSWORD, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
const directory = path.resolve('database/migrations/postgresql');
const files = (await fs.readdir(directory)).filter(file => file.endsWith('.sql')).sort();
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  for (const file of files) {
    const version = file;
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
    if (applied.rowCount) continue;
    await client.query(await fs.readFile(path.join(directory, file), 'utf8'));
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    console.log(`Applied ${version}`);
  }
  await client.query('COMMIT');
} catch (error) { await client.query('ROLLBACK'); console.error('PostgreSQL migration failed:', error.message); process.exitCode = 1; }
finally { client.release(); await pool.end(); }
