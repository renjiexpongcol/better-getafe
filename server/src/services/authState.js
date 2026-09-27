import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigPool } from '../config/DatabaseSettingsProvider.js';
import redis, { isRedisReady } from '../infrastructure/redis/redisClient.js';
import { redisKeys } from '../infrastructure/redis/redisKeys.js';
const localFile = process.env.AUTH_LOCAL_FILE || path.resolve('data/auth-state.json');
let pending = Promise.resolve();
export function stateKey(kind, value) { return `${kind}:${crypto.createHash('sha256').update(value).digest('hex')}`; }
function parseStateValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); }
  catch { console.warn('Invalid persisted auth state encountered; resetting it.'); return null; }
}
export function stateTransaction(key, work) {
  const operation = pending.then(async () => {
    if (isRedisReady()) {
      try {
        const redisKey = redisKeys.authState(key);
        for (let attempt = 0; attempt < 4; attempt++) {
          await redis.watch(redisKey);
          const stored = await redis.get(redisKey);
          let entry = stored ? JSON.parse(stored) : null;
          // Redis can restart while the application is using the durable
          // fallback. Hydrate a cache miss before performing a security state
          // transition so lockouts, OTP attempts, and revocations survive.
          if (!stored) {
            const fallback = await readFallbackState(key).catch(error => {
              if (isRedisReady()) return null;
              throw error;
            });
            if (fallback && fallback.expires > Date.now()) {
              entry = fallback;
              await redis.set(redisKey, JSON.stringify(fallback), { PX: Math.max(1, fallback.expires - Date.now()) });
            }
          }
          const current = entry?.expires > Date.now() ? entry.value : null;
          const result = await work(current);
          const transaction = redis.multi();
          if (result.value === null) transaction.del(redisKey);
          else transaction.set(redisKey, JSON.stringify({ value: result.value, expires: result.expires }), { PX: Math.max(1, result.expires - Date.now()) });
          const committed = await transaction.exec();
          if (committed !== null) return result.result;
        }
        await redis.unwatch();
        throw new Error('Concurrent auth state update; retry the operation.');
      } catch (error) {
        try { await redis.unwatch(); } catch { /* connection may be down */ }
        console.warn(JSON.stringify({ event: 'auth_state', source: 'persistent-fallback', error: error?.message || 'redis unavailable' }));
      }
    }
    const pool = await getConfigPool();
    if (!pool) {
      if (process.env.NODE_ENV === 'production') throw new Error('Shared authentication state storage is unavailable.');
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
      const result = await work(Number(row.expires_at) > Date.now() ? parseStateValue(row.value) : null);
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

async function readFallbackState(key) {
  const pool = await getConfigPool();
  if (!pool) {
    // In production, Redis remains the write authority when healthy. A cache
    // miss is simply an absent state; do not hydrate it from a local file.
    if (process.env.NODE_ENV === 'production') return null;
    try {
      const entries = JSON.parse(await fs.readFile(localFile, 'utf8'));
      return entries[key] || null;
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  const [[row]] = await pool.execute('SELECT value,expires_at FROM auth_state WHERE state_key=?', [key]);
  return row ? { value: parseStateValue(row.value), expires: Number(row.expires_at) } : null;
}
export async function putState(key, value, milliseconds) { return stateTransaction(key, async () => ({ value, expires: Date.now() + milliseconds })); }
export async function consumeState(key) { return stateTransaction(key, async value => ({ value: null, result: value })); }
export async function readState(key) {
  if (isRedisReady()) {
    try {
      const value = await redis.get(redisKeys.authState(key));
      if (value) {
        const entry = JSON.parse(value);
        if (entry.expires > Date.now()) return entry.value;
      }
      // Restore durable state written while Redis was unavailable. Database
      // trouble on a Redis cache miss must not make an otherwise healthy Redis
      // dependency unavailable; the transition then fails closed as absent.
      try {
        const fallback = await readFallbackState(key);
        if (fallback && fallback.expires > Date.now()) {
          const cacheKey = redisKeys.authState(key);
          const stored = await redis.set(cacheKey, JSON.stringify(fallback), { NX: true, PX: Math.max(1, fallback.expires - Date.now()) });
          if (stored === 'OK') return fallback.value;
          const current = await redis.get(cacheKey);
          if (current) {
            const entry = JSON.parse(current);
            if (entry.expires > Date.now()) return entry.value;
          }
        }
      } catch { /* Redis remains the active authority; fail closed on a miss. */ }
      return null;
    } catch { /* Fall through to the existing persistent state store. */ }
  }
  const pool = await getConfigPool();
  if (!pool) {
    if (process.env.NODE_ENV === 'production') {
      if (isRedisReady()) return null;
      throw new Error('Shared authentication state storage is unavailable.');
    }
    try {
      const entries = JSON.parse(await fs.readFile(localFile, 'utf8'));
      const entry = entries[key];
      return entry?.expires > Date.now() ? entry.value : null;
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  const [[row]] = await pool.execute('SELECT value,expires_at FROM auth_state WHERE state_key=?', [key]);
  return row && Number(row.expires_at) > Date.now() ? parseStateValue(row.value) : null;
}
