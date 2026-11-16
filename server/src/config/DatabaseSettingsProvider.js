import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { installPoolErrorHandler } from '../services/dependencyFailures.js';
import { DATABASE_MIGRATION_FREEZE_LOCK_ID, supabaseConnectionOptions } from '../services/postgres.js';
let pool;
function postgresPool() {
  const next = new pg.Pool({
    ...supabaseConnectionOptions('database'),
    max: Number(process.env.DB_CONNECTION_LIMIT || 5), connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000), idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 60000),
    query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 10000),
  });
  installPoolErrorHandler(next, 'settings');
  const adapt = sql => { let i = 0; return String(sql).replace(/\?/g, () => `$${++i}`); };
  next.driver = 'postgresql';
  next.execute = async (sql, params = []) => { const result = await next.query(adapt(sql), params); return [result.rows, result]; };
  const getConnection = next.connect.bind(next);
  next.getConnection = async () => { const client = await getConnection(); client.execute = async (sql, params = []) => { const result = await client.query(adapt(sql), params); return [result.rows, result]; }; client.beginTransaction = () => client.query('BEGIN'); client.commit = () => client.query('COMMIT'); client.rollback = () => client.query('ROLLBACK'); return client; };
  return next;
}
export async function getConfigPool() {
  return pool ??= postgresPool();
}
export async function closeConfigStore() {
  const current = pool;
  pool = undefined;
  await current?.end();
}
export class DatabaseSettingsProvider {
  constructor({ file = process.env.CONFIG_LOCAL_FILE || path.resolve('data/settings.json'), poolProvider = getConfigPool } = {}) { this.file = file; this.poolProvider = poolProvider; this.pending = Promise.resolve(); }
  async readFileSettings({ storageOnly = false } = {}) {
    try {
      const settings = JSON.parse(await fs.readFile(this.file, 'utf8')).settings || {}
      // The local settings snapshot may contain deployment-specific database
      // values. Only use its storage settings as a bootstrap fallback; all
      // other categories continue to resolve from the current environment.
      return storageOnly
        ? Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith('storage.')))
        : settings
    }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try { return JSON.parse(await fs.readFile(path.resolve('data/cms.json'), 'utf8')).system_settings || {}; }
      catch (legacyError) { if (legacyError.code !== 'ENOENT') throw legacyError; return {}; }
    }
  }
  async read() {
    const db = await this.poolProvider();
    if (db) {
      const [rows] = await db.execute('SELECT setting_key, value FROM system_settings');
      const current=Object.fromEntries(rows.map(row=>[row.setting_key,JSON.parse(row.value)]));
      // A fresh database can exist before the saved settings have been
      // imported. Keep the configured B2 credentials usable in that state.
      return rows.length ? current : await this.readFileSettings({ storageOnly: true });
    }
    return this.readFileSettings();
  }
  async history() {
    const db = await this.poolProvider();
    if (db) return (await db.execute('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100'))[0];
    try { return (JSON.parse(await fs.readFile(this.file, 'utf8')).history || []).slice(-100).reverse(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return []; }
  }
  transaction(work) {
    const run = this.pending.then(async () => {
      const db = await this.poolProvider();
    if (!db) {
        let document;
        try { document = JSON.parse(await fs.readFile(this.file, 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; document = { settings: await this.read(), history: [] }; }
        const result = await work(document.settings);
        try {
          document.settings = result.settings;
          document.history.push(...result.audit);
          await fs.mkdir(path.dirname(this.file), { recursive: true });
          const temporary = `${this.file}.${process.pid}.tmp`;
          await fs.writeFile(temporary, JSON.stringify(document, null, 2), { mode: 0o600 });
          await fs.rename(temporary, this.file);
        } catch (error) { await result.discard?.(); throw error; }
        await result.activate?.();
        return;
      }
      const connection = await db.getConnection();
      let result;
      let freezeLock = false;
      try {
        await connection.query('SELECT pg_advisory_lock_shared($1)',[DATABASE_MIGRATION_FREEZE_LOCK_ID]);freezeLock=true
        await connection.beginTransaction();
        // This existing singleton row serializes saves across application replicas.
        await connection.execute('SELECT id FROM settings_lock WHERE id = 1 FOR UPDATE');
        const [rows] = await connection.execute('SELECT setting_key, value FROM system_settings');
        result = await work(Object.fromEntries(rows.map(row => [row.setting_key, JSON.parse(row.value)])));
        for (const entry of result.audit) {
          if (result.settings[entry.setting_key] === undefined) await connection.execute('DELETE FROM system_settings WHERE setting_key = ?', [entry.setting_key]);
          else if (db.driver === 'postgresql') await connection.execute('INSERT INTO system_settings (setting_key, value, updated_by) VALUES (?, ?, ?) ON CONFLICT (setting_key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=CURRENT_TIMESTAMP', [entry.setting_key, JSON.stringify(result.settings[entry.setting_key]), entry.user_id]);
          else await connection.execute('INSERT INTO system_settings (setting_key, value, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_by=VALUES(updated_by)', [entry.setting_key, JSON.stringify(result.settings[entry.setting_key]), entry.user_id]);
          await connection.execute('INSERT INTO audit_logs (id,user_id,action,category,setting_key,old_value,new_value,ip_address) VALUES (?,?,?,?,?,?,?,?)', [entry.id, entry.user_id, entry.action, entry.category, entry.setting_key, JSON.stringify(entry.old_value), JSON.stringify(entry.new_value), entry.ip_address]);
        }
        await connection.commit();
        await result.activate?.();
      } catch (error) { await connection.rollback().catch(() => {}); await result?.discard?.(); throw error; }
      finally { if(freezeLock)await connection.query('SELECT pg_advisory_unlock_shared($1)',[DATABASE_MIGRATION_FREEZE_LOCK_ID]).catch(()=>{});connection.release(); }
    });
    this.pending = run.catch(() => {});
    return run;
  }
}
