export function resolveRedisConfiguration(env = process.env) {
  const primary = String(env.MY_REDIS_REDIS_URL || '').trim();
  const legacy = String(env.REDIS_URL || '').trim();
  if (primary && legacy && primary !== legacy) throw new Error('MY_REDIS_REDIS_URL and REDIS_URL conflict. Remove the obsolete REDIS_URL value.');
  const value = primary || legacy;
  if (!value) return Object.freeze({ enabled: false, url: null, source: 'unconfigured' });
  let url;
  try { url = new URL(value); } catch { throw new Error('MY_REDIS_REDIS_URL must be a valid Redis URL.'); }
  if (['localhost', '127.0.0.1', '::1', 'redis', 'getafe-redis'].includes(url.hostname.toLowerCase())) {
    throw new Error('MY_REDIS_REDIS_URL must point to the Vercel-managed Redis service, not a local Redis server.');
  }
  if (!['redis:', 'rediss:'].includes(url.protocol) || !url.hostname || !url.password || url.hash || url.search) {
    throw new Error('MY_REDIS_REDIS_URL must be an authenticated redis:// or rediss:// URL.');
  }
  if (env.VERCEL === '1' && url.protocol !== 'rediss:') throw new Error('Vercel Redis connections require TLS (rediss://).');
  return Object.freeze({ enabled: true, url: value, source: primary ? 'MY_REDIS_REDIS_URL' : 'REDIS_URL' });
}
