import crypto from 'node:crypto';
import net from 'node:net';
import redis, { closeRedis, connectRedis, isRedisReady, redisConfig, redisHealth } from '../infrastructure/redis/redisClient.js';
import { redisKeys } from '../infrastructure/redis/redisKeys.js';

const MAX_CLIENTS = 50_000;
const integer = (key, fallback, min = 0) => {
  const value = process.env[key];
  if (value === undefined || value === '') return fallback;
  const number = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(number) || number < min) throw new Error(`${key} must be an integer of at least ${min}`);
  return number;
};
const firstInteger = (keys, fallback, min = 0) => {
  const key = keys.find(candidate => process.env[candidate] !== undefined && process.env[candidate] !== '');
  return integer(key || keys[0], fallback, min);
};
const boolean = (key, fallback) => {
  const value = process.env[key];
  if (value === undefined || value === '') return fallback;
  if (!['true', 'false'].includes(value.toLowerCase())) throw new Error(`${key} must be true or false`);
  return value.toLowerCase() === 'true';
};
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');

const requestHeader = (req, name) => {
  if (typeof req.get === 'function') return req.get(name) || '';
  return req.headers?.[name.toLowerCase()] || req.headers?.[name] || '';
};

const requestPath = req => String(req.originalUrl || req.url || req.path || '/');
const isApiRoute = path => path === '/api' || path.startsWith('/api/');
const isMutation = method => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

// Internal bypass is deliberately opt-in and cryptographically authenticated.
// A marker such as X-Internal-Request is never sufficient because it is
// indistinguishable from a browser-supplied value.
export function createServiceSignature({ secret, timestamp, method, path }) {
  return crypto.createHmac('sha256', String(secret))
    .update(String(timestamp) + '\n' + String(method || 'GET').toUpperCase() + '\n' + path)
    .digest('hex');
}

export function resolveServicePrincipal(req, now = Date.now()) {
  const configuredId = String(process.env.INTERNAL_SERVICE_ID || '').trim();
  const secret = String(process.env.INTERNAL_SERVICE_SECRET || '').trim();
  if (!configuredId || !secret) return null;

  const serviceId = String(requestHeader(req, 'X-Internal-Service-Id')).trim();
  const rawTimestamp = String(requestHeader(req, 'X-Internal-Service-Timestamp')).trim();
  const signature = String(requestHeader(req, 'X-Internal-Service-Signature')).trim().toLowerCase();
  if (!serviceId || !rawTimestamp || !signature || serviceId !== configuredId || !/^\d{10,13}$/.test(rawTimestamp)) return null;

  const numericTimestamp = Number(rawTimestamp);
  const timestampMs = rawTimestamp.length === 10 ? numericTimestamp * 1000 : numericTimestamp;
  const maxSkewMs = Number.parseInt(process.env.INTERNAL_SERVICE_MAX_SKEW_MS || '60000', 10);
  if (!Number.isSafeInteger(timestampMs) || !Number.isSafeInteger(maxSkewMs) || Math.abs(now - timestampMs) > Math.max(1000, maxSkewMs)) return null;

  const expected = createServiceSignature({ secret, timestamp: rawTimestamp, method: req.method, path: requestPath(req) });
  const provided = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (provided.length !== expectedBuffer.length || !crypto.timingSafeEqual(provided, expectedBuffer)) return null;
  return { id: serviceId, type: 'service', verified: true };
}

export function normalizeAddress(value) {
  let address = String(value || '').trim();
  if (!address) return '';
  if (address.startsWith('[') && address.includes(']')) address = address.slice(1, address.indexOf(']'));
  if (net.isIP(address) === 0 && address.includes('.') && address.lastIndexOf(':') > address.lastIndexOf('.')) address = address.slice(0, address.lastIndexOf(':'));
  if (/^::ffff:/i.test(address)) address = address.slice(7);
  return net.isIP(address) ? address.toLowerCase() : '';
}

