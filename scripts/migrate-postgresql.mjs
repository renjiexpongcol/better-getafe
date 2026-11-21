import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ensureSupabaseConfigured } from '../server/src/config/supabaseSetup.js';
import { DATABASE_MIGRATION_FREEZE_LOCK_ID, supabaseConnectionOptions } from '../server/src/services/postgres.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let client;
try {
  const setup = await ensureSupabaseConfigured();
  if (setup.cancelled) process.exit(0);
  client = new pg.Client({ ...supabaseConnectionOptions('database', { CMS_SUPABASE_DATABASE_URL: setup.url }), connectionTimeoutMillis: 7000, application_name: 'better-getafe-schema-migration' });
  await client.connect();
  // One session owns the migration lock through journal creation and every commit.
  await client.query('SELECT pg_advisory_lock($1)', [DATABASE_MIGRATION_FREEZE_LOCK_ID]);
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const directory = path.join(root, 'database/migrations/postgresql');
  const files = (await fs.readdir(directory)).filter(file => /^\d+.*\.sql$/.test(file)).sort();
  for (const file of files) {
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (applied.rowCount) continue;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL getafe.import_source_catalog = 'on'");
      await client.query(await fs.readFile(path.join(directory, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.info(`[Database] Applied ${file}.`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      const code = /^[A-Za-z0-9_-]+$/.test(error.code || '') ? ` (${error.code})` : '';
      throw new Error(`Migration ${file} failed${code}. The connection string was not logged; correct the database issue and retry.`);
    }
  }
  console.info(`[Database] Supabase schema migrations complete (${files.length} migration files checked).`);
} catch (error) {
  console.error(`[Database] ${error.message}`);
  process.exitCode = 1;
} finally { await client?.end().catch(() => {}); }
