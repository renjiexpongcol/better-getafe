export function sessionTtlSeconds(expiresAt, now = Date.now()) {
  return Math.max(1, Math.ceil((Number(expiresAt) - now) / 1000))
}

export function assertSessionRegistryAvailable(ready, production = process.env.NODE_ENV === 'production') {
  if (production && !ready) {
    const error = new Error('Session registry is unavailable.')
    error.code = 'AUTH_SESSION_REGISTRY_UNAVAILABLE'
    throw error
  }
}

export async function extendRedisKeyExpiry(redis, key, seconds) {
  const ttl = Math.max(1, Math.trunc(Number(seconds) || 1))
  const result = await redis.eval(
    "local current=redis.call('TTL',KEYS[1]); local target=tonumber(ARGV[1]); if current<target then return redis.call('EXPIRE',KEYS[1],target) end; return 0",
    { keys: [key], arguments: [String(ttl)] },
  )
  return Number(result) === 1
}
