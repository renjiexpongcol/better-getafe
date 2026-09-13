import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { createPoolManager } from '../services/poolManager.js';
import { Connector, IpAddressTypes, AuthTypes } from '@google-cloud/cloud-sql-connector';
let pool;
let bootstrapManager;
export async function getConfigPool() {
  if (!pool) {
    if (process.env.CONFIG_DATABASE_URL) pool = mysql.createPool(process.env.CONFIG_DATABASE_URL);
    else if (process.env.CONFIG_DB_HOST) pool = mysql.createPool({ host: process.env.CONFIG_DB_HOST, port: Number(process.env.CONFIG_DB_PORT || 3306), database: process.env.CONFIG_DB_NAME, user: process.env.CONFIG_DB_USER, password: process.env.CONFIG_DB_PASSWORD, ssl: process.env.CONFIG_DB_SSL === 'false' ? undefined : { rejectUnauthorized: true }, connectionLimit: 3 });
    else if (process.env.CMS_DATABASE_PROVIDER === 'gcp') {
      // Legacy bootstrap connection is intentionally independent of runtime database settings.
      bootstrapManager ||= createPoolManager({ createConnector: () => new Connector(), createPool: options => mysql.createPool(options), ipTypes: IpAddressTypes, authTypes: AuthTypes });
      pool = await bootstrapManager.get('CMS');
    } else if (process.env.NODE_ENV === 'production') throw new Error('A persistent configuration database is required in production.');
  }
  return pool;
}
export async function closeConfigStore() { if (bootstrapManager) await bootstrapManager.close(); else if (pool) await pool.end(); }
export class DatabaseSettingsProvider {
  constructor({ file = process.env.CONFIG_LOCAL_FILE || path.resolve('data/settings.json'), poolProvider = getConfigPool } = {}) { this.file = file; this.poolProvider = poolProvider; this.pending = Promise.resolve(); }
  async read() {
    const db = await this.poolProvider();
    if (db) {
      const [rows] = await db.execute('SELECT setting_key, value FROM system_settings');
      return Object.fromEntries(rows.map(row => [row.setting_key, JSON.parse(row.value)]));
    }
    try { return JSON.parse(await fs.readFile(this.file, 'utf8')).settings || {}; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Import the first increment's settings once, without coupling future writes to CMS data.
      try { return JSON.parse(await fs.readFile(path.resolve('data/cms.json'), 'utf8')).system_settings || {}; }
      catch (legacyError) { if (legacyError.code !== 'ENOENT') throw legacyError; return {}; }
    }
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
        result.activate?.();
        return;
      }
      const connection = await db.getConnection();
      let result;
      try {
        await connection.beginTransaction();
        // This existing singleton row serializes saves across Cloud Run replicas.
        await connection.execute('SELECT id FROM settings_lock WHERE id = 1 FOR UPDATE');
        const [rows] = await connection.execute('SELECT setting_key, value FROM system_settings');
        result = await work(Object.fromEntries(rows.map(row => [row.setting_key, JSON.parse(row.value)])));
        for (const entry of result.audit) {
          if (result.settings[entry.setting_key] === undefined) await connection.execute('DELETE FROM system_settings WHERE setting_key = ?', [entry.setting_key]);
          else await connection.execute('INSERT INTO system_settings (setting_key, value, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_by=VALUES(updated_by)', [entry.setting_key, JSON.stringify(result.settings[entry.setting_key]), entry.user_id]);
          await connection.execute('INSERT INTO audit_logs (id,user_id,action,category,setting_key,old_value,new_value,ip_address) VALUES (?,?,?,?,?,?,?,?)', [entry.id, entry.user_id, entry.action, entry.category, entry.setting_key, JSON.stringify(entry.old_value), JSON.stringify(entry.new_value), entry.ip_address]);
        }
        await connection.commit();
        result.activate?.();
      } catch (error) { await connection.rollback(); await result?.discard?.(); throw error; }
      finally { connection.release(); }
    });
    this.pending = run.catch(() => {});
    return run;
  }
}
