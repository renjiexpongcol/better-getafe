import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigPool } from '../config/DatabaseSettingsProvider.js';
const localFile = process.env.AUTH_LOCAL_FILE || path.resolve('data/auth-state.json');
let pending = Promise.resolve();
export function stateKey(kind, value) { return `${kind}:${crypto.createHash('sha256').update(value).digest('hex')}`; }
export function stateTransaction(key, work) {
  const operation = pending.then(async () => {
    const pool = await getConfigPool();
    if (!pool) {
      let entries = {};
      try { entries = JSON.parse(await fs.readFile(localFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const local = new Map(Object.entries(entries));
      const entry = local.get(key);
      const result = await work(entry?.expires > Date.now() ? entry.value : null);
      if (result.value === null) local.delete(key); else local.set(key, { value: result.value, expires: result.expires });
      for (const [name, item] of local) if (item.expires <= Date.now()) local.delete(name);
      await fs.mkdir(path.dirname(localFile), { recursive: true });
      await fs.writeFile(`${localFile}.tmp`, JSON.stringify(Object.fromEntries(local)), { mode: 0o600 });
      await fs.rename(`${localFile}.tmp`, localFile);
      return result.result;
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(pool.driver === 'postgresql' ? 'INSERT INTO auth_state (state_key,value,expires_at) VALUES (?, ?, 0) ON CONFLICT (state_key) DO NOTHING' : 'INSERT IGNORE INTO auth_state (state_key,value,expires_at) VALUES (?, ?, 0)', [key, 'null']);
      const [[row]] = await connection.execute('SELECT value,expires_at FROM auth_state WHERE state_key=? FOR UPDATE', [key]);
      const result = await work(Number(row.expires_at) > Date.now() ? JSON.parse(row.value) : null);
      if (result.value === null) await connection.execute('DELETE FROM auth_state WHERE state_key=?', [key]);
      else await connection.execute('UPDATE auth_state SET value=?, expires_at=? WHERE state_key=?', [JSON.stringify(result.value), result.expires, key]);
      await connection.commit();
      return result.result;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  });
  pending = operation.catch(() => {});
  return operation;
}
export async function putState(key, value, milliseconds) { return stateTransaction(key, async () => ({ value, expires: Date.now() + milliseconds })); }
export async function consumeState(key) { return stateTransaction(key, async value => ({ value: null, result: value })); }
export async function readState(key) {
  const pool = await getConfigPool();
  if (!pool) {
    try {
      const entries = JSON.parse(await fs.readFile(localFile, 'utf8'));
      const entry = entries[key];
      return entry?.expires > Date.now() ? entry.value : null;
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  const [[row]] = await pool.execute('SELECT value,expires_at FROM auth_state WHERE state_key=?', [key]);
  return row && Number(row.expires_at) > Date.now() ? JSON.parse(row.value) : null;
}