function ipv4Number(address) {
  const parts = normalizeAddress(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((value, part) => (value * 256) + part, 0);
}

function ipv6Number(address) {
  const value = normalizeAddress(address);
  if (net.isIP(value) !== 6) return null;
  const [left, right, ...extra] = value.split('::');
  if (extra.length) return null;
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];
  const missing = 8 - leftParts.length - rightParts.length;
  if (missing < 0 || (!value.includes('::') && missing !== 0)) return null;
  const parts = [...leftParts, ...Array(missing).fill('0'), ...rightParts];
  if (parts.length !== 8 || parts.some(part => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  return parts.reduce((result, part) => (result << 16n) + BigInt(Number.parseInt(part, 16)), 0n);
}

export function cidrContains(address, cidr) {
  const [network, rawBits] = String(cidr || '').trim().split('/');
  const normalizedAddress = normalizeAddress(address);
  const normalizedNetwork = normalizeAddress(network);
  const family = net.isIP(normalizedAddress);
  if (!family || family !== net.isIP(normalizedNetwork)) return false;
  const bits = Number(rawBits);
  const maxBits = family === 4 ? 32 : 128;
  if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) return false;
  if (family === 4) {
    const value = ipv4Number(normalizedAddress);
    const base = ipv4Number(normalizedNetwork);
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((value >>> 0) & mask) === ((base >>> 0) & mask);
  }
  const value = ipv6Number(normalizedAddress);
  const base = ipv6Number(normalizedNetwork);
  const mask = bits === 0 ? 0n : ((1n << BigInt(bits)) - 1n) << BigInt(128 - bits);
  return (value & mask) === (base & mask);
}

export const trafficConfig = Object.freeze({
  enabled: boolean('RATE_LIMIT_ENABLED', true),
  redisEnabled: redisConfig.enabled,
  redisUrl: redisConfig.url,
  trustedProxyCidrs: (process.env.RATE_LIMIT_TRUSTED_PROXY_CIDRS || '').split(',').map(value => value.trim()).filter(Boolean),
  maxQueueDepth: integer('RATE_LIMIT_MAX_QUEUE_DEPTH', 100),
  maxDelayedPerClient: integer('RATE_LIMIT_MAX_DELAYED_REQUESTS_PER_CLIENT', 2),
  maxDelayedGlobal: integer('RATE_LIMIT_MAX_GLOBAL_DELAYED_REQUESTS', 100),
  maxActive: integer('RATE_LIMIT_MAX_ACTIVE_REQUESTS', 200),
});

const limit = (rate, windowMs, burst) => ({ rate, windowMs, burst });
const policy = (limits, options) => ({ ...limits[0], limits, ...options });
const generalMax = firstInteger(['RATE_LIMIT_GENERAL_MAX', 'RATE_LIMIT_API_PER_MINUTE'], 120, 1);
const generalWindow = firstInteger(['RATE_LIMIT_GENERAL_WINDOW_MS'], 60_000, 1);
const authenticatedMax = firstInteger(['RATE_LIMIT_AUTHENTICATED_MAX', 'RATE_LIMIT_SIGNED_IN_MAX'], 1200, 1);
const authenticatedWindow = firstInteger(['RATE_LIMIT_AUTHENTICATED_WINDOW_MS', 'RATE_LIMIT_SIGNED_IN_WINDOW_MS'], 60_000, 1);
const adminStaffMax = firstInteger(['RATE_LIMIT_ADMIN_STAFF_MAX', 'RATE_LIMIT_STAFF_MAX'], 2400, 1);
const adminStaffWindow = firstInteger(['RATE_LIMIT_ADMIN_STAFF_WINDOW_MS', 'RATE_LIMIT_STAFF_WINDOW_MS'], 60_000, 1);
const expensiveMax = firstInteger(['RATE_LIMIT_EXPENSIVE_MAX'], 30, 1);
const expensiveWindow = firstInteger(['RATE_LIMIT_EXPENSIVE_WINDOW_MS'], 60_000, 1);
const authMax = firstInteger(['RATE_LIMIT_AUTH_MAX', 'AUTH_RATE_LIMIT_MAX'], 10, 1);
const authWindow = firstInteger(['RATE_LIMIT_AUTH_WINDOW_MS', 'AUTH_RATE_LIMIT_WINDOW_MS'], 60_000, 1);
const authSustainedMax = firstInteger(['RATE_LIMIT_AUTH_SUSTAINED_MAX', 'AUTH_SUSTAINED_MAX'], 30, 1);
const authSustainedWindow = firstInteger(['RATE_LIMIT_AUTH_SUSTAINED_WINDOW_MS', 'AUTH_SUSTAINED_WINDOW_MS'], 900_000, 1);
const otpMax = firstInteger(['RATE_LIMIT_OTP_MAX', 'OTP_RATE_LIMIT_MAX'], 5, 1);
const otpWindow = firstInteger(['RATE_LIMIT_OTP_WINDOW_MS', 'OTP_RATE_LIMIT_WINDOW_MS'], 60_000, 1);

export const policies = Object.freeze({
  public: policy([
    limit(integer('RATE_LIMIT_PUBLIC_PER_MINUTE', 240, 1), 60_000, integer('RATE_LIMIT_PUBLIC_BURST', 40, 1)),
  ], { maxDelayMs: integer('RATE_LIMIT_PUBLIC_MAX_DELAY_MS', 150), concurrency: 20 }),
  general: policy([
    limit(generalMax, generalWindow, firstInteger(['RATE_LIMIT_GENERAL_BURST', 'RATE_LIMIT_API_BURST'], Math.min(generalMax, 30), 1)),
  ], { maxDelayMs: integer('RATE_LIMIT_API_MAX_DELAY_MS', 500), concurrency: 12 }),
  authenticated: policy([
    limit(authenticatedMax, authenticatedWindow, firstInteger(['RATE_LIMIT_AUTHENTICATED_BURST', 'RATE_LIMIT_SIGNED_IN_BURST'], Math.min(authenticatedMax, 200), 1)),
  ], { maxDelayMs: 0, concurrency: 32 }),
  admin_staff: policy([
    limit(adminStaffMax, adminStaffWindow, firstInteger(['RATE_LIMIT_ADMIN_STAFF_BURST', 'RATE_LIMIT_STAFF_BURST'], Math.min(adminStaffMax, 400), 1)),
  ], { maxDelayMs: 0, concurrency: 48 }),
  expensive: policy([
    limit(expensiveMax, expensiveWindow, firstInteger(['RATE_LIMIT_EXPENSIVE_BURST'], Math.min(expensiveMax, 8), 1)),
  ], { maxDelayMs: 0, concurrency: 4 }),
  authentication: policy([
    limit(authMax, authWindow, firstInteger(['RATE_LIMIT_AUTH_BURST', 'AUTH_RATE_LIMIT_BURST'], authMax, 1)),
    limit(authSustainedMax, authSustainedWindow, firstInteger(['RATE_LIMIT_AUTH_SUSTAINED_BURST', 'AUTH_SUSTAINED_BURST'], authSustainedMax, 1)),
  ], { maxDelayMs: 0, concurrency: 3 }),
  otp: policy([
    limit(otpMax, otpWindow, firstInteger(['RATE_LIMIT_OTP_BURST', 'OTP_RATE_LIMIT_BURST'], otpMax, 1)),
    limit(firstInteger(['RATE_LIMIT_OTP_SUSTAINED_MAX', 'OTP_SUSTAINED_MAX'], 20, 1), firstInteger(['RATE_LIMIT_OTP_SUSTAINED_WINDOW_MS', 'OTP_SUSTAINED_WINDOW_MS'], 900_000, 1), firstInteger(['RATE_LIMIT_OTP_SUSTAINED_BURST', 'OTP_SUSTAINED_BURST'], 20, 1)),
  ], { maxDelayMs: 0, concurrency: 2 }),
  contact_form: policy([
    limit(firstInteger(['RATE_LIMIT_CONTACT_MAX'], 5, 1), firstInteger(['RATE_LIMIT_CONTACT_WINDOW_MS'], 60_000, 1), firstInteger(['RATE_LIMIT_CONTACT_BURST'], 5, 1)),
  ], { maxDelayMs: 0, concurrency: 2 }),
  uploads: policy([
    limit(integer('RATE_LIMIT_UPLOADS_PER_MINUTE', 12, 1), 60_000, integer('RATE_LIMIT_UPLOADS_BURST', 4, 1)),
  ], { maxDelayMs: integer('RATE_LIMIT_UPLOADS_MAX_DELAY_MS', 100), concurrency: 2 }),
  media_read: policy([
    limit(integer('RATE_LIMIT_MEDIA_READ_PER_MINUTE', 180, 1), 60_000, integer('RATE_LIMIT_MEDIA_READ_BURST', 40, 1)),
  ], { maxDelayMs: integer('RATE_LIMIT_MEDIA_READ_MAX_DELAY_MS', 250), concurrency: 12 }),
  admin_sensitive: policy([
    limit(integer('RATE_LIMIT_ADMIN_PER_MINUTE', 120, 1), 60_000, integer('RATE_LIMIT_ADMIN_BURST', 30, 1)),
  ], { maxDelayMs: integer('RATE_LIMIT_ADMIN_MAX_DELAY_MS', 250), concurrency: 6 }),
});

export function policyFor(req, context = false) {
  const path = requestPath(req).split('?')[0];
  const normalizedContext = typeof context === 'boolean'
    ? { session: context ? { kind: 'authenticated' } : null, service: null }
    : (context || {});
  const session = normalizedContext.session || null;
  const service = normalizedContext.service || null;
  const isAuthenticated = Boolean(session);
  const mutation = isMutation(req.method);
  const apiRoute = isApiRoute(path);
  if (/^\/api\/contact(?:\/|$)/.test(path) && req.method === 'POST') return 'contact_form';
  if (/^\/api\/(?:auth|portal-auth)\/(?:login|register)$/.test(path)
    || /^\/api\/auth\/google(?:\/callback)?$/.test(path)) return 'authentication';
  if (/^\/api\/auth\/(?:verify-code|resend-code|forgot-password(?:\/.*)?|renew-password|mfa(?:\/|$))/.test(path)
    || /^\/api\/citizen\/onboarding\/verification\/(?:request|confirm)$/.test(path)) return 'otp';
  if (req.method === 'POST' && (/^\/api\/feedback\/article$/.test(path) || /^\/api\/public-data\/datasets\/[^/]+\/query$/.test(path))) return 'expensive';
  if (req.method === 'GET' && /^\/api\/weather\/forecast$/.test(path)) return 'expensive';
  // A verified service identity bypasses normal request buckets, but never
  // bypasses the strict auth or expensive policies above.
  if (service?.verified) return 'internal_service';
  if (mutation && (/^\/api\/(?:admin|staff)(?:\/|$)/.test(path) || /^\/api\/account\/(?:avatar|password|change-password)$/.test(path))) return 'admin_sensitive';
  if (session?.kind === 'cms') return 'admin_staff';
  if (isAuthenticated) return 'authenticated';
  if (req.method === 'GET' && (path === '/api/citizen/profile/avatar' || path === '/api/account/avatar')) return 'general';
  if (req.method === 'GET' && path === '/api/media') return 'media_read';
  if (/^\/api\/(?:storage|media|citizen\/documents|citizen\/profile\/avatar)/.test(path) || (mutation && path.startsWith('/uploads/'))) return 'uploads';
  if (req.method === 'GET' && path.startsWith('/api/')) return 'public';
  // Browser-delivered UI documents and static files are not API operations.
  // Keep upload mutations eligible for the upload policy, and use the generic
  // API policy for unexpected non-API writes. Do not assign a catch-all public
  // bucket to browser-delivered documents.
  return apiRoute || mutation ? 'general' : null;
}

export function isTrustedProxyAddress(address) {
  return trafficConfig.trustedProxyCidrs.some(cidr => cidrContains(address, cidr));
}

export function resolveClient(req, getAuthenticatedId = () => null) {
  const service = resolveServicePrincipal(req);
  if (service) return { type: 'service', value: hash('service:' + service.id), principal: service };
  // Only trust an identity installed by an API-key authentication layer. A
  // caller-controlled header by itself must never let clients rotate buckets.
  const apiPrincipal = req.apiKeyPrincipal?.id ?? req.apiClient?.id;
  if (typeof apiPrincipal === 'string' && apiPrincipal.length > 0 && apiPrincipal.length <= 512) {
    return { type: 'api_key', value: hash(`api-client:${apiPrincipal}`) };
  }
  const userId = getAuthenticatedId(req);
  if (userId) return { type: 'user', value: hash(`user:${userId}`) };
  const upstream = normalizeAddress(req.socket?.remoteAddress) || 'unknown';
  // Express computes req.ip by walking the forwarding chain right-to-left
  // through the configured trusted-proxy CIDRs. Never select the first raw
  // X-Forwarded-For or Cloudflare header supplied by an untrusted client.
  const address = isTrustedProxyAddress(upstream) ? normalizeAddress(req.ip) || upstream : upstream;
  return { type: 'ip', value: hash(`ip:${address}`) };
}

export function resolveClientAddress(req) {
  const upstream = normalizeAddress(req.socket?.remoteAddress) || 'unknown';
  return isTrustedProxyAddress(upstream) ? normalizeAddress(req.ip) || upstream : upstream;
}

const LUA = `local r=redis.call('HMGET',KEYS[1],'t','u','s'); local n=tonumber(ARGV[1]); local rate=tonumber(ARGV[2]); local win=tonumber(ARGV[3]); local cap=tonumber(ARGV[4]); local t=tonumber(r[1]) or cap; local u=tonumber(r[2]) or n; local s=tonumber(r[3]) or 0; t=math.min(cap,t+math.max(0,n-u)*rate/win); local ok=t>=1; if ok then t=t-1;s=math.max(0,s-1) else s=s+1 end; local retry=ok and 0 or math.ceil((1-t)*win/rate); redis.call('HMSET',KEYS[1],'t',t,'u',n,'s',s); redis.call('PEXPIRE',KEYS[1],math.max(win*2,60000)); local ttl=redis.call('PTTL',KEYS[1]); return {ok and 1 or 0,math.floor(cap-t),math.floor(t),retry,s,ttl}`;

class LocalStore {
  constructor() { this.items = new Map(); }

  async consume(key, configuredLimit, now) {
    if (!this.items.has(key) && this.items.size >= MAX_CLIENTS) this.items.delete(this.items.keys().next().value);
    const prior = this.items.get(key) || { tokens: configuredLimit.burst, updated: now, strikes: 0 };
    const tokens = Math.min(configuredLimit.burst, prior.tokens + Math.max(0, now - prior.updated) * configuredLimit.rate / configuredLimit.windowMs);
    const allowed = tokens >= 1;
    const result = { tokens: allowed ? tokens - 1 : tokens, updated: now, strikes: allowed ? Math.max(0, prior.strikes - 1) : prior.strikes + 1 };
    this.items.set(key, result);
    return {
      allowed,
      count: Math.max(0, Math.ceil(configuredLimit.burst - result.tokens)),
      limit: configuredLimit.rate,
      remaining: Math.max(0, Math.floor(result.tokens)),
      retryMs: allowed ? 0 : Math.ceil((1 - tokens) * configuredLimit.windowMs / configuredLimit.rate),
      strikes: result.strikes,
      source: 'local-fallback',
    };
  }
}

const bucketName = (name, index) => ({
  authentication: index === 0 ? 'auth:burst' : 'auth:sustained',
  otp: index === 0 ? 'otp' : 'otp:sustained',
  contact_form: 'contact',
  uploads: 'upload',
  admin_sensitive: 'admin',
  general: 'general',
  authenticated: 'authenticated',
  admin_staff: 'admin-staff',
  expensive: 'expensive',
  public: 'public',
}[name] || `${name}:${index}`);

export class AdaptiveTrafficProtector {
  constructor({ getAuthenticatedId = () => null, getAuthenticatedSession = () => null, getServicePrincipal = resolveServicePrincipal, getOverloaded = () => false, now = () => Date.now() } = {}) {
    this.getAuthenticatedId = getAuthenticatedId;
    this.getAuthenticatedSession = getAuthenticatedSession;
    this.getServicePrincipal = getServicePrincipal;
    this.getOverloaded = getOverloaded;
    this.now = now;
    this.local = new LocalStore();
    this.active = 0;
    this.delayed = 0;
    this.clients = new Map();
    this.redisFallbackLogged = false;
    this.localBlocks = new Map();
  }

  async start() {
    const connected = await connectRedis();
    if (!connected && redisConfig.enabled) this.logRedisFallback();
    return connected;
  }

  async stop() { await closeRedis(); }

  health() { return redisHealth(); }

  logRedisFallback() {
    if (this.redisFallbackLogged) return;
    this.redisFallbackLogged = true;
    console.warn(JSON.stringify({ event: 'traffic_control', source: 'local-fallback', reason: 'redis_unavailable' }));
  }

  keyFor(name, index, client, path = '') {
    const group = name === 'public' ? String(path).match(/^\/api\/([^/]+)/)?.[1] || 'web' : '';
    const bucket = bucketName(name, index) + (group ? ':' + group.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) : '');
    return redisKeys.rateLimit(bucket, client.value);
  }

  async consumeLimit(key, configuredLimit) {
    if (isRedisReady()) {
      try {
        const data = await redis.eval(LUA, { keys: [key], arguments: [String(this.now()), String(configuredLimit.rate), String(configuredLimit.windowMs), String(configuredLimit.burst)] });
        const ttlMs = Number(data[5]);
        const tokenRetryMs = Number(data[3]);
        return {
          allowed: Number(data[0]) === 1,
          count: Number(data[1]),
          limit: configuredLimit.rate,
          remaining: Math.max(0, Number(data[2])),
          retryMs: ttlMs > 0 ? Math.min(tokenRetryMs, ttlMs) : tokenRetryMs,
          strikes: Number(data[4]),
          ttlMs,
          source: 'redis',
        };
      } catch {
        this.logRedisFallback();
      }
    }
    return this.local.consume(key, configuredLimit, this.now());
  }

  async consume(client, name, configuredPolicy, path = '') {
    const results = [];
    for (const [index, configuredLimit] of configuredPolicy.limits.entries()) {
      const result = await this.consumeLimit(this.keyFor(name, index, client, path), configuredLimit);
      results.push({ ...result, bucket: bucketName(name, index) });
    }
    const blocked = results.filter(result => !result.allowed);
    return {
      allowed: blocked.length === 0,
      count: Math.max(...results.map(result => result.count)),
      limit: Math.min(...results.map(result => result.limit)),
      remaining: Math.min(...results.map(result => result.remaining)),
      retryMs: blocked.length ? Math.max(...blocked.map(result => result.retryMs)) : 0,
      retryAfter: blocked.length ? Math.max(1, Math.ceil(Math.max(...blocked.map(result => result.retryMs)) / 1000)) : 0,
      strikes: Math.max(...results.map(result => result.strikes)),
      source: results.some(result => result.source === 'local-fallback') ? 'local-fallback' : 'redis',
      reason: blocked.some(result => result.bucket.includes(':burst') || result.bucket === 'otp') ? 'burst_excess' : blocked.length ? 'sustained_excess' : null,
    };
  }

  middleware() {
    return async (req, res, next) => {
      if (req.method === 'OPTIONS') return next();
      const requestPath = String(req.originalUrl || req.path || '').split('?')[0];
      const isUiDocument = ['GET', 'HEAD'].includes(req.method) && !isApiRoute(requestPath);
      const isStaticAsset = isUiDocument && (requestPath.startsWith('/assets/') || /\.(?:css|js|mjs|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf)$/i.test(requestPath));
      if (['/health', '/healthz', '/ready'].includes(requestPath) || isStaticAsset || isUiDocument) return next();

      const detectedSession = this.getAuthenticatedSession(req) || null;
      const detectedUserId = detectedSession?.id || this.getAuthenticatedId(req);
      const session = detectedSession || (detectedUserId ? { id: detectedUserId, kind: 'authenticated' } : null);
      if (session) req.trafficSession = session;
      const client = resolveClient(req, this.getAuthenticatedId);
      const service = client.principal || this.getServicePrincipal(req);
      const name = policyFor(req, { session, service });
      const authPolicy = name === 'authentication' || name === 'otp';
      if (!trafficConfig.enabled && !authPolicy) return next();
      const identityType = service?.verified
        ? 'service'
        : session?.kind === 'cms'
          ? 'admin_staff'
          : session
            ? 'authenticated'
            : client.type === 'ip'
              ? 'anonymous_ip'
              : client.type;
      const logDecision = (action, { remaining = null, retryAfter = 0, reason = null, source = 'none', limit = null } = {}) => {
        if (action === 'allow' && String(process.env.RATE_LIMIT_DEBUG || '').toLowerCase() !== 'true') return;
        const payload = {
          event: 'traffic_control',
          request_id: req.requestId || null,
          method: req.method,
          policy: name,
          route_policy: name,
          route: requestPath,
          client_type: identityType,
          identity_type: identityType,
          action,
          remaining,
          retry_after: retryAfter,
          reason,
          ...(limit === null ? {} : { limit }),
          source,
        };
        (action === 'reject' ? console.warn : console.info)(JSON.stringify(payload));
      };
      if (name === 'internal_service') {
        logDecision('bypass', { reason: 'verified_service', source: 'verified_service' });
        return next();
      }
      const configuredPolicy = policies[name];
      if (!configuredPolicy) return next();
      if (process.env.NODE_ENV === 'production' && authPolicy && !isRedisReady()) {
        return res.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
      }
      const overloaded = this.getOverloaded();
      const policyToUse = overloaded
        ? { ...configuredPolicy, limits: configuredPolicy.limits.map(configuredLimit => ({ ...configuredLimit, burst: 1 })), burst: 1, maxDelayMs: 0 }
        : configuredPolicy;
      const blockScope = `${name}:${client.value}`;
      const blockKey = redisKeys.block(name, client.value);
      let blockedUntil = this.localBlocks.get(blockScope) || 0;
      if (isRedisReady()) {
        try {
          const remaining = await redis.ttl(blockKey);
          if (remaining > 0) blockedUntil = Math.max(blockedUntil, this.now() + remaining * 1000);
        } catch { this.logRedisFallback(); }
      }
      if (blockedUntil > this.now()) {
        const retry = Math.max(1, Math.ceil((blockedUntil - this.now()) / 1000));
        logDecision('reject', { remaining: 0, retryAfter: retry, reason: 'temporary_block', source: isRedisReady() ? 'redis' : 'local-fallback' });
        res.setHeader('Retry-After', String(retry));
        res.setHeader('Cache-Control', 'no-store');
        if (name === 'authentication' || name === 'otp') return res.status(429).json({ error: 'Too many attempts. Please try again later.', retryAfter: retry });
        return res.status(429).json({ error: 'temporarily_blocked', message: 'Too many requests. Please try again later.', retryAfter: retry });
      }
      const result = await this.consume(client, name, policyToUse, requestPath);
      if (process.env.NODE_ENV === 'production' && authPolicy && result.source !== 'redis') {
        return res.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
      }
      const retry = Math.max(1, Math.ceil(result.retryMs / 1000));
      const policyHeader = policyToUse.limits.map(configuredLimit => `${configuredLimit.rate};w=${Math.ceil(configuredLimit.windowMs / 1000)}`).join(', ');
      res.setHeader('RateLimit-Policy', policyHeader);
      res.setHeader('RateLimit', `limit=${result.limit}, remaining=${result.remaining}, reset=${retry}`);

      const reject = reason => {
        res.setHeader('Retry-After', String(retry));
        res.setHeader('Cache-Control', 'no-store');
        logDecision('reject', { remaining: result.remaining, retryAfter: retry, reason, source: result.source, limit: result.limit });
        const authenticationRequest = name === 'authentication' || name === 'otp';
        const message = authenticationRequest ? 'Too many attempts. Please try again later.' : 'Too many requests. Please try again shortly.';
        return res.status(429).json(authenticationRequest
          ? { error: message, retryAfter: retry }
          : { error: 'rate_limited', message, retryAfter: retry });
      };

      if (result.allowed) {
        logDecision('allow', { remaining: result.remaining, source: result.source, limit: result.limit });
        return this.enter(req, res, next, client, name, policyToUse, identityType);
      }
      if (result.strikes >= 8) {
        blockedUntil = this.now() + 5 * 60_000;
        if (!this.localBlocks.has(blockScope) && this.localBlocks.size >= MAX_CLIENTS) this.localBlocks.delete(this.localBlocks.keys().next().value);
        this.localBlocks.set(blockScope, blockedUntil);
        if (isRedisReady()) {
          try { await redis.set(blockKey, '1', { EX: 300 }); } catch { this.logRedisFallback(); }
        }
      }
      if (overloaded || result.strikes >= 4 || !policyToUse.maxDelayMs || result.retryMs > policyToUse.maxDelayMs) return reject(overloaded ? 'load_shed' : (result.reason || 'sustained_excess'));
      const pendingKey = redisKeys.rateLimitWait(name, client.value);
      const pending = this.clients.get(pendingKey) || 0;
      if (this.delayed >= trafficConfig.maxQueueDepth || this.delayed >= trafficConfig.maxDelayedGlobal || pending >= trafficConfig.maxDelayedPerClient) return reject('queue_full');
      this.delayed++;
      this.clients.set(pendingKey, pending + 1);
      const delay = Math.min(policyToUse.maxDelayMs, result.retryMs) + Math.floor(Math.random() * 25);
      setTimeout(() => {
        this.delayed--;
        const count = (this.clients.get(pendingKey) || 1) - 1;
        count ? this.clients.set(pendingKey, count) : this.clients.delete(pendingKey);
        this.enter(req, res, next, client, name, policyToUse, identityType);
      }, delay);
    };
  }

  enter(req, res, next, client, name, policy, identityType = 'unknown') {
    const key = redisKeys.rateLimitActive(name, client.value);
    const current = this.clients.get(key) || 0;
    if (this.active >= trafficConfig.maxActive || current >= policy.concurrency) {
      console.warn(JSON.stringify({
        event: 'traffic_control',
        request_id: req.requestId || null,
        method: req.method,
        policy: name,
        route_policy: name,
        route: requestPath(req),
        client_type: identityType,
        identity_type: identityType,
        action: 'reject',
        remaining: null,
        retry_after: 1,
        reason: 'concurrency',
        source: 'local',
      }));
      res.setHeader('Retry-After', '1');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(429).json({ error: 'rate_limited', message: 'The service is busy. Please try again shortly.', retryAfter: 1 });
    }
    this.active++;
    this.clients.set(key, current + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.active--;
      const count = (this.clients.get(key) || 1) - 1;
      count ? this.clients.set(key, count) : this.clients.delete(key);
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  }
}
