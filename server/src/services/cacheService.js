import redis, { isRedisReady } from '../infrastructure/redis/redisClient.js';
import { redisKeys } from '../infrastructure/redis/redisKeys.js';
import { withRedisLock } from './redisInfrastructure.js';

const inFlight = new Map();

const metric = event => {
  globalThis.getafeMetrics ||= Object.create(null);
  globalThis.getafeMetrics[event] = (globalThis.getafeMetrics[event] || 0) + 1;
};

export const cacheService = {
  async get(group, resource) {
    if (!isRedisReady()) return null;
    try {
      const version = await redis.get(redisKeys.cacheVersion(group)) || '0';
      const value = await redis.get(redisKeys.cache(group, resource, version));
      metric(value === null ? 'cache_miss' : 'cache_hit');
      return value === null ? null : JSON.parse(value);
    } catch { return null; }
  },
  async set(group, resource, value, ttlSeconds = 300) {
    if (!isRedisReady()) return false;
    try {
      const version = await redis.get(redisKeys.cacheVersion(group)) || '0';
      await redis.set(redisKeys.cache(group, resource, version), JSON.stringify(value), { EX: ttlSeconds });
      return true;
    } catch { return false; }
  },
  async del(group, resource) {
    if (!isRedisReady()) return false;
    try { await redis.del(redisKeys.cache(group, resource)); return true; } catch { return false; }
  },
  async getOrSet(group, resource, loader, ttlSeconds = 300) {
    const cached = await this.get(group, resource);
    if (cached !== null) return cached;
    const flightKey = `${group}:${resource}`;
    if (inFlight.has(flightKey)) return inFlight.get(flightKey);
    const pending = (async () => {
      if (isRedisReady()) {
        const locked = await withRedisLock(`cache-refresh:${flightKey}`, 5000, async () => {
          const refreshedCache = await this.get(group, resource);
          if (refreshedCache !== null) return refreshedCache;
          const value = await loader();
          await this.set(group, resource, value, ttlSeconds);
          return value;
        }).catch(() => null);
        if (locked?.acquired) return locked.value;
        await new Promise(resolve => setTimeout(resolve, 40));
        const valueAfterRefresh = await this.get(group, resource);
        if (valueAfterRefresh !== null) return valueAfterRefresh;
      }
      const value = await loader();
      await this.set(group, resource, value, ttlSeconds);
      return value;
    })().finally(() => inFlight.delete(flightKey));
    inFlight.set(flightKey, pending);
    return pending;
  },
  async getOrSetNegative(group, resource, loader, ttlSeconds = 600, negativeTtlSeconds = 45) {
    const cached = await this.get(group, resource);
    if (cached !== null) return cached;
    if (await this.get(`${group}-missing`, resource)) return null;
    const flightKey = `negative:${group}:${resource}`;
    if (inFlight.has(flightKey)) return inFlight.get(flightKey);
    const pending = (async () => {
      const value = await loader();
      if (value === null || value === undefined) await this.set(`${group}-missing`, resource, { notFound: true }, negativeTtlSeconds);
      else await this.set(group, resource, value, ttlSeconds);
      return value ?? null;
    })().finally(() => inFlight.delete(flightKey));
    inFlight.set(flightKey, pending);
    return pending;
  },
  async getOrSetStale(group, resource, loader, { ttlSeconds = 300, staleSeconds = 600 } = {}) {
    if (!isRedisReady()) return this.getOrSet(group, resource, loader, ttlSeconds);
    const version = await redis.get(redisKeys.cacheVersion(group)).catch(() => '0') || '0';
    const key = redisKeys.cache(group, resource, version);
    try {
      const raw = await redis.get(key);
      if (raw) {
        const entry = JSON.parse(raw);
        if (entry?.cacheMeta) {
          const now = Date.now();
          if (now <= entry.cacheMeta.freshUntil) { metric('cache_hit'); return entry.data; }
          if (now <= entry.cacheMeta.staleUntil) {
            metric('cache_hit');
            void withRedisLock(`cache-refresh:${group}:${resource}`, 10_000, async () => {
              const data = await loader();
              await redis.set(key, JSON.stringify({ data, cacheMeta: { createdAt: Date.now(), freshUntil: Date.now() + ttlSeconds * 1000, staleUntil: Date.now() + (ttlSeconds + staleSeconds) * 1000 } }), { EX: ttlSeconds + staleSeconds });
            }).catch(() => {});
            return entry.data;
          }
        }
      }
    } catch { /* Read-through below retains the database source of truth. */ }
    const flightKey = `${group}:${resource}`;
    if (inFlight.has(flightKey)) return inFlight.get(flightKey);
    const pending = (async () => {
      const locked = await withRedisLock(`cache-refresh:${group}:${resource}`, 10_000, async () => {
        const existing = await redis.get(key);
        if (existing) {
          const entry = JSON.parse(existing);
          if (entry?.cacheMeta && Date.now() <= entry.cacheMeta.staleUntil) return entry.data;
        }
        const data = await loader();
        const now = Date.now();
        await redis.set(key, JSON.stringify({ data, cacheMeta: { createdAt: now, freshUntil: now + ttlSeconds * 1000, staleUntil: now + (ttlSeconds + staleSeconds) * 1000 } }), { EX: ttlSeconds + staleSeconds });
        return data;
      }).catch(() => null);
      if (locked?.acquired) return locked.value;
      await new Promise(resolve => setTimeout(resolve, 40));
      const refreshed = await redis.get(key).catch(() => null);
      if (refreshed) {
        const entry = JSON.parse(refreshed);
        if (entry?.cacheMeta) return entry.data;
      }
      return loader();
    })().finally(() => inFlight.delete(flightKey));
    inFlight.set(flightKey, pending);
    return pending;
  },
  async invalidate(group) {
    if (!isRedisReady()) return false;
    try {
      await redis.incr(redisKeys.cacheVersion(group));
      return true;
    } catch { return false; }
  },
};
