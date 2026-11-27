import '../../config/bootstrap.js';
import { dependencyReason } from '../../services/startupDiagnostics.js';
import { createClient } from 'redis';
import { resolveRedisConfiguration } from './redisConfiguration.js';
import { createHash } from 'node:crypto';


// Invalid optional infrastructure must not throw while importing the API.
let managed;
try { managed = resolveRedisConfiguration(); }
catch { managed = { enabled: false, url: null, source: 'invalid' }; console.warn(JSON.stringify({ event: 'redis_configuration_invalid', status: 'unavailable' })); }
const redisEndpoint = managed.url ? new URL(managed.url) : null;
const basePrefix = String(process.env.REDIS_PREFIX || 'getafe').trim().replace(/:+$/, '') || 'getafe';
const isolatedPrefix = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'
  ? `${basePrefix}:${process.env.VERCEL_ENV}:${createHash('sha256').update(process.env.VERCEL_GIT_COMMIT_REF || process.env.VERCEL_URL || 'development').digest('hex').slice(0, 12)}`
  : process.env.NODE_ENV === 'production' ? basePrefix : `${basePrefix}:${process.env.NODE_ENV || 'development'}`;
export const redisConfig = Object.freeze({
  enabled: managed.enabled,
  url: managed.url,
  source: managed.source,
  prefix: isolatedPrefix,
  connectTimeoutMs: Math.max(1000, Number.parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10)),
  reconnectMaxDelayMs: Math.max(1000, Number.parseInt(process.env.REDIS_RECONNECT_MAX_DELAY_MS || '30000', 10)),
});

export const redisPrefix = redisConfig.prefix;

let reconnectAttempt = 0;
let scheduledRetryMs = 0;
const retryDelay = retries => {
  reconnectAttempt = retries;
  if (retries >= 5) return new Error('Redis reconnection limit reached');
  const base = Math.min(redisConfig.reconnectMaxDelayMs, 1000 * 2 ** Math.min(Math.max(0, retries), 5));
  scheduledRetryMs = Math.min(redisConfig.reconnectMaxDelayMs, base + Math.floor(Math.random() * Math.min(250, Math.max(0, redisConfig.reconnectMaxDelayMs - base))));
  return scheduledRetryMs;
};

const redis = createClient({
  ...(redisConfig.url ? { url: redisConfig.url } : {}),
  socket: {
    connectTimeout: redisConfig.connectTimeoutMs,
    reconnectStrategy: retryDelay,
  },
  disableOfflineQueue: true,
  commandsQueueMaxLength: 1000,
  commandOptions: { timeout: 5000 },
});

let connectionPromise = null;
let outageStartedAt = 0;
let lastErrorCode = '';
let lastErrorAt = 0;
let initialReadyLogged = false;

const errorCode = error => /^[A-Z0-9_]{2,48}$/.test(String(error?.code || error?.cause?.code || ''))
  ? String(error?.code || error?.cause?.code) : 'REDIS_CONNECTION_ERROR';

redis.on('error', error => {
  const now = Date.now();
  const code = errorCode(error);
  if (!outageStartedAt) outageStartedAt = now;
  if (code !== lastErrorCode || now - lastErrorAt >= 60000) {
    console.warn(JSON.stringify({ event: 'redis_unavailable', pid: process.pid, code, retry_count: reconnectAttempt, next_retry_ms: scheduledRetryMs || null, reason: dependencyReason(error) }));
    lastErrorCode = code;
    lastErrorAt = now;
  }
});
redis.on('ready', () => {
  if (outageStartedAt) {
    console.info(JSON.stringify({ event: 'redis_recovered', pid: process.pid, retry_count: reconnectAttempt, outage_ms: Date.now() - outageStartedAt }));
    outageStartedAt = 0;
    reconnectAttempt = 0;
    scheduledRetryMs = 0;
    lastErrorCode = '';
    lastErrorAt = 0;
  } else if (!initialReadyLogged) {
    initialReadyLogged = true;
    console.info(JSON.stringify({ event: 'redis_ready', pid: process.pid }));
  }
});

export function isRedisReady() {
  return redisConfig.enabled && redis.isReady;
}

export function redisHealth() {
  if (!redisConfig.enabled) return 'degraded';
  return redis.isReady ? 'healthy' : 'degraded';
}

export async function connectRedis() {
  if (!redisConfig.enabled) return false;
  if (redis.isReady) return pingRedis();
  if (redis.isOpen && !connectionPromise) return false;
  if (!connectionPromise) {
    console.info(JSON.stringify({ event: 'redis_connecting', pid: process.pid, host: redisEndpoint?.hostname || null, port: redisEndpoint ? Number(redisEndpoint.port || (redisEndpoint.protocol === 'rediss:' ? 6380 : 6379)) : null, source: managed.source }));
    connectionPromise = redis.connect()
      .then(() => pingRedis())
      .catch(() => false)
      .finally(() => { connectionPromise = null; });
  }
  // Bound initial readiness checks while the client establishes a connection.
  let timer;
  const initialWait = new Promise(resolve => {
    timer = setTimeout(() => resolve(false), redisConfig.connectTimeoutMs + 1000);
    timer.unref?.();
  });
  return Promise.race([connectionPromise, initialWait]).finally(() => clearTimeout(timer));
}

export async function pingRedis() {
  if (!redisConfig.enabled || !isRedisReady()) return false;
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis() {
  if (!redis.isOpen) return;
  if (!redis.isReady) {
    redis.destroy();
    return;
  }
  try {
    await redis.quit();
  } catch {
    try { redis.disconnect(); } catch { /* already closed */ }
  }
}

export default redis;
