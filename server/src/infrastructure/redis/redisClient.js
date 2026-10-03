import dotenv from 'dotenv';
import { createClient } from 'redis';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase());
};

export const redisConfig = Object.freeze({
  enabled: parseBoolean(process.env.REDIS_ENABLED, true),
  url: process.env.REDIS_URL || process.env.RATE_LIMIT_REDIS_URL || 'redis://127.0.0.1:6379',
  prefix: String(process.env.REDIS_PREFIX || 'getafe').trim().replace(/:+$/, '') || 'getafe',
  connectTimeoutMs: Math.max(1000, Number.parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10)),
  reconnectMaxDelayMs: Math.max(1000, Number.parseInt(process.env.REDIS_RECONNECT_MAX_DELAY_MS || '30000', 10)),
});

export const redisPrefix = redisConfig.prefix;

const redis = createClient({
  url: redisConfig.url,
  socket: {
    connectTimeout: redisConfig.connectTimeoutMs,
    reconnectStrategy: retries => Math.min(redisConfig.reconnectMaxDelayMs, 1000 * 2 ** Math.min(retries, 5) + Math.floor(Math.random() * 250)),
  },
  disableOfflineQueue: true,
});

let connectionPromise = null;

redis.on('error', error => {
  console.error('[REDIS] Error:', error?.message || error);
});
redis.on('connect', () => console.log('[REDIS] Connected'));
redis.on('ready', () => console.log('[REDIS] Ready'));

export function isRedisReady() {
  return redisConfig.enabled && redis.isReady;
}

export function redisHealth() {
  if (!redisConfig.enabled) return 'disabled';
  return redis.isReady ? 'healthy' : 'degraded';
}

export async function connectRedis() {
  if (!redisConfig.enabled) return false;
  if (redis.isReady) return true;
  if (!connectionPromise) {
    connectionPromise = redis.connect()
      .then(() => redis.isReady)
      .catch(error => {
        console.error('[REDIS] Connection failed:', error?.message || error);
        return false;
      })
      .finally(() => { connectionPromise = null; });
  }
  // The Redis client retries in the background. Do not make HTTP startup wait
  // for an unavailable local Redis instance; the API has a local fallback and
  // Redis can become healthy later without restarting the server.
  let timer;
  const initialWait = new Promise(resolve => {
    timer = setTimeout(() => resolve(false), redisConfig.connectTimeoutMs + 1000);
    timer.unref?.();
  });
  return Promise.race([connectionPromise, initialWait]).finally(() => clearTimeout(timer));
}

export async function pingRedis() {
  if (!isRedisReady()) return false;
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis() {
  if (!redis.isOpen) return;
  try {
    await redis.quit();
  } catch {
    try { redis.disconnect(); } catch { /* already closed */ }
  }
}

export default redis;
