import { registerDestinationRoutes } from './src/services/destinationRoutes.js';
import { rememberGoogleProfile, googleOnboarding } from './src/services/googleOnboarding.js';
import { installCitizenRoutes } from './src/services/citizenRoutes.js';
// Continuing to serve requests after an uncaught exception or unhandled
// rejection can leave shared state partially updated. Log the fatal error and
// terminate so the process supervisor can start a clean worker.
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

import express from "express";
import { getGetafeWeather } from './src/services/getafeWeather.js';
import { getAggregatedCurrent, getAggregatedForecast, providerKeys } from './src/services/weatherAggregator.js';
import { normalizeWeather } from './src/services/weatherNormalizer.js';
import { closeCloudSql, databaseHealth, getPortalPool } from './src/services/cloudSql.js';
import path from "path";
import fs from "node:fs/promises";
import crypto from "crypto";
import QRCode from 'qrcode';
import { config } from './src/config/index.js';
import { closeConfigStore } from './src/config/DatabaseSettingsProvider.js';
import { installSettingsRoutes } from './src/services/settingsRoutes.js';
import { installPublicDataRoutes } from './src/services/publicDataRoutes.js';
import { installAdminUsersRoutes } from './src/services/adminUsersRoutes.js';
import { installStaffRoutes } from './src/services/staffRoutes.js';
import { installAccessManagementRoutes } from './src/services/accessManagementRoutes.js';
import { effectiveAccessFor, hasAccess, requireAccess, audit } from './src/services/authorizationService.js';
import { loginThrottle, passwordResetEmailThrottle, issueCode, resendCode, verifyCode, actionThrottle, verificationCodeDigest } from './src/services/authSecurity.js';
import { stateKey, stateTransaction, putState, consumeState, readState } from './src/services/authState.js';
import { replacePassword } from './src/services/passwords.js';
import { integrationRequest } from './src/services/integrations.js';
import { sendEmail } from './src/services/email.js';
import { AdaptiveTrafficProtector, isTrustedProxyAddress, resolveClient, resolveClientAddress } from './src/services/trafficProtection.js';
import { installContactRoutes } from './src/services/contactRoutes.js';
import { cacheService } from './src/services/cacheService.js';
import redis, { isRedisReady } from './src/infrastructure/redis/redisClient.js';
import { redisKeys } from './src/infrastructure/redis/redisKeys.js';
import { enqueueEmail, recoverEmailJobs, startEmailWorker, stopEmailWorker } from './src/services/redisInfrastructure.js';
import { markNotificationDeliveryFailed, markNotificationDeliverySent, validateQueuedNotification } from './src/services/notificationService.js';
import { assertSessionRegistryAvailable, extendRedisKeyExpiry, sessionTtlSeconds } from './src/services/sessionRegistry.js';
import { passwordMeetsPolicy } from './src/services/passwordPolicy.js';
import { safeUser } from './src/services/authPayload.js';
import { hashPassword, verifyPassword } from './src/services/passwordHashing.js';

import { fileURLToPath } from "url";
import { initializeServices, serviceStatus } from "./src/services/initialization.js";
import { createUploadUrl, uploadObject, createDownloadUrl, deleteObject, getObjectMetadata, readObject, imageSignatureMatches, validateImageUpload, validateObjectKey, storageIsLocal, storageHealth, initializeStorage, writePrivateFile, readPrivateFile, deletePrivateFile, isStorageNotFoundError } from "./src/services/storage.js";

import { getCategories, createCategory, updateCategory, deleteCategory } from "./src/repositories/categoryRepository.js";
import { getNewsArticles, getNewsArticleBySlug, createNewsArticle, updateNewsArticle, deleteNewsArticle, bulkUpdateNewsArticles } from "./src/repositories/newsRepository.js";
import { getMedia, getMediaPage, finalizePendingUpload, createPendingUpload, deletePendingUpload, getMediaByStoragePath, getMediaByChecksum, getPendingUpload } from "./src/repositories/mediaRepository.js";
import { getContentMedia } from './src/repositories/contentMediaRepository.js';
import { cleanupExpiredPendingUploads, deleteMediaAsset, mediaErrorPayload } from './src/services/mediaService.js';
import { getCmsUsers, getCmsUserById, getCmsUserByEmail, saveCmsAvatar } from "./src/repositories/cmsUserRepository.js";
import { getPortalUserByEmail, getPortalUserById, createPortalUser, savePortalUserMfa, consumePortalRecoveryCode } from "./src/repositories/portalUserRepository.js";
import { generateTotpSecret, verifyTotp, encryptMfaSecret, decryptMfaSecret, generateRecoveryCodes, hashRecoveryCode, recoveryCodeMatches } from './src/services/mfa.js';
import { getOfficials, saveOfficials } from "./src/repositories/officialsRepository.js";
import { getBarangays, saveBarangays } from "./src/repositories/barangaysRepository.js";
import { decorateLegacyOfficials, getOfficialDirectory, syncLegacyOfficials, syncBarangayTerms, findElectionMatches, connectElectionRecord, disconnectElectionRecord, rejectElectionRecord, refreshElectionRecord, officialsDataQuality, getOfficeholder, createHistoricalOfficeAssignment } from './src/repositories/governmentOfficialsRepository.js';
import { getPostgresRuntime } from './src/repositories/postgresRuntime.js';
import { sanitizeRichText, sanitizeOfficials, sanitizeBarangays } from './src/services/sanitizeHtml.js';
import { id as createId, now as dbNow } from './src/services/identifiers.js';
import { createPkcePair, getGoogleRedirectUri } from './src/services/googleOAuth.js';
import { isMediaUploadPath } from './src/services/mediaUploadPath.js';
import { createApiCorsMiddleware, createApiSecurityMiddleware } from './src/services/apiRoutePolicy.js';

const invalidatePublicNewsCaches = async () => {
  await Promise.all([
    cacheService.invalidate('news'),
    cacheService.invalidate('news-article'),
    cacheService.invalidate('notifications'),
  ]);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const adminAvatarFailures = new Map();
// Production is behind one trusted proxy. Do not trust forwarded
// client-IP headers during local development, where they can be forged.
app.set('trust proxy', address => isTrustedProxyAddress(address));
const PORT = process.env.PORT || 8080;

// Every request gets a server-generated correlation identifier. It is safe to
// expose to callers and lets operators connect a rejected API response with a
// security audit event without logging credentials or request bodies.
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

async function configuredWeatherProviders() {
  try { await config.load(); } catch { /* Environment defaults remain available when settings storage is unavailable. */ }
  return providerKeys({
    openWeatherApiKey: config.get('weather.openWeatherApiKey'),
    accuWeatherApiKey: config.get('weather.accuWeatherApiKey'),
  });
}

import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const secret = process.env.AUTH_SESSION_SECRET || process.env.CMS_SESSION_SECRET || process.env.SESSION_SECRET || (
  process.env.NODE_ENV === "production" ? null : "change-this-local-development-session-secret"
);
if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) throw new Error('A random AUTH_SESSION_SECRET of at least 32 characters is required in production.');

const trafficProtector = new AdaptiveTrafficProtector({
  // The callback is evaluated at request time, after authenticated() below is
  // initialized. API keys take precedence; authenticated users share a stable
  // identity across IP changes.
  getAuthenticatedSession: req => {
    const session = authenticated(req);
    if (session) req.trafficSession = session;
    return session;
  },
  getAuthenticatedId: req => req.trafficSession?.id || authenticated(req)?.id,
});
// Credentials must only travel over TLS in deployed environments. Local
// development remains available over localhost HTTP for convenience.
app.use((req, res, next) => {
  const secure = req.secure;
  if (process.env.NODE_ENV === 'production' && !secure && (req.path.startsWith('/api/auth') || req.path.startsWith('/api/portal-auth'))) {
    return res.status(400).json({ error: 'Secure HTTPS connection required for sign-in.' });
  }
  next();
});
app.use(trafficProtector.middleware());
// Rate limits run before parsing bodies so large JSON payloads cannot consume
// parsing capacity after a client has already been rejected.
app.use(async (req, res, next) => {
  try { await config.load(); } catch { /* Keep the last known working snapshot; status reports degraded. */ }
  if (config.get('security.frameProtection')) res.setHeader('X-Frame-Options', 'DENY');
  if (config.get('security.contentTypeProtection')) res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; child-src 'self' https://www.facebook.com; frame-src 'self' https://www.facebook.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/; connect-src 'self' https:; font-src 'self' data: https:; form-action 'self'");
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.path.startsWith('/api/')) {
    const hasCookieSession = Boolean(readCookies(req.headers.cookie)[SESSION_COOKIE]);
    const bearer = req.headers.authorization?.startsWith('Bearer ');

    const source = req.get('origin') || (req.get('referer') ? (() => { try { return new URL(req.get('referer')).origin } catch { return '' } })() : '');
    // The configured URL is the canonical public URL, but deployments may be
    // reached through a reverse proxy or an alternate host. In those cases a
    // browser same-origin request must be checked against the effective
    // request origin as well, otherwise every state-changing citizen action
    // is incorrectly rejected as cross-site.
    const effectiveHost = req.get('host') || '';
    const originFor = value => { try { return value ? new URL(value).origin : '' } catch { return '' } };
    const effectiveOrigin = originFor(effectiveHost ? `${req.protocol}://${effectiveHost}` : '');
    const configuredOrigin = originFor(config.get('general.url'));
    // Vite proxies browser requests to the backend during development, so
    // req.get('host') is the backend port (for example :8080), while the
    // browser's same-origin Origin is the frontend port (for example :5173).
    // The proxy preserves the browser Origin and sends its own Host header.
    // Accept that origin only for the local Vite dev server; production
    // requests continue to require the effective or configured site origin.
    const localDevOrigin = process.env.NODE_ENV !== 'production'
      && /^https?:\/\/(localhost|127\.0\.0\.1):5173$/.test(source || '');
    if (hasCookieSession && !bearer && (!source || (!localDevOrigin && ![effectiveOrigin, configuredOrigin].includes(source)))) return res.status(403).json({ error: 'Cross-site request blocked.' });
  }
  if (config.get('maintenance.enabled') && !req.path.startsWith('/api/auth/') && !req.path.startsWith('/auth/') && !req.path.startsWith('/assets/') && !req.path.startsWith('/admin') && req.path !== '/api/public/config' && !req.path.startsWith('/api/admin/settings') && !['/health', '/healthz', '/ready', '/api/health', '/api/health/storage'].includes(req.path)) {
    const session = authenticated(req);
    if (session?.kind === 'cms') {
      try {
        const user = await getCmsUserById(session.id);
        const ips = config.get('maintenance.allowedAdminIps').split(',').map(ip => ip.trim()).filter(Boolean);
        if (['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user?.role) && (!ips.length || ips.includes(resolveClientAddress(req)))) return next();
      } catch { /* Fail closed for regular requests. */ }
    }
    res.setHeader('Retry-After', '60');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const message = escapeHtml(config.get('maintenance.message'));
    const expected = config.get('maintenance.expectedCompletion');
    const expectedText = expected ? `<p class="expected">Expected completion: ${escapeHtml(new Date(expected).toLocaleString(config.get('general.locale'), { timeZone: config.get('general.timezone') }) )}</p>` : '';
    if (req.path.startsWith('/api/')) {
      return res.status(503).json({ error: config.get('maintenance.message'), expectedCompletion: expected });
    }
    res.status(503).type('html').send(`<!doctype html><html lang="${escapeHtml(config.get('general.language'))}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(config.get('general.name'))} · Maintenance</title><style>html,body{margin:0;min-height:100%;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#17324d;background:#f4f8fb}body{display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{max-width:640px;width:100%;text-align:center;background:white;border:1px solid #d9e5ed;border-radius:18px;padding:48px 32px;box-shadow:0 16px 45px #17324d18}h1{margin:0 0 14px;font-size:clamp(28px,5vw,44px)}p{font-size:18px;line-height:1.6;margin:10px 0}.expected{font-size:15px;color:#557086;margin-top:24px}.mark{display:inline-grid;place-items:center;width:64px;height:64px;border-radius:50%;background:#e0f0f5;color:#17617a;font-size:32px;margin-bottom:20px}</style></head><body><main class="card" role="main"><div class="mark" aria-hidden="true">↻</div><h1>${escapeHtml(config.get('general.name'))} is temporarily unavailable</h1><p>${message}</p>${expectedText}<p class="expected">Please check back shortly.</p></main></body></html>`);
    return;
  }
  next();
});
// CORS is an explicit allowlist. No API response uses a wildcard origin, and
// preflight requests are accepted only for routes in the API policy registry.
// Keep it after the rate limiter and common security headers so rejected
// cross-origin traffic is still rate-limited and receives the normal headers.
app.use('/api', createApiCorsMiddleware({ configuredOrigin: () => config.get('general.url') }));
app.use('/api/contact', (req, res, next) => {
  const length = Number(req.get('content-length') || 0);
  if (length > 16 * 1024) return res.status(413).json({ error: 'Message payload is too large.' });
  next();
});
app.use('/api/contact', express.json({ limit: '16kb' }));
app.use(['/api/auth', '/api/portal-auth'], express.json({ limit: '32kb' }));
app.use(express.json({ limit: '8mb' }));
app.use((req, res, next) => { if (req.body === undefined || req.body === null) req.body = {}; next(); });
app.use((error, req, res, next) => {
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON request.', request_id: req.requestId });
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request payload is too large.', request_id: req.requestId });
  next(error);
});

// This is the default-deny API boundary. Route modules remain responsible for
// their existing permission and ownership checks; this layer makes sure a
// newly exposed or accidentally unguarded API path cannot bypass them.
app.use('/api', createApiSecurityMiddleware({
  authenticate: authenticated,
  isRevoked: (...args) => tokenIsRevoked(...args),
}));

app.get('/api/weather/getafe', async (req, res) => {
  try {
    const weather = await getGetafeWeather();
    res.set('Cache-Control', 'public, max-age=900').json(weather);
  } catch {
    res.status(502).json({ error: 'Getafe weather is temporarily unavailable.' });
  }
});
app.get('/api/weather/forecast', async (req, res) => {
  const latitude = Number(req.query.lat), longitude = Number(req.query.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return res.status(400).json({ error: 'A valid location is required.' });
  try {
    const keys = await configuredWeatherProviders();
    const requestedName = typeof req.query.name === 'string' ? req.query.name.trim().slice(0, 100) : '';
    const data = await getAggregatedForecast({ name: requestedName || 'Weather location', lat: latitude, lon: longitude }, keys);
    res.set('Cache-Control', 'public, max-age=900').json(data);
  } catch { res.status(502).json({ error: 'Weather forecast unavailable.' }); }
});
app.get('/api/weather', async (req, res) => {
  const locations = [
    { name: 'Getafe, Bohol', municipality: 'Getafe', province: 'Bohol', region: 'Central Visayas', country: 'Philippines', lat: 10.15, lon: 124.15, timezone: 'Asia/Manila' },
    { name: 'Manila', municipality: 'Manila', province: 'Metro Manila', region: 'National Capital Region', country: 'Philippines', lat: 14.5995, lon: 120.9842, timezone: 'Asia/Manila' },
    { name: 'Cebu City', municipality: 'Cebu City', province: 'Cebu', region: 'Central Visayas', country: 'Philippines', lat: 10.3157, lon: 123.8854, timezone: 'Asia/Manila' },
    { name: 'Davao City', municipality: 'Davao City', province: 'Davao del Sur', region: 'Davao Region', country: 'Philippines', lat: 7.1907, lon: 125.4553, timezone: 'Asia/Manila' },
    { name: 'Baguio City', municipality: 'Baguio City', province: 'Benguet', region: 'Cordillera Administrative Region', country: 'Philippines', lat: 16.4023, lon: 120.596, timezone: 'Asia/Manila' },
  ];
  try {
    const keys = await configuredWeatherProviders();
    const results = await Promise.all(locations.map(location => getAggregatedCurrent(location, keys)));
    res.set('Cache-Control', 'public, max-age=900').json(results.map((result, index) => normalizeWeather(result, locations[index])));
  } catch { res.status(502).json({ error: 'Weather providers are temporarily unavailable.' }); }
});
app.use(['/api/auth', '/api/portal-auth'], (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Cookie');
  next();
});


// Keep missing-account sign-ins on the same versioned scrypt work path.
const DUMMY_LOGIN_PASSWORD_HASH = hashPassword(crypto.randomBytes(32).toString('hex'));
const passwordIsStrong = password => passwordMeetsPolicy(password, config.get('authentication.passwordMinLength'));

const SESSION_COOKIE = 'getafe_session';

// PostgreSQL returns TIMESTAMPTZ columns as Date instances, while a signed
// session payload is JSON and therefore stores an ISO string. Normalize both
// sides before comparison so a valid new sign-in is not mistaken for a stale
// account session.
const sessionUpdatedAt = user => {
  const value = user?.updated_at ?? user?.updatedAt ?? null;
  return value instanceof Date ? value.toISOString() : value;
};

const makeToken = (user, kind, remember = false, sessionId = crypto.randomUUID()) => {
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, kind, sid: sessionId, updatedAt: sessionUpdatedAt(user), iat: issuedAt, remember, exp: issuedAt + (remember ? config.get('authentication.rememberDays') * 86400000 : config.get('authentication.sessionMinutes') * 60000) })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
};

const readCookies = (header = '') => Object.fromEntries(header.split(';').map(part => {
  const index = part.indexOf('=');
  if (index < 0) return [];
  const value = part.slice(index + 1).trim();
  try { return [part.slice(0, index).trim(), decodeURIComponent(value)]; }
  catch { return [part.slice(0, index).trim(), value]; }
}).filter(pair => pair.length));

function authenticated(req) {
  try {
    const authorization = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    const token = authorization || readCookies(req.headers.cookie)[SESSION_COOKIE] || '';
    const [payload, signature] = token.split(".");
    if (!payload || !signature || !secret) return null;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!(data.exp > Date.now() && (data.iat || 0) + (data.remember ? config.get('authentication.rememberDays') * 86400000 : config.get('authentication.sessionMinutes') * 60000) > Date.now())) return null;
    data.signature = signature;
    return data;
  } catch {
    return null;
  }
}

const tokenIsRevoked = async session => {
  if (!session) return false;
  if (!session.sid) return true;
  const registryReady = isRedisReady();
  assertSessionRegistryAvailable(registryReady);
  if (!registryReady) return false;
  if (session.signature && await readState(stateKey('revoked-token', session.signature))) return true;
  if (session.sid && await readState(stateKey('revoked-session', session.sid))) return true;
  const key = redisKeys.session(session.sid);
  try {
    const raw = await redis.get(key);
    if (!raw) {
      await putState(stateKey('revoked-session', session.sid), true, Math.max(1, session.exp - Date.now()));
      return true;
    }
    const metadata = JSON.parse(raw);
    const idleMinutes = Math.max(5, Number(process.env.AUTH_SESSION_IDLE_MINUTES) || 30);
    if (Date.now() - metadata.lastActivityAt > idleMinutes * 60_000) {
      await putState(stateKey('revoked-session', session.sid), true, Math.max(1, session.exp - Date.now()));
      await redis.del(key);
      await redis.sRem(redisKeys.userSessions(session.kind, session.id), session.sid);
      return true;
    }
    metadata.lastActivityAt = Date.now();
    const ttlSeconds = sessionTtlSeconds(session.exp);
    await redis.set(key, JSON.stringify(metadata), { EX: ttlSeconds });
    return false;
  } catch {
    const error = new Error('Session registry is unavailable.');
    error.code = 'AUTH_SESSION_REGISTRY_UNAVAILABLE';
    throw error;
  }
};

const admin = async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  req.admin = authenticated(req);
  try {
    if (await tokenIsRevoked(req.admin) || req.admin?.kind !== 'cms' || !['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(req.admin.role)) return res.status(401).json({ error: "Administrator authentication required." });
    const user = await getCmsUserById(req.admin.id);
    if (!user || !['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user.role) || req.admin.role !== user.role || (req.admin.updatedAt && req.admin.updatedAt !== sessionUpdatedAt(user))) return res.status(401).json({ error: "Administrator authentication required." });
    req.admin = safeUser(user);
    next();
  } catch (error) {
    console.error('Administrator authorization lookup failed:', error.message);
    res.status(503).json({ error: "Authentication service is temporarily unavailable." });
  }
};

const permission = permissionId => async (req, res, next) => {
  try { await requireAccess(req.admin, permissionId); next(); }
  catch (error) {
    const status = [400, 401, 403, 404, 409, 422].includes(Number(error?.status)) ? error.status : 503;
    res.status(status).json({ error: safeClientError(error, status === 503 ? 'Authorization service is temporarily unavailable.' : 'Access denied.') });
  }
};

const safeClientError = (error, fallback) => [400, 401, 403, 404, 409, 422].includes(Number(error?.status))
  ? String(error.message || fallback)
  : fallback;

const resident = async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  const session = authenticated(req);
  try {
    if (!session || await tokenIsRevoked(session) || session.kind !== 'portal' || session.role !== 'resident') return res.status(401).json({ error: 'Resident authentication required.' });
    req.resident = await getPortalUserById(session.id);
    if (!req.resident || req.resident.role !== 'resident' || session.role !== req.resident.role || (session.updatedAt && session.updatedAt !== sessionUpdatedAt(req.resident))) return res.status(401).json({ error: 'Resident account unavailable.' });
    const onboarding = await googleOnboarding(req.resident);
    if (onboarding.setupRequired && !req.path.startsWith('/api/citizen/onboarding/') && !['/api/citizen/profile', '/api/citizen/profile/avatar'].includes(req.path)) return res.status(403).json({ error: 'Complete your account information before using the app.', setupRequired: true });
    next();
  } catch (error) {
    console.error('Resident authentication lookup failed:', error.message);
    res.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
  }
};

const setSessionCookie = async (res, token, remember) => {
  const [encodedPayload] = token.split('.');
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
  const registryReady = isRedisReady();
  assertSessionRegistryAvailable(registryReady);
  if (!payload.sid) throw new Error('Session registry is unavailable.');
  if (registryReady) {
    const ttlSeconds = sessionTtlSeconds(payload.exp);
    const metadata = { userId: payload.id, kind: payload.kind, role: payload.role, updatedAt: payload.updatedAt, createdAt: payload.iat, lastActivityAt: payload.iat, expiresAt: payload.exp };
    try {
      await redis.set(redisKeys.session(payload.sid), JSON.stringify(metadata), { EX: ttlSeconds });
      const index = redisKeys.userSessions(payload.kind, payload.id);
      await redis.sAdd(index, payload.sid);
      await extendRedisKeyExpiry(redis, index, ttlSeconds);
    } catch {
      await redis.del(redisKeys.session(payload.sid)).catch(() => {});
      await redis.sRem(redisKeys.userSessions(payload.kind, payload.id), payload.sid).catch(() => {});
      console.warn(JSON.stringify({ event: 'session_registry_write_failed', kind: payload.kind }));
      throw new Error('Session registry is unavailable.');
    }
  }
  const attributes = ['HttpOnly', 'Path=/', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  if (remember) attributes.push(`Max-Age=${config.get('authentication.rememberDays') * 86400}`);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${attributes.join('; ')}`);
};

const clearSessionCookie = (res) => {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
};

const setGoogleOAuthStateCookie = (res, value, secure) => {
  res.append('Set-Cookie', `google_oauth_state=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`);
};

const clearGoogleOAuthStateCookie = (res, secure) => {
  res.append('Set-Cookie', `google_oauth_state=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
};

function validateArticle(body, res) {
  if (body.content_type !== undefined && !['news', 'event', 'meeting'].includes(body.content_type)) {
    res.status(422).json({ error: "Content type must be News, Event, or Meeting." });
    return false;
  }
  for (const field of ['show_in_news', 'show_in_upcoming', 'show_in_events', 'show_on_homepage']) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') {
      res.status(422).json({ error: `${field} must be true or false.` });
      return false;
    }
  }
  if (body.is_important !== undefined && typeof body.is_important !== 'boolean') {
    res.status(422).json({ error: "Important announcement must be true or false." });
    return false;
  }
  if (!body.title?.trim() || !body.excerpt?.trim() || !body.content?.trim() || body.title.length > 300 || body.excerpt.length > 1000 || body.content.length > 50000) {
    res.status(422).json({ error: "Title, excerpt, and content are required." });
    return false;
  }
  body.content = sanitizeRichText(body.content);
  if (!body.content.trim()) { res.status(422).json({ error: "Article content contains no permitted markup." }); return false; }
  if (body.published_at && Number.isNaN(new Date(body.published_at).getTime())) {
    res.status(422).json({ error: "Publication date must be valid." });
    return false;
  }
  if (body.event_start_at && Number.isNaN(new Date(body.event_start_at).getTime())) {
    res.status(422).json({ error: "Event start date must be valid." });
    return false;
  }
  if (body.event_end_at && Number.isNaN(new Date(body.event_end_at).getTime())) {
    res.status(422).json({ error: "Event end date must be valid." });
    return false;
  }
  if (body.event_start_at && body.event_end_at && new Date(body.event_end_at) < new Date(body.event_start_at)) {
    res.status(422).json({ error: "Event end date cannot be earlier than its start date." });
    return false;
  }
  if (body.show_in_upcoming === true && (!['event', 'meeting'].includes(body.content_type) || !body.event_start_at)) {
    res.status(422).json({ error: "Upcoming content must be an Event or Meeting with a start date." });
    return false;
  }
  return true;
}

function validateDraft(body, res) {
  if (body.content_type !== undefined && !['news', 'event', 'meeting'].includes(body.content_type)) {
    res.status(422).json({ error: "Content type must be News, Event, or Meeting." });
    return false;
  }
  for (const field of ['show_in_news', 'show_in_upcoming', 'show_in_events', 'show_on_homepage']) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') {
      res.status(422).json({ error: `${field} must be true or false.` });
      return false;
    }
  }
  if (body.is_important !== undefined && typeof body.is_important !== 'boolean') {
    res.status(422).json({ error: "Important announcement must be true or false." });
    return false;
  }
  body.title = String(body.title || '').trim();
  body.excerpt = String(body.excerpt || '').trim();
  body.content = sanitizeRichText(String(body.content || ''));
  if (body.title.length > 300 || body.excerpt.length > 1000 || body.content.length > 50000) {
    res.status(422).json({ error: "Draft content exceeds the allowed length." });
    return false;
  }
  if (body.published_at && Number.isNaN(new Date(body.published_at).getTime())) {
    res.status(422).json({ error: "Publication date must be valid." });
    return false;
  }
  if (body.event_start_at && Number.isNaN(new Date(body.event_start_at).getTime())) {
    res.status(422).json({ error: "Event start date must be valid." });
    return false;
  }
  if (body.event_end_at && Number.isNaN(new Date(body.event_end_at).getTime())) {
    res.status(422).json({ error: "Event end date must be valid." });
    return false;
  }
  return true;
}

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const xmlEscape = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const siteUrl = (req) => {
  const configured = config.get('general.url') || `${req.protocol}://${req.get('host')}`;
  return configured.replace(/\/$/, '');
};

const decorate = async (article, lookups = null) => {
  const { categories, users } = lookups || await (async () => ({
    categories: await getCategories(),
    users: await getCmsUsers(),
  }))();
  const relationships = article.id ? await getContentMedia('news', article.id) : [];
  const featuredRelationship = relationships.find((item) => item.role === 'featured');
  const galleryRelationships = new Map(relationships.filter((item) => item.role === 'gallery').map((item) => [item.storage_path, item]));
  return {
    ...article,
    is_important: article.is_important === true || article.is_important === 1,
    show_in_news: article.show_in_news === true || article.show_in_news === 1,
    show_in_upcoming: article.show_in_upcoming === true || article.show_in_upcoming === 1,
    show_in_events: article.show_in_events === true || article.show_in_events === 1,
    show_on_homepage: article.show_on_homepage === true || article.show_on_homepage === 1,
    content: sanitizeRichText(String(article.content || '').replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '')),
    featured_image: await createDownloadUrl(article.featured_image),
    featured_image_path: article.featured_image,
    featured_media_id: featuredRelationship?.media_id || null,
    gallery_images: await Promise.all((Array.isArray(article.gallery_images) ? article.gallery_images : []).map(async (image, index) => ({
      ...image,
      media_id: image.media_id || galleryRelationships.get(image.storage_path)?.media_id || null,
      position: Number.isInteger(image.position) ? image.position : index,
      url: await createDownloadUrl(image.storage_path || image.url || ''),
    }))),
    category: categories.find((c) => c.id === article.category_id) || null,
    author: (() => {
      const u = users.find((u) => u.id === article.author_id);
      return u ? { id: u.id, name: u.name } : null;
    })(),
  };
};

// Public content receives only presentation fields and signed/served media
// URLs. CMS storage keys, author IDs, autosave metadata, and relationship
// internals must not become part of the public API contract.
const publicArticleView = article => ({
  id: article.id,
  title: article.title,
  slug: article.slug,
  excerpt: article.excerpt,
  content: article.content,
  featured_image: article.featured_image,
  gallery_images: (Array.isArray(article.gallery_images) ? article.gallery_images : []).map(({ storage_path: _storagePath, media_id: _mediaId, ...image }) => image),
  category: article.category ? { id: article.category.id, name: article.category.name, slug: article.category.slug } : null,
  author: article.author ? { name: article.author.name } : null,
  content_type: article.content_type,
  event_start_at: article.event_start_at,
  event_end_at: article.event_end_at,
  published_at: article.published_at,
  is_important: article.is_important,
  show_in_news: article.show_in_news,
  show_in_upcoming: article.show_in_upcoming,
  show_in_events: article.show_in_events,
  show_on_homepage: article.show_on_homepage,
});

app.get('/rss.xml', async (req, res) => {
  try {
    const baseUrl = siteUrl(req);
    const published = (await getNewsArticles())
      .filter((article) => article.status === 'published' && (article.show_in_news === true || article.show_in_news === 1) && article.published_at && new Date(article.published_at) <= new Date())
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      .slice(0, 50);
    const items = published.map((article) => {
      const articleUrl = `${baseUrl}/news/${encodeURIComponent(article.slug)}`;
      return `
      <item>
        <title>${xmlEscape(article.title)}</title>
        <link>${xmlEscape(articleUrl)}</link>
        <guid isPermaLink="true">${xmlEscape(articleUrl)}</guid>
        <description>${xmlEscape(article.excerpt)}</description>
        <pubDate>${new Date(article.published_at).toUTCString()}</pubDate>
      </item>`;
    }).join('');
    const updated = published[0]?.published_at ? new Date(published[0].published_at).toUTCString() : new Date().toUTCString();
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(config.get('general.name'))} News &amp; Updates</title>
    <link>${xmlEscape(baseUrl)}</link>
    <description>Official announcements, community information, events, services, and tourism updates from the Municipality of Getafe, Bohol.</description>
    <language>${xmlEscape(config.get('general.locale'))}</language>
    <lastBuildDate>${updated}</lastBuildDate>
    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${xmlEscape(`${baseUrl}/rss.xml`)}" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;
    res.type('application/rss+xml').send(feed);
  } catch (error) {
    console.error('RSS feed generation failed:', error);
    res.status(503).type('text/plain').send('RSS feed unavailable.');
  }
});

app.post('/api/feedback/article', async (req, res) => {
  try {
    const throttle = await actionThrottle('article-feedback', visitorIdentity(req), 3, 60 * 60 * 1000);
    if (!throttle.allowed) { res.set('Retry-After', String(throttle.retryAfter)); return res.status(429).json({ error: 'Please wait before sending another report.', retryAfter: throttle.retryAfter }); }
    const title = String(req.body.articleTitle || '').slice(0, 300);
    const url = String(req.body.articleUrl || '').slice(0, 1000);
    const feedback = String(req.body.feedback || '').slice(0, 4000);
    const includeScreenshot = req.body.includeScreenshot === true;
    const screenshotData = String(req.body.screenshotData || '');
    const reasons = Array.isArray(req.body.reasons) ? req.body.reasons.map(String).slice(0, 10) : [];
    const recipient = config.get('general.supportEmail') || config.get('email.senderEmail');
    if (!recipient) return res.status(503).json({ error: 'Feedback email is not configured.' });
    const configuredUrl = config.get('general.url');
    if (configuredUrl) {
      try { if (new URL(url).origin !== new URL(configuredUrl).origin) return res.status(422).json({ error: 'The article URL is not valid.' }); }
      catch { return res.status(422).json({ error: 'The article URL is not valid.' }); }
    }
    const attachments = includeScreenshot && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(screenshotData) ? [{ filename: 'article-feedback-screenshot.jpg', content: screenshotData.split(',')[1], encoding: 'base64', contentType: 'image/jpeg' }] : [];
    if (includeScreenshot && !attachments.length) return res.status(422).json({ error: 'The screenshot could not be attached. Please select Include screenshot and try again.' });
    await sendEmail(recipient, `Article feedback: ${title || 'Untitled article'}`, `Article: ${title}\nURL: ${url}\nReasons: ${reasons.join(', ') || 'None selected'}\nFeedback: ${feedback || 'No written feedback'}\nScreenshot attached: ${attachments.length ? 'Yes' : 'No'}\nUser agent: ${String(req.body.userAgent || '').slice(0, 500)}`, undefined, undefined, attachments);
    res.json({ message: '' });
  } catch (error) { console.error('Article feedback email failed:', error.message); res.status(503).json({ error: 'The report could not be sent right now. Please try again later.' }); }
});
const visitorIdentity = req => resolveClient(req).value;
const logAuthentication = (action, result, details = {}) => console.info(JSON.stringify({ event: 'authentication', action, result, ...details }));

// -- Auth Routes --
const loginUser = async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!isValidEmail(email) || email.length > 254) return res.status(422).json({ error: 'Enter a valid email address.' });
    if (password.length > 1024) return res.status(422).json({ error: 'Password must be 1,024 characters or fewer.' });
    const remember = req.body.remember === true;
    const requestIdentity = resolveClient(req).value;
    const accountIdentity = crypto.createHmac('sha256', secret).update(email).digest('hex');
    const combinationIdentity = crypto.createHmac('sha256', secret).update(`${requestIdentity}:${email}`).digest('hex');
    const throttle = await loginThrottle({ ip: requestIdentity, account: accountIdentity, combination: combinationIdentity });
    if (!throttle.allowed) {
      logAuthentication('login', 'rate_limited', { client_id: requestIdentity.slice(0, 12), account_id: accountIdentity.slice(0, 12) });
      const retryAfter = throttle.retryAfter;
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many attempts. Please try again later.', retryAfter });
    }
    const [cmsUser, portalUser] = await Promise.all([getCmsUserByEmail(email), getPortalUserByEmail(email)]);
    const user = cmsUser || portalUser;
    const dummyPasswordHash = await DUMMY_LOGIN_PASSWORD_HASH;
    const passwordCheck = await verifyPassword(password, user?.password, dummyPasswordHash);
    const passwordMatches = passwordCheck.valid;
    const eligibleAccount = cmsUser
      ? ['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(cmsUser.role)
      : portalUser?.role === 'resident';
    if (!user || !eligibleAccount || !passwordMatches) {
      logAuthentication('login', 'failed', { reason: 'invalid_credentials', client_id: requestIdentity.slice(0, 12), account_id: accountIdentity.slice(0, 12) });
      await loginThrottle({ ip: requestIdentity, account: accountIdentity, combination: combinationIdentity }, true);
      return res.status(401).json({ error: "Invalid email or password." });
    }
    await loginThrottle({ ip: requestIdentity, account: accountIdentity, combination: combinationIdentity }, false);
    const kind = cmsUser ? 'cms' : 'portal';
    if (passwordCheck.needsRehash) {
      try { await replacePassword(user.id, kind, password, { touchUpdatedAt: false }); }
      catch (error) { console.warn(JSON.stringify({ event: 'password_hash_upgrade_failed', account_kind: kind, error: error?.name || 'Error' })); }
    }
    const age = config.get('authentication.passwordExpiryDays');
    const passwordChanged = await stateTransaction(stateKey('passwordAge', user.id), async value => ({ value, expires: 32503680000000, result: value }));
    if (age && Date.now() - (passwordChanged || Date.parse(user.created_at || '1970-01-01')) > age * 86400000) {
      logAuthentication('login', 'password_reset_required', { kind, account_id: accountIdentity.slice(0, 12) });
      const token = crypto.randomBytes(32).toString('hex');
      await putState(stateKey('passwordReset', token), { id: user.id, kind }, 600000);
      return res.json({ passwordExpired: true, resetToken: token });
    }
    if (kind === 'portal' && (user.mfa_enabled === true || user.mfa_enabled === 1)) {
      logAuthentication('login', 'mfa_challenge', { kind, account_id: accountIdentity.slice(0, 12) });
      const challengeId = crypto.randomBytes(32).toString('hex');
      await putState(stateKey('mfa-login', challengeId), { id: user.id, updatedAt: sessionUpdatedAt(user), remember, attempts: 0, expiresAt: Date.now() + 5 * 60 * 1000 }, 5 * 60 * 1000);
      return res.json({ mfaRequired: true, mfaChallengeId: challengeId });
    }
    const verified = await stateTransaction(stateKey('verified', user.id), async value => ({ value, expires: 3250368000000000, result: value }));
    const emailCodeRequired = config.get('authentication.mfaEnabled') || (config.get('authentication.requireEmailVerification') && !verified);
    if (emailCodeRequired) {
      try {
        const challengeId = await issueCode(user.email, 'login', { id: user.id, kind, updatedAt: sessionUpdatedAt(user), remember });
        const challenge = await readState(stateKey('challenge', challengeId));
        logAuthentication('login', 'email_challenge', { kind, account_id: accountIdentity.slice(0, 12) });
        return res.json({ challengeId, verificationRequired: true, nextResendAt: challenge?.nextResendAt, retryAfter: Math.max(1, Math.ceil(((challenge?.nextResendAt || Date.now() + 30000) - Date.now()) / 1000)) });
      } catch (error) {
        console.error('Sign-in verification email failed:', error.message);
        return res.status(503).json({ error: 'We could not send the sign-in code. Please check the email service configuration and try again.' });
      }
    }
    await setSessionCookie(res, makeToken(user, kind, remember), remember);
    logAuthentication('login', 'success', { kind, account_id: accountIdentity.slice(0, 12) });
    res.json({ user: safeUser(user), admin: kind === 'cms' });
  } catch (error) {
    console.error('Authentication lookup failed:', error.message);
    res.status(503).json({ error: "The sign-in service is temporarily unavailable." });
  }
};

app.post("/api/auth/login", loginUser);

app.post('/api/auth/mfa/verify', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  try {
    const challengeId = String(req.body.challengeId || '');
    const code = String(req.body.code || '');
    if (!/^[a-f0-9]{64}$/i.test(challengeId)) return res.status(401).json({ error: 'This MFA challenge has expired. Sign in again.' });
    const key = stateKey('mfa-login', challengeId);
    const challenge = await readState(key);
    if (!challenge) return res.status(401).json({ error: 'This MFA challenge has expired. Sign in again.' });
    const user = await getPortalUserById(challenge.id);
    if (!user || user.role !== 'resident' || (challenge.updatedAt && challenge.updatedAt !== sessionUpdatedAt(user)) || !(user.mfa_enabled === true || user.mfa_enabled === 1) || !user.mfa_secret_encrypted) return res.status(401).json({ error: 'MFA is unavailable for this account.' });
    const secretValue = decryptMfaSecret(user.mfa_secret_encrypted);
    let completedChallenge = null;
    let recoveryValid = false;
    if (verifyTotp(secretValue, code)) {
      // Verify and consume TOTP challenge state in one serialized transition.
      // Two concurrent submissions can no longer both mint a session.
      const result = await stateTransaction(key, async current => {
        if (!current || current.id !== user.id) return { value: null, result: { challenge: null, attempts: 5 } };
        if (verifyTotp(secretValue, code)) return { value: null, result: { challenge: current, attempts: 0 } };
        current.attempts = (current.attempts || 0) + 1;
        return { value: current.attempts >= 5 ? null : current, expires: current.expiresAt || Date.now() + 5 * 60 * 1000, result: { challenge: null, attempts: current.attempts } };
      });
      completedChallenge = result.challenge;
      if (!completedChallenge) return res.status(401).json({ error: result.attempts >= 5 ? 'Too many attempts. Sign in again.' : 'Invalid authenticator or recovery code.' });
    } else {
      recoveryValid = await consumePortalRecoveryCode(user.id, code, recoveryCodeMatches);
      if (recoveryValid) {
        const consumed = await consumeState(key);
        completedChallenge = consumed?.id === user.id ? consumed : null;
      }
    }
    if (!completedChallenge && !recoveryValid) {
      const attempts = await stateTransaction(key, async current => {
        if (!current) return { value: null, result: 5 };
        current.attempts = (current.attempts || 0) + 1;
        return { value: current.attempts >= 5 ? null : current, expires: current.expiresAt || Date.now() + 5 * 60 * 1000, result: current.attempts };
      });
      return res.status(401).json({ error: attempts >= 5 ? 'Too many attempts. Sign in again.' : 'Invalid authenticator or recovery code.' });
    }
    if (!completedChallenge) return res.status(401).json({ error: 'This MFA challenge has expired. Sign in again.' });
    const sessionUser = recoveryValid ? await getPortalUserById(user.id) : user;
    if (!sessionUser) return res.status(503).json({ error: 'MFA verification is temporarily unavailable.' });
    await setSessionCookie(res, makeToken(sessionUser, 'portal', completedChallenge.remember), completedChallenge.remember);
    res.json({ user: safeUser(sessionUser), admin: false, recoveryCodeUsed: recoveryValid });
  } catch (error) {
    console.error('MFA verification failed:', error.message);
    res.status(503).json({ error: 'MFA verification is temporarily unavailable.' });
  }
});

app.get('/api/auth/google', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const clientId = config.get('google.clientId');
  if (!clientId) return res.status(503).json({ error: 'Google sign-in is not configured.' });
  const intent = req.query.intent === 'signup' ? 'signup' : 'signin';
  const state = crypto.randomBytes(24).toString('hex');
  const pkce = createPkcePair();
  try { await putState(stateKey('google-oauth-state', state), { intent, codeVerifier: pkce.verifier }, 10 * 60 * 1000); }
  catch { return res.status(503).json({ error: 'Google sign-in is temporarily unavailable.' }); }
  setGoogleOAuthStateCookie(res, `${state}.${intent}`, req.secure);
  try {
    const redirect = getGoogleRedirectUri({
      configured: config.get('google.redirectUri'),
      publicSiteUrl: config.get('general.url'),
      protocol: req.protocol,
      host: req.get('host'),
      production: process.env.NODE_ENV === 'production',
    });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account', code_challenge: pkce.challenge, code_challenge_method: 'S256' });
    res.redirect(url.toString());
  } catch (error) {
    clearGoogleOAuthStateCookie(res, req.secure);
    console.error('Google OAuth configuration invalid:', error.message);
    res.status(503).json({ error: 'Google sign-in is temporarily unavailable because its callback is not configured securely.' });
  }
});
app.get('/api/auth/google/callback', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  clearGoogleOAuthStateCookie(res, req.secure);
  try {
    const cookies = readCookies(req.headers.cookie);
    const [savedState, cookieIntent = 'signin'] = String(cookies.google_oauth_state || '').split('.');
    if (!req.query.code || !req.query.state || !/^[a-f0-9]{48}$/.test(String(req.query.state)) || savedState !== req.query.state) return res.status(400).send('Invalid Google sign-in state.');
    const oauthState = await consumeState(stateKey('google-oauth-state', String(req.query.state)));
    if (!oauthState || oauthState.intent !== cookieIntent) return res.status(400).send('Invalid Google sign-in state.');
    const intent = oauthState.intent;
    const redirect = getGoogleRedirectUri({
      configured: config.get('google.redirectUri'),
      publicSiteUrl: config.get('general.url'),
      protocol: req.protocol,
      host: req.get('host'),
      production: process.env.NODE_ENV === 'production',
    });
    if (typeof oauthState.codeVerifier !== 'string' || oauthState.codeVerifier.length < 43) return res.status(400).send('Invalid Google sign-in state.');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: config.get('google.clientId'), client_secret: config.get('google.clientSecret'), redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: oauthState.codeVerifier }), signal: AbortSignal.timeout(10_000) });
    const token = await tokenResponse.json(); if (!tokenResponse.ok) throw new Error('Google token exchange failed.');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) });
    const profile = await profileResponse.json(); if (!profileResponse.ok || !profile.email_verified || typeof profile.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) throw new Error('Google account email is not verified.');
    const cmsUser = await getCmsUserByEmail(profile.email);
    if (cmsUser) {
      if (intent === 'signup') return res.redirect('/auth/login?google=existing');
      if (!['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(cmsUser.role)) return res.redirect('/auth/login?google=unavailable');
      await setSessionCookie(res, makeToken(cmsUser, 'cms', true), true);
      return res.redirect('/admin');
    }
    let user = await getPortalUserByEmail(profile.email);
    if (user && intent === 'signup') return res.redirect('/auth/login?google=existing');
    if (!user) { user = await createPortalUser(profile.name || profile.email, profile.email, crypto.randomBytes(32).toString('hex')); }
    if (user.role !== 'resident') return res.redirect('/auth/login?google=unavailable');
    await rememberGoogleProfile(user, profile);
    const onboarding = await googleOnboarding(user);
    if (user.mfa_enabled === true || user.mfa_enabled === 1) {
      const challengeId = crypto.randomBytes(32).toString('hex');
      await putState(stateKey('mfa-login', challengeId), { id: user.id, updatedAt: sessionUpdatedAt(user), remember: true, attempts: 0, expiresAt: Date.now() + 5 * 60 * 1000 }, 5 * 60 * 1000);
      // Keep the one-use pre-auth challenge out of query strings, proxy logs,
      // and Referer headers; the login page consumes and clears the fragment.
      return res.redirect(`/auth/login#mfa=${encodeURIComponent(challengeId)}`);
    }
    await setSessionCookie(res, makeToken(user, 'portal', true), true); res.redirect(onboarding.setupRequired ? '/app/setup' : '/app/dashboard');
  } catch (error) { console.error('Google OAuth callback failed:', error.message); res.status(503).send('Google sign-in is temporarily unavailable.'); }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const session = authenticated(req);
    const cookies = readCookies(req.headers.cookie);
    if (config.get('advanced.authDebug')) {
      console.info('Auth session check:', { cookiePresent: Boolean(cookies[SESSION_COOKIE]), sessionValid: Boolean(session) });
    }
    if (!session) {
      if (cookies[SESSION_COOKIE]) clearSessionCookie(res);
      // This is a normal state for visitors of public pages. Returning an
      // empty session avoids noisy browser-console failures while preserving
      // the protected-route behavior in the client.
      return res.json({ user: null });
    }
    if (!['cms', 'portal'].includes(session.kind)) {
      clearSessionCookie(res);
      return res.json({ user: null });
    }
    if (await tokenIsRevoked(session)) {
      clearSessionCookie(res);
      return res.json({ user: null });
    }
    const user = session.kind === 'cms' ? await getCmsUserById(session.id) : await getPortalUserById(session.id);
    if (!user || session.role !== user.role || (session.updatedAt && session.updatedAt !== sessionUpdatedAt(user))
      || (session.kind === 'cms' && !['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user.role))
      || (session.kind === 'portal' && user.role !== 'resident')) {
      clearSessionCookie(res);
      return res.json({ user: null });
    }
    const authorization = session.kind === 'cms' ? await effectiveAccessFor(user) : null;
    res.json({
      user: {
        ...safeUser(user),
        ...(session.kind === 'portal' ? await googleOnboarding(user) : {}),
        ...(authorization ? {
          groups: authorization.groups.map(group => ({ id: group.id, name: group.name })),
          permissions: authorization.permissions.filter(permission => permission.allowed).map(permission => permission.id),
        } : {}),
      },
      admin: session.kind === 'cms' && ['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user.role),
    });
  } catch (error) {
    console.error('Authentication session lookup failed:', error.message);
    res.status(503).json({ error: "The sign-in service is temporarily unavailable." });
  }
});

app.patch('/api/account/password', admin, async (req, res) => {
  try {
    const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
    if (!currentPassword || !newPassword) return res.status(422).json({ error: 'Enter your current password and a new password.' });
    if (currentPassword.length > 1024 || newPassword.length > 1024) return res.status(422).json({ error: 'Passwords must be 1,024 characters or fewer.' });
    const throttle = await actionThrottle('cms-password-change', `${req.admin.id}:${resolveClient(req).value}`, 5, 15 * 60 * 1000);
    if (!throttle.allowed) {
      res.setHeader('Retry-After', String(throttle.retryAfter));
      return res.status(429).json({ error: 'Too many attempts. Please try again later.', retryAfter: throttle.retryAfter });
    }

    const account = await getCmsUserById(req.admin.id);
    if (!account || !matches(currentPassword, account.password)) return res.status(401).json({ error: 'Current password is incorrect.' });
    if (!passwordIsStrong(newPassword) || newPassword.length < config.get('authentication.passwordMinLength')) {
      return res.status(422).json({ error: 'Your new password does not meet the password requirements.' });
    }
    if (newPassword === currentPassword) return res.status(422).json({ error: 'Your new password must be different from your current password.' });

    const session = authenticated(req);
    await replacePassword(account.id, 'cms', newPassword);
    const updatedAccount = await getCmsUserById(account.id);
    if (!session || !updatedAccount) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    // replacePassword updates updated_at, so rotate the current cookie after a
    // successful change. Other sessions carrying the previous timestamp stop
    // authenticating while this session stays active.
    await setSessionCookie(res, makeToken(updatedAccount, 'cms', session.remember), session.remember);
    res.json({ ok: true });
  } catch (error) {
    console.error('CMS password change failed:', error.message);
    res.status(503).json({ error: 'Unable to change your password. Please try again.' });
  }
});

app.post('/api/account/avatar', admin, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), async (req, res) => {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim();
  const bytes = req.body;
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!extensions[contentType] || !Buffer.isBuffer(bytes) || !bytes.length || !imageSignatureMatches(bytes, contentType)) {
    return res.status(422).json({ error: 'Choose a valid JPG, PNG, or WebP image.' });
  }
  try {
    const account = await getCmsUserById(req.admin.id);
    if (!account) return res.status(401).json({ error: 'Administrator account unavailable.' });
    const previousPath = account.avatar_storage_path || null;
    const storagePath = `admin-avatars/${account.id}/${crypto.randomUUID()}.${extensions[contentType]}`;
    await writePrivateFile(storagePath, bytes, contentType);
    try {
      await saveCmsAvatar(account.id, storagePath);
    } catch (error) {
      await deletePrivateFile(storagePath).catch(() => {});
      throw error;
    }
    if (previousPath && previousPath !== storagePath) await deletePrivateFile(previousPath).catch(error => console.warn('Previous admin avatar cleanup failed:', error.message));
    adminAvatarFailures.delete(account.id);
    res.status(201).json({ ok: true, avatar_url: `/api/account/avatar?v=${encodeURIComponent(storagePath)}` });
  } catch (error) {
    console.error('Admin avatar upload failed:', error?.message || error);
    res.status(503).json({ error: 'The profile image could not be uploaded right now.' });
  }
});

app.get('/api/account/avatar', admin, async (req, res) => {
  try {
    const account = await getCmsUserById(req.admin.id);
    if (!account?.avatar_storage_path) {
      res.set('Cache-Control', 'private, max-age=60');
      return res.sendStatus(404);
    }
    const blockedUntil = adminAvatarFailures.get(account.id) || 0;
    if (blockedUntil > Date.now()) {
      const retryAfter = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000));
      res.set({ 'Retry-After': String(retryAfter), 'Cache-Control': 'private, max-age=0, must-revalidate' });
      return res.status(503).json({ error: 'Profile image storage is temporarily unavailable.', retryAfter });
    }
    const bytes = await readPrivateFile(account.avatar_storage_path);
    const contentType = account.avatar_storage_path.endsWith('.png') ? 'image/png' : account.avatar_storage_path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    adminAvatarFailures.delete(account.id);
    res.set({ 'Cache-Control': 'private, max-age=300', 'Content-Type': contentType }).send(bytes);
  } catch (error) {
    if (isStorageNotFoundError(error)) {
      await saveCmsAvatar(req.admin.id, null).catch(() => {});
      res.set('Cache-Control', 'private, max-age=60');
      return res.sendStatus(404);
    }
    adminAvatarFailures.set(req.admin.id, Date.now() + 30_000);
    res.set({ 'Retry-After': '30', 'Cache-Control': 'private, max-age=0, must-revalidate' });
    console.error('Administrator avatar retrieval failed:', error?.name || 'StorageError');
    res.status(503).json({ error: 'Profile image storage is temporarily unavailable.', retryAfter: 30 });
  }
});

app.get('/api/auth/mfa/status', resident, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.json({ enabled: req.resident.mfa_enabled === true || req.resident.mfa_enabled === 1, verifiedAt: req.resident.mfa_verified_at || null });
});

app.post('/api/auth/change-password', resident, async (req, res) => {
  try {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (currentPassword.length > 1024 || password.length > 1024) return res.status(422).json({ error: 'Passwords must be 1,024 characters or fewer.' });
    const throttle = await actionThrottle('portal-password-change', `${req.resident.id}:${resolveClient(req).value}`, 5, 15 * 60 * 1000);
    if (!throttle.allowed) { res.set('Retry-After', String(throttle.retryAfter)); return res.status(429).json({ error: 'Too many attempts. Please try again later.', retryAfter: throttle.retryAfter }); }
    if (!matches(currentPassword, req.resident.password)) return res.status(401).json({ error: 'Current password is incorrect.' });
    if (!passwordIsStrong(password) || password.length < config.get('authentication.passwordMinLength')) return res.status(422).json({ error: 'Choose a stronger password with uppercase and lowercase letters, a number, and a special character.' });
    if (password === currentPassword) return res.status(422).json({ error: 'Choose a different password.' });
    await replacePassword(req.resident.id, 'portal', password);
    const updated = await getPortalUserById(req.resident.id);
    const session = authenticated(req);
    if (!updated || !session) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    await setSessionCookie(res, makeToken(updated, 'portal', session.remember === true), session.remember === true);
    res.json({ ok: true });
  } catch (error) { console.error('Password change failed:', error.message); res.status(503).json({ error: 'Password could not be changed.' }); }
});

app.post('/api/auth/mfa/setup', resident, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  try {
    if (req.resident.mfa_enabled === true || req.resident.mfa_enabled === 1) return res.status(409).json({ error: 'MFA is already enabled.' });
    const throttle = await actionThrottle('mfa-setup', req.resident.id, 5, 15 * 60 * 1000);
    if (!throttle.allowed) { res.set('Retry-After', String(throttle.retryAfter)); return res.status(429).json({ error: 'Too many setup attempts. Please try again later.', retryAfter: throttle.retryAfter }); }
    const secretValue = generateTotpSecret();
    const enrollmentId = crypto.randomBytes(32).toString('hex');
    await putState(stateKey('mfa-enrollment', enrollmentId), { userId: req.resident.id, secret: encryptMfaSecret(secretValue), attempts: 0, expiresAt: Date.now() + 10 * 60 * 1000 }, 10 * 60 * 1000);
    const issuer = config.get('general.name') || 'Municipality of Getafe';
    const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(req.resident.email)}?secret=${secretValue}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    const qrCode = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
    res.json({ enrollmentId, secret: secretValue, qrCode, expiresIn: 600 });
  } catch (error) { console.error('MFA setup failed:', error.message); res.status(503).json({ error: 'MFA setup is temporarily unavailable.' }); }
});

app.post('/api/auth/mfa/activate', resident, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  try {
    const key = stateKey('mfa-enrollment', String(req.body.enrollmentId || ''));
    const result = await stateTransaction(key, async current => {
      if (!current || current.userId !== req.resident.id) return { value: null, result: { enrollment: null, attempts: 5 } };
      if (verifyTotp(decryptMfaSecret(current.secret), req.body.code)) return { value: null, result: { enrollment: current, attempts: 0 } };
      current.attempts = (current.attempts || 0) + 1;
      return { value: current.attempts >= 5 ? null : current, expires: current.expiresAt || Date.now() + 10 * 60 * 1000, result: { enrollment: null, attempts: current.attempts } };
    });
    const enrollment = result.enrollment;
    if (!enrollment) return res.status(401).json({ error: result.attempts >= 5 ? 'This setup has expired or has too many invalid codes. Start again.' : 'The authenticator code is invalid. Check your device clock and try again.' });
    const recoveryCodes = generateRecoveryCodes();
    const verifiedAt = new Date().toISOString().replace('T', ' ').slice(0, 23);
    await savePortalUserMfa(req.resident.id, { enabled: true, secret: enrollment.secret, recoveryCodes: recoveryCodes.map(code => hashRecoveryCode(code)), verifiedAt });
    await consumeState(key);
    const updated = await getPortalUserById(req.resident.id);
    const currentSession = authenticated(req);
    await setSessionCookie(res, makeToken(updated, 'portal', currentSession?.remember === true), currentSession?.remember === true);
    res.json({ enabled: true, recoveryCodes });
  } catch (error) { console.error('MFA activation failed:', error.message); res.status(503).json({ error: 'MFA could not be activated.' }); }
});

app.post('/api/auth/mfa/disable/request', resident, async (req, res) => {
  try {
    if (!(req.resident.mfa_enabled === true || req.resident.mfa_enabled === 1)) return res.status(409).json({ error: 'MFA is not enabled.' });
    const throttle = await actionThrottle('mfa-disable-email', req.resident.id, 3, 15 * 60 * 1000);
    if (!throttle.allowed) { res.set('Retry-After', String(throttle.retryAfter)); return res.status(429).json({ error: 'Too many requests. Please try again later.', retryAfter: throttle.retryAfter }); }
    const challengeId = await issueCode(req.resident.email, 'mfa-disable', { userId: req.resident.id });
    res.json({ challengeId, message: 'A confirmation code has been sent to your email address.' });
  } catch (error) { console.error('MFA disable code failed:', error.message); res.status(503).json({ error: 'We could not send the confirmation code.' }); }
});

app.post('/api/auth/mfa/disable/confirm', resident, async (req, res) => {
  try {
    const payload = await verifyCode(String(req.body.challengeId || ''), String(req.body.code || ''), 'mfa-disable');
    if (!payload || payload.userId !== req.resident.id) return res.status(401).json({ error: 'Invalid or expired confirmation code.' });
    await savePortalUserMfa(req.resident.id, { enabled: false, secret: null, recoveryCodes: [], verifiedAt: null });
    const updated = await getPortalUserById(req.resident.id);
    const currentSession = authenticated(req);
    await setSessionCookie(res, makeToken(updated, 'portal', currentSession?.remember === true), currentSession?.remember === true);
    res.json({ enabled: false });
  } catch (error) { console.error('MFA disable failed:', error.message); res.status(503).json({ error: 'MFA could not be disabled.' }); }
});

app.post("/api/auth/logout", async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  clearSessionCookie(res);
  res.append('Set-Cookie', `google_oauth_state=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${req.secure ? '; Secure' : ''}`);
  const cookieSession = authenticated({ headers: { cookie: req.headers.cookie } });
  const bearerSession = req.headers.authorization?.startsWith('Bearer ') ? authenticated({ headers: { authorization: req.headers.authorization } }) : null;
  for (const session of [cookieSession, bearerSession].filter((value, index, sessions) => value && sessions.findIndex(item => item?.signature === value.signature) === index)) {
    const remaining = Math.max(1, session.exp - Date.now());
    try {
      await putState(stateKey('revoked-token', session.signature), true, remaining);
      if (session.sid) {
        await putState(stateKey('revoked-session', session.sid), true, remaining);
        if (isRedisReady()) {
          await redis.del(redisKeys.session(session.sid));
          await redis.sRem(redisKeys.userSessions(session.kind, session.id), session.sid);
        }
      }
    }
    catch (error) {
      console.error('Session revocation failed:', error.message);
      return res.status(503).json({ error: 'Sign out could not be completed.' });
    }
  }
  res.status(200).json({ ok: true });
});

async function ownedSessionContext(req) {
  const session = authenticated(req);
  if (!session || await tokenIsRevoked(session)) return null;
  if (!['cms', 'portal'].includes(session.kind)) return null;
  const user = session.kind === 'cms' ? await getCmsUserById(session.id) : await getPortalUserById(session.id);
  if (!user || session.role !== user.role || (session.kind === 'portal' && user.role !== 'resident') || (session.kind === 'cms' && !['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user.role)) || (session.updatedAt && session.updatedAt !== sessionUpdatedAt(user))) return null;
  return { session, user };
}

app.get('/api/auth/sessions', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  try {
    const context = await ownedSessionContext(req);
    if (!context) return res.status(401).json({ error: 'Authentication required.' });
    if (!isRedisReady()) return res.json({ sessions: context.session.sid ? [{ id: context.session.sid, current: true, createdAt: context.session.iat, lastActivityAt: null, expiresAt: context.session.exp }] : [] });
    const index = redisKeys.userSessions(context.session.kind, context.session.id);
    const ids = await redis.sMembers(index);
    const sessions = [];
    for (const id of ids) {
      const raw = await redis.get(redisKeys.session(id));
      if (!raw) { await redis.sRem(index, id); continue; }
      const metadata = JSON.parse(raw);
      if (Number(metadata.expiresAt) <= Date.now()) {
        await redis.del(redisKeys.session(id));
        await redis.sRem(index, id);
        continue;
      }
      if (metadata.updatedAt !== sessionUpdatedAt(context.user)) {
        await putState(stateKey('revoked-session', id), true, Math.max(1, metadata.expiresAt - Date.now()));
        await redis.del(redisKeys.session(id));
        await redis.sRem(index, id);
        continue;
      }
      sessions.push({ id, current: id === context.session.sid, createdAt: metadata.createdAt, lastActivityAt: metadata.lastActivityAt, expiresAt: metadata.expiresAt });
    }
    res.json({ sessions });
  } catch { res.status(503).json({ error: 'Session management is temporarily unavailable.' }); }
});

app.delete('/api/auth/sessions/:sessionId', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  try {
    const context = await ownedSessionContext(req);
    if (!context) return res.status(401).json({ error: 'Authentication required.' });
    if (!isRedisReady()) return res.status(503).json({ error: 'Session management is temporarily unavailable.' });
    const index = redisKeys.userSessions(context.session.kind, context.session.id);
    if (!(await redis.sIsMember(index, req.params.sessionId))) return res.status(404).json({ error: 'Session not found.' });
    const key = redisKeys.session(req.params.sessionId);
    const raw = await redis.get(key);
    if (!raw) return res.status(404).json({ error: 'Session not found.' });
    const metadata = JSON.parse(raw);
    if (metadata.userId !== context.session.id || metadata.kind !== context.session.kind) return res.status(404).json({ error: 'Session not found.' });
    await putState(stateKey('revoked-session', req.params.sessionId), true, Math.max(1, metadata.expiresAt - Date.now()));
    await redis.del(key);
    await redis.sRem(index, req.params.sessionId);
    if (req.params.sessionId === context.session.sid) clearSessionCookie(res);
    res.json({ ok: true });
  } catch { res.status(503).json({ error: 'Session could not be revoked.' }); }
});

app.delete('/api/auth/sessions', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  try {
    const context = await ownedSessionContext(req);
    if (!context) return res.status(401).json({ error: 'Authentication required.' });
    if (!isRedisReady()) return res.status(503).json({ error: 'Session management is temporarily unavailable.' });
    const index = redisKeys.userSessions(context.session.kind, context.session.id);
    const ids = await redis.sMembers(index);
    const keepCurrent = req.body?.keepCurrent === true;
    for (const id of ids) {
      if (keepCurrent && id === context.session.sid) continue;
      const key = redisKeys.session(id);
      const raw = await redis.get(key);
      const metadata = raw ? JSON.parse(raw) : null;
      await putState(stateKey('revoked-session', id), true, Math.max(1, (metadata?.expiresAt || context.session.exp) - Date.now()));
      await redis.del(key);
      await redis.sRem(index, id);
    }
    if (!keepCurrent) clearSessionCookie(res);
    res.json({ ok: true, revoked: ids.length - (keepCurrent && ids.includes(context.session.sid) ? 1 : 0) });
  } catch { res.status(503).json({ error: 'Sessions could not be revoked.' }); }
});

app.post('/api/portal-auth/login', loginUser);
app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const challengeId = String(req.body.challengeId || '');
    const challenge = await readState(stateKey('challenge', challengeId));
    if (!challenge || (challenge.expiresAt && challenge.expiresAt <= Date.now())) return res.status(401).json({ error: 'This code has expired. Request a new code.' });
    const payload = await verifyCode(challengeId, String(req.body.code || ''), 'login');
    if (!payload) return res.status(401).json({ error: 'The verification code is incorrect.' });
    if (!['cms', 'portal'].includes(payload.kind)) return res.status(401).json({ error: 'Invalid or expired verification code.' });
    const user = payload.kind === 'cms' ? await getCmsUserById(payload.id) : await getPortalUserById(payload.id);
    const eligible = payload.kind === 'cms'
      ? ['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user?.role)
      : user?.role === 'resident';
    if (!user || !eligible || (payload.updatedAt && payload.updatedAt !== sessionUpdatedAt(user))) return res.status(401).json({ error: 'Invalid or expired verification code.' });
    await putState(stateKey('verified', user.id), true, 3153600000000);
    if (payload.kind === 'portal') await (await getPortalPool()).execute('UPDATE portal_users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ?', [user.id]);
    await setSessionCookie(res, makeToken(user, payload.kind, payload.remember), payload.remember);
    res.json({ user: safeUser(user), admin: payload.kind === 'cms' });
  } catch { res.status(503).json({ error: 'Verification is temporarily unavailable.' }); }
});
app.post('/api/auth/resend-code', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  try {
    const challengeId = String(req.body.challengeId || '');
    const challenge = await readState(stateKey('challenge', challengeId));
    const payload = challenge?.purpose === 'login' ? challenge.payload : null;
    const sameChallengeError = { error: 'This verification request has expired. Sign in again.' };
    if (!challenge || !payload || !['cms', 'portal'].includes(payload.kind) || !payload.id) return res.status(401).json(sameChallengeError);
    const user = payload.kind === 'cms' ? await getCmsUserById(payload.id) : await getPortalUserById(payload.id);
    const eligible = payload.kind === 'cms'
      ? ['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user?.role)
      : user?.role === 'resident';
    if (!user || !eligible || (payload.updatedAt && payload.updatedAt !== sessionUpdatedAt(user))) return res.status(401).json(sameChallengeError);
    const accountIdentity = crypto.createHmac('sha256', secret).update(`${payload.kind}:${payload.id}`).digest('hex');
    const result = await resendCode(challengeId, 'login', user.email, { accountIdentity });
    if (!result?.ok) {
      if (result?.reason === 'cooldown' || result?.reason === 'limit') {
        const retryAfter = Math.max(1, Number(result.retryAfter) || 30);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ error: result.reason === 'limit' ? 'Too many codes have been requested. Please wait before trying again.' : `Please wait ${retryAfter} seconds before requesting another code.`, retryAfter });
      }
      if (result?.reason === 'delivery_failed') return res.status(503).json({ error: "We couldn't send a new code. Please try again." });
      if (result?.reason === 'expired') return res.status(401).json(sameChallengeError);
      return res.status(503).json({ error: "We couldn't send a new code. Please try again." });
    }
    res.json({ ok: true, message: 'A new code has been sent to your email.', nextResendAt: result.nextResendAt, retryAfter: result.retryAfter });
  } catch (error) {
    console.error('Verification code resend failed:', error.message);
    res.status(503).json({ error: "We couldn't send a new code. Please try again." });
  }
});
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(422).json({ error: 'Enter a valid email address.' });
    // Apply the same pseudonymized address cooldown whether or not an account
    // exists, so repeat requests do not reveal which addresses are registered.
    const throttle = await passwordResetEmailThrottle(email);
    if (!throttle.allowed) {
      res.set('Retry-After', String(throttle.retryAfter));
      return res.status(429).json({ error: `Please wait ${throttle.retryAfter} seconds before requesting another code.`, retryAfter: throttle.retryAfter });
    }
    const cmsUser = await getCmsUserByEmail(email);
    const user = cmsUser || await getPortalUserByEmail(email);
    if (user) {
      try {
        const challengeId = await issueCode(user.email, 'password-reset', { id: user.id, kind: cmsUser ? 'cms' : 'portal' });
        return res.json({ challengeId, retryAfter: throttle.retryAfter });
      } catch (error) {
        // Keep the public response indistinguishable if delivery fails for an
        // address that maps to an account.
        console.warn(JSON.stringify({ event: 'password_reset_delivery_failed' }));
      }
    }
    // An unusable challenge keeps the response shape and subsequent UI state
    // the same for an unknown address. Its random digest cannot be verified.
    const challengeId = crypto.randomBytes(24).toString('hex');
    const decoyCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const digest = verificationCodeDigest(challengeId, decoyCode);
    await putState(stateKey('challenge', challengeId), { digest, purpose: 'password-reset', payload: null, attempts: 0, expiresAt: Date.now() + 600000 }, 600000);
    res.json({ challengeId, retryAfter: throttle.retryAfter });
  } catch (error) {
    console.error('Password reset request failed:', error.message);
    res.status(503).json({ error: 'Password reset email could not be sent. Please try again later.' });
  }
});
app.post('/api/auth/forgot-password/verify', async (req, res) => {
  try {
    const payload = await verifyCode(String(req.body.challengeId || ''), String(req.body.code || ''), 'password-reset');
    if (!payload) return res.status(401).json({ error: 'Invalid or expired verification code.' });
    const token = crypto.randomBytes(32).toString('hex');
    await putState(stateKey('passwordReset', token), payload, 600000);
    res.json({ resetToken: token });
  } catch { res.status(503).json({ error: 'Verification is temporarily unavailable.' }); }
});
app.post('/api/auth/renew-password', async (req, res) => {
  try {
    const password = String(req.body.password || '');
    if (!passwordIsStrong(password) || password.length < config.get('authentication.passwordMinLength')) return res.status(422).json({ error: 'Choose a stronger password with uppercase and lowercase letters, a number, and a special character.' });
    const payload = await consumeState(stateKey('passwordReset', String(req.body.resetToken || '')));
    if (!payload) return res.status(401).json({ error: 'Password renewal expired. Sign in again.' });
    await replacePassword(payload.id, payload.kind, password);
    await putState(stateKey('passwordAge', payload.id), Date.now(), 3153600000000);
    res.json({ ok: true });
  } catch { res.status(503).json({ error: 'Password renewal failed. Sign in and try again.' }); }
});
app.post("/api/portal-auth/register", async (req, res) => {
  try {
    if (!config.get('authentication.registrationEnabled') || !config.get('features.publicRegistration')) return res.status(403).json({ error: 'Public registration is disabled.' });
    const ipKey = stateKey('registration-attempts', resolveClient(req).value);
    const allowed = await stateTransaction(ipKey, async current => {
      const value = current || { count: 0, expiresAt: Date.now() + 3600000 };
      const expiresAt = value.expiresAt || Date.now() + 3600000;
      if (value.count >= config.get('security.registrationRateLimit')) return { value, expires: expiresAt, result: { allowed: false, retryAfter: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)) } };
      value.count++;
      return { value, expires: expiresAt, result: { allowed: true, retryAfter: 0 } };
    });
    if (!allowed.allowed) {
      const retryAfter = allowed.retryAfter;
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many attempts. Please try again later.', retryAfter });
    }
    if (config.get('security.registrationCaptcha')) {
      const token = String(req.body.captchaToken || '');
      const secretKey = config.get('security.recaptchaSecretKey');
      if (!secretKey || !token) return res.status(422).json({ error: 'Please complete the reCAPTCHA verification.' });
      const verification = await fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(resolveClientAddress(req))}`);
      const result = await verification.json();
      if (!verification.ok || !result.success) return res.status(422).json({ error: 'reCAPTCHA verification failed. Please try again.' });
    }
    const name = String(req.body.name || "").trim(),
      email = String(req.body.email || "").trim().toLowerCase(),
      password = String(req.body.password || "");
    if (password.length > 1024) return res.status(422).json({ error: 'Password must be 1,024 characters or fewer.' });
    if (!name || name.length > 160 || email.length > 255 || !isValidEmail(email) || !passwordIsStrong(password) || password.length < config.get('authentication.passwordMinLength'))
      return res.status(422).json({ error: `Enter a name, a valid email address, and a stronger password of at least ${config.get('authentication.passwordMinLength')} characters.` });

    if (await getCmsUserByEmail(email)) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const user = await createPortalUser(name, email, password);
    await putState(stateKey('passwordAge', user.id), Date.now(), 3153600000000);
    if (config.get('authentication.requireEmailVerification') || config.get('authentication.mfaEnabled')) {
      const challengeId = await issueCode(user.email, 'login', { id: user.id, kind: 'portal', remember: true });
      const challenge = await readState(stateKey('challenge', challengeId));
      return res.status(201).json({ challengeId, verificationRequired: true, nextResendAt: challenge?.nextResendAt, retryAfter: Math.max(1, Math.ceil(((challenge?.nextResendAt || Date.now() + 30000) - Date.now()) / 1000)) });
    }
    await setSessionCookie(res, makeToken(user, 'portal', true), true);
    res.status(201).json({ user: safeUser(user), admin: false });
  } catch (error) {
    res.status(error?.code === "ER_DUP_ENTRY" ? 409 : 503).json({
      error: error?.code === "ER_DUP_ENTRY" ? "An account with that email already exists." : "Portal account service is unavailable.",
    });
  }
});

installSettingsRoutes(app, admin);
installAdminUsersRoutes(app, admin);
installStaffRoutes(app, admin);
installAccessManagementRoutes(app, admin);
installCitizenRoutes(app, resident, safeUser);
installPublicDataRoutes(app);
installContactRoutes(app);

app.get('/api/public/config', async (req, res) => {
  // This endpoint is only an internal bootstrap request. Reject direct browser
  // navigation and cross-site requests to prevent public hotlinking.
  const origin = req.get('origin');
  const referer = req.get('referer');
  const requestHost = `${req.protocol}://${req.get('host')}`;
  const sameOrigin = (!origin && !referer)
    || req.get('sec-fetch-site') === 'same-origin'
    || origin === requestHost
    || (referer && referer.startsWith(`${requestHost}/`));
  if (req.get('sec-fetch-dest') === 'document' || !sameOrigin) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    // Settings can be saved by a different application instance. Refresh the
    // shared settings snapshot before returning it to public pages.
    try { await config.load(true); } catch { /* Keep the last known working snapshot. */ }
    const publicKeys = Object.keys(config.values).filter(key => key.startsWith('general.') || key.startsWith('features.') || key.startsWith('publicData.') || ['authentication.registrationEnabled', 'authentication.passwordMinLength', 'security.registrationCaptcha', 'security.contactCaptcha', 'security.recaptchaProvider', 'security.recaptchaSiteKey', 'notifications.enabled', 'maintenance.enabled', 'maintenance.message', 'maintenance.expectedCompletion'].includes(key));
    res.json(Object.fromEntries(publicKeys.map(key => [key, config.get(key)])));
  } catch (error) {
    console.error('Public configuration unavailable:', error.message);
    // Keep the public site usable while the settings store is recovering.
    res.json({
      'general.name': 'Municipality of Getafe',
      'general.company': 'Municipality of Getafe',
      'general.url': '',
      'general.timezone': 'Asia/Manila',
      'general.locale': 'en-PH',
      'authentication.registrationEnabled': true,
      'authentication.passwordMinLength': 12,
      'notifications.enabled': true,
      'features.uploads': true,
      'features.publicRegistration': true,
      'maintenance.enabled': false,
    });
  }
});

app.get('/api/admin/reports', admin, permission('reports.view'), async (req, res) => {
  if (!config.get('features.reports')) return res.status(403).json({ error: 'Reports are disabled.' });
  try { const articles = await getNewsArticles(); res.json({ generatedAt: new Date().toISOString(), total: articles.length, published: articles.filter(article => article.status === 'published').length }); }
  catch { res.status(503).json({ error: 'Reports unavailable.' }); }
});
// Privacy request administration is part of the CMS Administrator role. Keep
// this check aligned with the navigation and the general admin middleware;
// restricting it to super_admin makes regular Administrators see an option
// they can never use.
const privacyAdmin = permission('privacy.manage');
app.get('/api/admin/privacy-requests', admin, privacyAdmin, async (req, res) => {
  const pool = await getPortalPool(), [requests] = await pool.execute('SELECT * FROM privacy_requests ORDER BY created_at DESC');
  const result = await Promise.all(requests.map(async request => { const [events] = await pool.execute('SELECT * FROM privacy_request_events WHERE request_id = ? ORDER BY created_at DESC', [request.id]); return { ...request, events }; }));
  res.json(result);
});
app.patch('/api/admin/privacy-requests/:id', admin, privacyAdmin, async (req, res) => {
  const allowed = new Set(['submitted', 'identity_verified', 'under_review', 'processing', 'completed', 'additional_information_required', 'partially_completed', 'rejected_unable_to_delete', 'cancelled']);
  const status = String(req.body?.status || ''), note = String(req.body?.note || '').trim().slice(0, 2000);
  if (!allowed.has(status)) return res.status(422).json({ error: 'Choose a valid privacy request status.' });
  if (!note) return res.status(422).json({ error: 'Add an internal or citizen-facing explanation for this update.' });
  const pool = await getPortalPool(), [requests] = await pool.execute('SELECT id FROM privacy_requests WHERE id = ?', [req.params.id]), request = requests[0];
  if (!request) return res.status(404).json({ error: 'Privacy request not found.' });
  const updated = dbNow();
  await pool.execute('UPDATE privacy_requests SET status = ?, updated_at = ?, review_note = ? WHERE id = ?', [status, updated, note, request.id]);
  await pool.execute('INSERT INTO privacy_request_events (id,request_id,actor_id,actor_type,event,note,created_at) VALUES (?,?,?,?,?,?,?)', [createId(), request.id, req.admin.id, 'admin', `status:${status}`, note, updated]);
  res.json({ ok: true, status, updated_at: updated });
});
app.post('/api/admin/integrations/test', admin, permission('system.settings.manage'), async (req, res) => {
  try { await integrationRequest('health'); res.json({ ok: true }); }
  catch { res.status(422).json({ error: 'Integration health check failed. Check configuration and credentials.' }); }
});
app.post('/api/admin/ai', admin, permission('system.settings.manage'), async (req, res) => {
  if (!config.get('features.ai')) return res.status(403).json({ error: 'AI features are disabled.' });
  try { const response = await integrationRequest('ai', { prompt: String(req.body.prompt || '').slice(0, 5000) }); res.json(await response.json()); }
  catch { res.status(503).json({ error: 'AI integration is unavailable.' }); }
});
app.post('/api/admin/notifications/test', admin, permission('system.settings.manage'), async (req, res) => {
  if (!config.get('notifications.enabled') || !config.get('notifications.emailEnabled')) return res.status(403).json({ error: 'Email notifications are disabled.' });
  try { await enqueueEmail({ to: req.admin.email, subject: 'Notification test', text: 'Email notifications are enabled.' }); res.status(202).json({ ok: true, queued: true }); }
  catch { res.status(503).json({ error: 'Notification delivery failed.' }); }
});
app.get('/api/notifications', async (req, res) => {
  if (!config.get('notifications.enabled')) return res.status(403).json({ error: 'Notifications are disabled.' });
  try {
    const notifications = await cacheService.getOrSetStale('notifications', 'latest', async () => (await getNewsArticles())
      .filter(article => article.status === 'published' && (article.show_in_news === true || article.show_in_news === 1) && article.published_at && new Date(article.published_at) <= new Date())
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      .slice(0, 10)
      .map(article => ({ id: article.id, title: article.title, slug: article.slug })), { ttlSeconds: 300, staleSeconds: 900 });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400').json(notifications);
  }
  catch { res.status(503).json({ error: 'Notifications unavailable.' }); }
});

// -- CMS News --
app.get("/api/news", async (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  try {
    const session = authenticated(req);
    const cmsUser = req.query.public !== 'true' && session?.kind === 'cms' && !(await tokenIsRevoked(session)) ? await getCmsUserById(session.id) : null;
    const isAdmin = Boolean(cmsUser && await hasAccess(cmsUser, 'content.news.manage'));
    const safePublicQuery = !isAdmin && !session && !req.query.status && !req.query.search;
    const cacheKey = JSON.stringify(Object.fromEntries(Object.entries(req.query).sort(([a], [b]) => a.localeCompare(b))));
    const allNews = safePublicQuery
      ? await cacheService.getOrSetStale('news', cacheKey, async () => (await getNewsArticles()).filter(item => item.status === 'published'), { ttlSeconds: 300, staleSeconds: 900 })
      : await getNewsArticles();
    const now = new Date();
    let items = allNews.filter((n) => isAdmin || (n.status === "published" && n.published_at && new Date(n.published_at) <= now));

    // The landing-page feed must only expose live announcements, even to CMS admins.
    if (req.query.important === 'true') {
      items = items.filter((n) => (n.is_important === true || n.is_important === 1) && (n.show_on_homepage === true || n.show_on_homepage === 1) && n.status === 'published' && n.published_at && new Date(n.published_at) <= now);
    }

    if (req.query.status && isAdmin) items = items.filter((n) => n.status === req.query.status);
    if (req.query.type) items = items.filter((n) => n.content_type === req.query.type);

    const displayField = { news: 'show_in_news', upcoming: 'show_in_upcoming', events: 'show_in_events', homepage: 'show_on_homepage' }[req.query.display];
    if (displayField) items = items.filter((n) => n[displayField] === true || n[displayField] === 1);
    if (req.query.homepage === 'true') items = items.filter((n) => n.show_on_homepage === true || n.show_on_homepage === 1);
    if (req.query.temporal === 'upcoming') {
      items = items.filter((n) => ['event', 'meeting'].includes(n.content_type) && n.event_start_at && new Date(n.event_end_at || n.event_start_at) >= now);
    } else if (req.query.temporal === 'past') {
      items = items.filter((n) => ['event', 'meeting'].includes(n.content_type) && n.event_start_at && new Date(n.event_end_at || n.event_start_at) < now);
    }

    const [categories, users] = await Promise.all([getCategories(), getCmsUsers()]);
    if (req.query.category)
      items = items.filter((n) => n.category_id === req.query.category || categories.find((c) => c.id === n.category_id)?.slug === req.query.category);

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      items = items.filter((n) => `${n.title} ${n.excerpt} ${n.content}`.toLowerCase().includes(q));
    }
    if (req.query.temporal === 'upcoming' || req.query.display === 'upcoming') {
      items.sort((a, b) => new Date(a.event_start_at || 0) - new Date(b.event_start_at || 0));
    } else if (req.query.display === 'events') {
      items.sort((a, b) => new Date(b.event_start_at || 0) - new Date(a.event_start_at || 0));
    } else {
      items.sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));
    }

    const allowedPublicLimits = [10, 20, 50, 100];
    const requestedLimit = Number(req.query.limit || 10);
    const limit = isAdmin
      ? Math.min(100, Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 10)
      : (allowedPublicLimits.includes(requestedLimit) ? requestedLimit : 10);
    const requestedPage = Number(req.query.page || 1);
    const requestedPageNumber = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pages = Math.ceil(items.length / limit) || 1;
    const page = Math.min(requestedPageNumber, pages);
    const paginated = items.slice((page - 1) * limit, page * limit);
    const decorated = await Promise.all(paginated.map(n => decorate(n, { categories, users })));

    if (safePublicQuery) res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    res.json({
      items: isAdmin ? decorated : decorated.map(publicArticleView),
      total: items.length,
      page,
      pages,
      limit,
      hasNext: page < pages,
      hasPrevious: page > 1,
    });
  } catch (error) {
    console.error('News lookup failed:', error.message);
    res.status(503).json({ error: 'News is temporarily unavailable.' });
  }
});

app.get("/api/news/:slug", async (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  // Public links normally use slugs, but older feeds stored the article UUID
  // in their URL. Accept both forms so those links do not fall into a
  // validation/error path after the content model migration.
  const session = authenticated(req);
  const safePublicQuery = !session && req.query.public !== 'false';
  const loadArticle = async () => {
    const item = await getNewsArticleBySlug(req.params.slug);
    const found = item || (await getNewsArticles()).find(entry => entry.id === req.params.slug);
    if (!found) return null;
    return safePublicQuery && !(found.status === 'published' && found.published_at && new Date(found.published_at) <= new Date()) ? null : found;
  };
  const article = safePublicQuery
    ? await cacheService.getOrSetNegative('news-article', req.params.slug, loadArticle, 600, 45)
    : await loadArticle();
  const cmsUser = req.query.public !== 'true' && session?.kind === 'cms' && !(await tokenIsRevoked(session)) ? await getCmsUserById(session.id) : null;
  const isAdmin = Boolean(cmsUser && await hasAccess(cmsUser, 'content.news.manage'));
  const isVisible = article && article.status === 'published' && article.published_at && new Date(article.published_at) <= new Date();
  if (!article || (!isAdmin && !isVisible))
    return res.status(404).json({ error: "Article not found." });
  res.json(await decorate(article));
});

app.post("/api/news", admin, permission('content.news.manage'), async (req, res) => {
  if (!validateArticle(req.body, res)) return;
  const categories = await getCategories();
  if (req.body.category_id && !categories.some((category) => category.id === req.body.category_id)) {
    return res.status(422).json({ error: "The selected category does not exist." });
  }
  const article = await createNewsArticle(req.body, req.admin.id);
  await invalidatePublicNewsCaches();
  res.status(201).json(await decorate(article));
});

app.post("/api/news/drafts", admin, permission('content.news.manage'), async (req, res) => {
  const body = { ...req.body, status: 'draft' };
  if (!validateDraft(body, res)) return;
  const categories = await getCategories();
  if (body.category_id && !categories.some((category) => category.id === body.category_id)) {
    return res.status(422).json({ error: "The selected category does not exist." });
  }
  try {
    const article = await createNewsArticle(body, req.admin.id);
    await invalidatePublicNewsCaches();
    res.status(201).json(await decorate(article));
  } catch (error) {
    console.error('Draft creation failed:', error.message);
    res.status(500).json({ error: 'The draft could not be created.' });
  }
});

app.put("/api/news/:id", admin, permission('content.news.manage'), async (req, res) => {
  if (!validateArticle(req.body, res)) return;
  const categories = await getCategories();
  if (req.body.category_id && !categories.some((category) => category.id === req.body.category_id)) {
    return res.status(422).json({ error: "The selected category does not exist." });
  }
  const article = await updateNewsArticle(req.params.id, req.body);
  if (!article) return res.status(404).json({ error: "Article not found." });
  await invalidatePublicNewsCaches();
  res.json(isAdmin ? await decorate(article) : publicArticleView(await decorate(article)));
});

app.patch("/api/news/:id/draft", admin, permission('content.news.manage'), async (req, res) => {
  const body = { ...req.body, status: 'draft', published_at: null };
  if (!validateDraft(body, res)) return;
  const categories = await getCategories();
  if (body.category_id && !categories.some((category) => category.id === body.category_id)) {
    return res.status(422).json({ error: "The selected category does not exist." });
  }
  const expectedVersion = body.autosave_version === undefined || body.autosave_version === null || body.autosave_version === ''
    ? null
    : Number(body.autosave_version);
  if (expectedVersion !== null && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)) {
    return res.status(422).json({ error: 'The draft revision is invalid.' });
  }
  try {
    const article = await updateNewsArticle(req.params.id, body, { expectedVersion });
    if (!article) return res.status(404).json({ error: "Article not found." });
    await invalidatePublicNewsCaches();
    res.json(await decorate(article));
  } catch (error) {
    if (error.code === 'DRAFT_CONFLICT') return res.status(409).json({ error: error.message, code: error.code });
    console.error('Draft autosave failed:', error.message);
    res.status(500).json({ error: 'The draft could not be saved.' });
  }
});

app.delete("/api/news/:id", admin, permission('content.news.manage'), async (req, res) => {
  await deleteNewsArticle(req.params.id);
  await invalidatePublicNewsCaches();
  res.status(204).end();
});

app.post("/api/news/bulk", admin, permission('content.news.manage'), async (req, res) => {
  try {
    const { ids, action } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "Select at least one article" });
    if (!['delete', 'published', 'draft'].includes(action)) return res.status(400).json({ error: "Unsupported bulk action" });
    const count = await bulkUpdateNewsArticles(ids, action);
    await invalidatePublicNewsCaches();
    res.json({ count });
  } catch (e) {
    console.error('Bulk news update failed:', e.message);
    res.status(500).json({ error: 'The news update could not be completed.' });
  }
});

// -- CMS Categories --
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await cacheService.getOrSetStale('categories', 'public', async () => (await getCategories()).map(category => ({ id: category.id, name: category.name, slug: category.slug })), { ttlSeconds: 300, staleSeconds: 900 });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400').json(categories);
  } catch (error) {
    console.error('Categories lookup failed:', error.message);
    res.status(503).json({ error: 'Categories are temporarily unavailable.' });
  }
});

const auditDirectoryAction = async (req, action, targetId, previousValue, nextValue) => {
  const db = await getPostgresRuntime('database');
  await audit(db, req.admin.id, action, 'government_official_assignment', targetId, previousValue, nextValue);
};

// Structured assignments use UUID-like IDs. Older CMS payloads can still
// contain a stable legacy key such as `legacy:mayor:0`; those keys are
// resolved to the structured assignment by the repository before use.
const safeOfficialId = value => typeof value === 'string' && /^(?:[a-zA-Z0-9-]{1,128}|legacy:[a-zA-Z][a-zA-Z0-9]*:[0-9]{1,6})$/.test(value) ? value : null;

app.get('/api/officials/directory', async (req, res) => {
  try {
    const status = ['all', 'current', 'previous', 'future', 'unknown'].includes(req.query.status) ? req.query.status : 'all';
    const barangayId = typeof req.query.barangay === 'string' && /^[a-z0-9-]{1,120}$/i.test(req.query.barangay) ? req.query.barangay : null;
    const cacheKey = JSON.stringify({ status, barangayId });
    const directory = await cacheService.getOrSetStale('officials-directory', cacheKey, async () => getOfficialDirectory(sanitizeOfficials(await getOfficials()) || {}, { status, barangayId }), { ttlSeconds: 300, staleSeconds: 900 });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400').json(directory);
  } catch (error) { console.error('Official directory lookup failed:', error.message); res.status(503).json({ error: 'Officials are temporarily unavailable.' }); }
});

app.get('/api/officials', async (req, res) => {
  try {
    const content = await cacheService.getOrSetStale('officials', 'public', async () => {
    const content = await decorateLegacyOfficials(sanitizeOfficials(await getOfficials()) || {});
    const groups = ['mayor', 'viceMayor', 'abcPresident', 'sbMembers', 'punongBarangays', 'deptHeads'];
    const refreshPhoto = async (person) => {
      if (!person?.photo || !/^https?:\/\//i.test(person.photo)) return person;
      try {
        const url = new URL(person.photo);
        const marker = '/media/';
        const index = url.pathname.indexOf(marker);
        if (index < 0) return person;
        return { ...person, photo: await createDownloadUrl(url.pathname.slice(index + 1)) };
      } catch { return person; }
    };
    const refreshStoredPhoto = async (person) => {
      if (!person?.photo || !/^media\/[a-zA-Z0-9_\/-]+\.(?:jpg|png|webp)$/i.test(person.photo)) return refreshPhoto(person);
      try { return { ...person, photo: await createDownloadUrl(person.photo) }; }
      catch { return { ...person, photo: '' }; }
    };
    for (const group of groups) {
      if (Array.isArray(content[group])) content[group] = await Promise.all(content[group].map(refreshStoredPhoto));
      else if (content[group]) content[group] = await refreshStoredPhoto(content[group]);
    }
    if (Array.isArray(content.directory?.items)) content.directory.items = await Promise.all(content.directory.items.map(refreshStoredPhoto));
    return content;
    }, { ttlSeconds: 300, staleSeconds: 900 });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400').json(content);
  } catch (error) { console.error('Officials lookup failed:', error.message); res.status(503).json({ error: 'Officials are temporarily unavailable.' }); }
});
app.put('/api/officials', admin, permission('directory.manage'), async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') return res.status(422).json({ error: 'Invalid officials content.' });
    // `directory` is a read model added to GET responses.  It is never stored
    // back into the legacy CMS document or treated as editor input.
    const { directory: _directory, ...submitted } = req.body;
    const previous = sanitizeOfficials(await getOfficials()) || {};
    const saved = await saveOfficials(sanitizeOfficials(submitted));
    await syncLegacyOfficials(saved, req.admin.id);
    await auditDirectoryAction(req, 'OFFICIAL_DIRECTORY_UPDATED', 'officials', previous, saved);
    await cacheService.invalidate('officials');
    await cacheService.invalidate('officials-directory');
    res.json(await decorateLegacyOfficials(saved));
  }
  catch (error) { console.error('Officials update failed:', error.message); res.status(500).json({ error: 'Officials could not be updated.' }); }
});

app.get('/api/admin/officials/data-quality', admin, permission('directory.manage'), async (req, res) => {
  try { res.json(await officialsDataQuality()); }
  catch (error) { console.error('Officials data-quality lookup failed:', error.message); res.status(503).json({ error: 'Officials data quality is temporarily unavailable.' }); }
});
app.post('/api/admin/official-assignments', admin, permission('directory.manage'), async (req, res) => {
  try {
    const official = await createHistoricalOfficeAssignment(req.body || {}, req.admin.id);
    await auditDirectoryAction(req, 'HISTORICAL_OFFICIAL_ASSIGNMENT_CREATED', official.id, null, official);
    res.status(201).json(official);
  } catch (error) { console.error('Historical official assignment creation failed:', error.message); res.status(422).json({ error: safeClientError(error, 'The historical assignment could not be created.') }); }
});
app.get('/api/admin/official-assignments/:id/matches', admin, permission('directory.manage'), async (req, res) => {
  try {
    const assignmentId = safeOfficialId(req.params.id); if (!assignmentId) return res.status(422).json({ error: 'Invalid official assignment.' });
    const year = Number(req.query.year); if (!Number.isInteger(year)) return res.status(422).json({ error: 'Enter a valid election year before searching.' });
    res.json(await findElectionMatches(assignmentId, { year }));
  } catch (error) { console.error('BetterGov match search failed:', error.message); const status = [400, 404, 409, 422].includes(Number(error?.status)) ? error.status : 502; res.status(status).json({ error: safeClientError(error, 'Election records are temporarily unavailable.') }); }
});
app.post('/api/admin/official-assignments/:id/connect', admin, permission('directory.manage'), async (req, res) => {
  try {
    const assignmentId = safeOfficialId(req.params.id);
    const { person_id: personId, contest_id: contestId, year } = req.body || {};
    if (!assignmentId || typeof personId !== 'string' || personId.length > 128 || typeof contestId !== 'string' || contestId.length > 255 || !Number.isInteger(Number(year))) return res.status(422).json({ error: 'Choose a valid BetterGov election record.' });
    const previous = await getOfficeholder(assignmentId);
    const official = await connectElectionRecord(assignmentId, { personId, contestId, year: Number(year) }, req.admin.id);
    await auditDirectoryAction(req, 'BETTERGOV_RECORD_CONNECTED', assignmentId, previous, official);
    res.json(official);
  } catch (error) { console.error('BetterGov record connect failed:', error.message); const status = [400, 404, 409, 422].includes(Number(error?.status)) ? error.status : 422; res.status(status).json({ error: safeClientError(error, 'The election record could not be connected.') }); }
});
app.post('/api/admin/official-assignments/:id/refresh', admin, permission('directory.manage'), async (req, res) => {
  try {
    const assignmentId = safeOfficialId(req.params.id); if (!assignmentId) return res.status(422).json({ error: 'Invalid official assignment.' });
    const previous = await getOfficeholder(assignmentId);
    const refreshed = await refreshElectionRecord(assignmentId);
    await auditDirectoryAction(req, refreshed.review_required ? 'BETTERGOV_UPDATE_REVIEW_REQUIRED' : 'BETTERGOV_RECORD_REFRESHED', assignmentId, previous, refreshed.official);
    res.json(refreshed);
  } catch (error) { console.error('BetterGov refresh failed:', error.message); const status = [400, 404, 409, 422].includes(Number(error?.status)) ? error.status : 502; res.status(status).json({ error: safeClientError(error, 'Election data could not be refreshed.') }); }
});
app.post('/api/admin/official-assignments/:id/disconnect', admin, permission('directory.manage'), async (req, res) => {
  try {
    const assignmentId = safeOfficialId(req.params.id); if (!assignmentId) return res.status(422).json({ error: 'Invalid official assignment.' });
    const previous = await getOfficeholder(assignmentId);
    const official = await disconnectElectionRecord(assignmentId);
    await auditDirectoryAction(req, 'BETTERGOV_RECORD_DISCONNECTED', assignmentId, previous, official);
    res.json(official);
  } catch (error) { console.error('BetterGov disconnect failed:', error.message); const status = [400, 404, 409, 422].includes(Number(error?.status)) ? error.status : 422; res.status(status).json({ error: safeClientError(error, 'The election record could not be disconnected.') }); }
});
app.post('/api/admin/official-assignments/:id/reject', admin, permission('directory.manage'), async (req, res) => {
  try {
    const assignmentId = safeOfficialId(req.params.id);
    const { person_id: personId, contest_id: contestId, year } = req.body || {};
    if (!assignmentId || typeof personId !== 'string' || personId.length > 128 || typeof contestId !== 'string' || contestId.length > 255 || !Number.isInteger(Number(year))) return res.status(422).json({ error: 'Choose a valid BetterGov election record.' });
    const previous = await getOfficeholder(assignmentId);
    const official = await rejectElectionRecord(assignmentId, { personId, contestId, year: Number(year) }, req.admin.id);
    await auditDirectoryAction(req, 'BETTERGOV_MATCH_REJECTED', assignmentId, previous, official);
    res.json(official);
  } catch (error) { console.error('BetterGov match rejection failed:', error.message); const status = [400, 404, 409, 422].includes(Number(error?.status)) ? error.status : 422; res.status(status).json({ error: safeClientError(error, 'The match could not be rejected.') }); }
});
app.get('/api/barangays', async (req, res) => {
  try {
    const decorated = await cacheService.getOrSetStale('barangays', 'public', async () => {
    const records = sanitizeBarangays(await getBarangays());
    return Promise.all(records.map(async (item) => ({
      ...item,
      slug: item.slug || item.id,
      more_information: item.more_information || '',
      latitude: item.coords?.lat ?? null,
      longitude: item.coords?.lng ?? null,
      punong_barangay: item.captain || '',
      cover_image: /^media\/[a-zA-Z0-9_\/-]+\.(?:jpg|png|webp)$/i.test(item.cover_image || '')
        ? await createDownloadUrl(item.cover_image)
        : item.cover_image || '',
    })));
    }, { ttlSeconds: 300, staleSeconds: 900 });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400').json(decorated);
  } catch (error) { console.error('Barangays lookup failed:', error.message); res.status(503).json({ error: 'Barangays are temporarily unavailable.' }); }
});
app.put('/api/barangays', admin, permission('directory.manage'), async (req, res) => {
  try {
    if (!Array.isArray(req.body)) return res.status(422).json({ error: 'Invalid barangays content.' });
    const saved = sanitizeBarangays(req.body);
    await saveBarangays(saved);
    await syncBarangayTerms(saved, req.admin.id);
    await auditDirectoryAction(req, 'BARANGAY_OFFICIAL_TERMS_UPDATED', 'barangays', null, saved.map(item => ({ id: item.id, captain: item.captain, termStart: item.termStart || null, termEnd: item.termEnd || null })));
    await cacheService.invalidate('barangays');
    await cacheService.invalidate('officials');
    await cacheService.invalidate('officials-directory');
    res.set('Cache-Control', 'no-store, max-age=0');
    const decorated = await Promise.all(saved.map(async (item) => ({
      ...item,
      slug: item.slug || item.id,
      more_information: item.more_information || '',
      latitude: item.coords?.lat ?? null,
      longitude: item.coords?.lng ?? null,
      punong_barangay: item.captain || '',
      cover_image_path: item.cover_image || '',
      cover_image: /^media\/[a-zA-Z0-9_\/-]+\.(?:jpg|png|webp)$/i.test(item.cover_image || '')
        ? await createDownloadUrl(item.cover_image)
        : item.cover_image || '',
    })));
    res.json(decorated);
  }
  catch (error) { console.error('Barangays update failed:', error.message); res.status(500).json({ error: 'Barangays could not be updated.' }); }
});

app.post("/api/categories", admin, permission('content.categories.manage'), async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(422).json({ error: "A category name is required." });
  const all = await getCategories();
  if (all.some((c) => c.name.toLowerCase() === name.toLowerCase()))
    return res.status(409).json({ error: "That category already exists." });

  const item = await createCategory(name, req.body.slug);
  await cacheService.invalidate('categories');
  await cacheService.invalidate('news');
  res.status(201).json(item);
});

app.put("/api/categories/:id", admin, permission('content.categories.manage'), async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(422).json({ error: "A category name is required." });

  const item = await updateCategory(req.params.id, name, req.body.slug);
  if (!item) return res.status(404).json({ error: "Category not found." });
  await cacheService.invalidate('categories');
  await cacheService.invalidate('news');
  res.json(item);
});

app.delete("/api/categories/:id", admin, permission('content.categories.manage'), async (req, res) => {
  const articles = await getNewsArticles();
  if (articles.some((n) => n.category_id === req.params.id))
    return res.status(409).json({ error: "This category is used by an article." });

  await deleteCategory(req.params.id);
  await cacheService.invalidate('categories');
  await cacheService.invalidate('news');
  res.status(204).end();
});

registerDestinationRoutes(app, { admin, permission });

// -- CMS Media --
app.get("/api/media", admin, permission('content.media.manage'), async (req, res) => {
  try {
    const page = await getMediaPage({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      usage: req.query.usage,
      sort: req.query.sort,
    });
    const decoratedMedia = await Promise.all(page.items.map(async (m) => {
      const result = {
        ...m,
        preview_url: null,
        preview_status: 'unknown',
        storage_status: 'unknown',
      };
      try {
        const metadata = await getObjectMetadata(m.storage_path, m.storage_bucket);
        if (!metadata) {
          result.preview_status = 'missing';
          result.storage_status = 'missing';
          return result;
        }
        result.preview_url = await createDownloadUrl(m.storage_path, m.storage_bucket);
        result.preview_status = result.preview_url ? 'available' : 'missing';
        result.storage_status = result.preview_url ? 'available' : 'missing';
        result.storage_size = metadata.ContentLength ?? metadata.contentLength ?? null;
        result.storage_last_modified = metadata.LastModified ?? metadata.lastModified ?? null;
      } catch (error) {
        const message = String(error.message || '');
        const quotaExceeded = /cap exceeded|download bandwidth|class\s+b/i.test(message);
        result.preview_status = error.message === 'Invalid storage object key.' ? 'invalid' : quotaExceeded ? 'quota_exceeded' : 'unknown';
        result.storage_status = result.preview_status;
        console.warn(`Media preview check failed for ${m.id}:`, message);
      }
      return result;
    }));
    res.json({ items: decoratedMedia, pagination: page.pagination });
  } catch (error) {
    console.error('Media lookup failed:', error.message);
    res.status(503).json({ error: 'Media library is temporarily unavailable.' });
  }
});

app.post("/api/storage/upload-url", admin, permission('content.media.manage'), async (req, res) => {
  if (!config.get('features.uploads')) return res.status(403).json({ error: 'File uploads are disabled.' });
  const filename = String(req.body.filename || '').trim();
  const contentType = String(req.body.contentType || '').trim().toLowerCase();
  const fileSize = Number(req.body.fileSize);
  const context = String(req.body.context || '');
  const checksumSha256 = String(req.body.checksumSha256 || '').trim().toLowerCase();

  if (!filename || !Number.isSafeInteger(fileSize) || fileSize <= 0) {
    return res.status(422).json({ error: "Filename, contentType, and fileSize are required." });
  }
  if (checksumSha256 && !/^[a-f0-9]{64}$/.test(checksumSha256)) {
    return res.status(422).json({ error: 'The file checksum is invalid.' });
  }

  if (filename.length > 255 || /[\\/\0\r\n]/.test(filename)) {
    return res.status(422).json({ error: "Invalid filename." });
  }

  // Validate context and file
  if (context !== 'media' && context !== 'news') {
    return res.status(422).json({ error: "Invalid upload context." });
  }

  const allowedTypes = new Set(config.get('storage.allowedTypes').split(',').map(type => type.trim()));
  if (!allowedTypes.has(contentType)) {
    return res.status(422).json({ error: "Use a JPG, PNG, or WEBP image." });
  }
  const extension = filename.toLowerCase().split('.').pop();
  const allowedExtensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (extension !== allowedExtensions[contentType] && !(contentType === 'image/jpeg' && extension === 'jpeg')) {
    return res.status(422).json({ error: "The filename extension must match the content type." });
  }

  if (fileSize > config.get('storage.maxUploadMb') * 1024 * 1024) {
    return res.status(422).json({ error: "File size exceeds the configured upload limit." });
  }

  if (checksumSha256) {
    const existing = await getMediaByChecksum(checksumSha256);
    if (existing) {
      return res.json({
        reused: true,
        media: {
          ...existing,
          preview_url: await createDownloadUrl(existing.storage_path, existing.storage_bucket),
        },
      });
    }
  }

  const ext = contentType === "image/jpeg" ? "jpg" : contentType.split('/')[1];
  const uuid = crypto.randomUUID();
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');

  const storagePath = `${config.get('storage.prefix')}/${yyyy}/${mm}/${uuid}.${ext}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + config.get('storage.signedUrlMinutes') * 60000);

  try {
    if (config.get('storage.provider') === 'backblaze') await createPendingUpload({
      id: uuid, storagePath, originalFilename: filename, contentType, fileSize,
      uploadedBy: req.admin.id, context, expiresAt, createdAt, checksumSha256,
    });
    const uploadUrl = process.env.NODE_ENV !== 'production' && config.get('storage.provider') === 'backblaze'
      ? `/api/media/upload-proxy?storagePath=${encodeURIComponent(storagePath)}&contentType=${encodeURIComponent(contentType)}`
      : await createUploadUrl(storagePath, contentType, fileSize);
    res.json({
      uploadUrl,
      storagePath,
      checksumSha256,
      expiresIn: config.get('storage.signedUrlMinutes') * 60
    });
  } catch (error) {
    if (config.get('storage.provider') === 'backblaze') await deletePendingUpload(storagePath).catch(() => {});
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: "Failed to generate upload URL." });
  }
});

app.put('/api/media/upload-proxy', admin, permission('content.media.manage'), express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '25mb' }), async (req, res) => {
  const storagePath = String(req.query.storagePath || '');
  const contentType = String(req.query.contentType || '');
  if (!validateObjectKey(storagePath) || !isMediaUploadPath(storagePath, config.get('storage.prefix')) || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Invalid upload request.' });
  if (!validateImageUpload(req.body, contentType, config.get('storage.maxUploadMb') * 1024 * 1024)) return res.status(422).json({ error: 'The uploaded file is not a valid supported image.' });
  try {
    const pending = await getPendingUpload(storagePath, req.admin.id);
    if (!pending || pending.content_type !== contentType || Number(pending.file_size) !== req.body.length) return res.status(403).json({ error: 'Upload was not issued to this administrator or has expired.' });
    await uploadObject(storagePath, req.body, contentType);
    res.sendStatus(200);
  } catch (error) {
    // Refresh the remote client once so a rotated B2 key or a transient
    // connection failure does not turn the browser upload into a dead end.
    try {
      await initializeStorage();
      await uploadObject(storagePath, req.body, contentType);
      res.sendStatus(200);
    } catch (retryError) {
      console.error('Proxy upload failed:', retryError.message);
      res.status(502).json({ error: 'Remote storage upload failed.' });
    }
  }
});

app.post("/api/media/complete", admin, permission('content.media.manage'), async (req, res) => {
  const storagePath = String(req.body.storagePath || '');
  const relatedRecordId = req.body.relatedRecordId || null;
  const requestedChecksum = String(req.body.checksumSha256 || '').trim().toLowerCase();

  if (!storagePath || !validateObjectKey(storagePath) || !/^[a-zA-Z0-9_\/-]+\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(storagePath)) {
    return res.status(422).json({ error: "Invalid storage path." });
  }
  if (relatedRecordId && !/^[0-9a-f-]{36}$/i.test(String(relatedRecordId))) {
    return res.status(422).json({ error: "Invalid related record ID." });
  }
  if (requestedChecksum && !/^[a-f0-9]{64}$/.test(requestedChecksum)) {
    return res.status(422).json({ error: 'The file checksum is invalid.' });
  }

  const bucketName = config.get('storage.bucket');
  const isLocalStorage = storageIsLocal();

  // Guard against duplicate completion
  const existing = await getMediaByStoragePath(storagePath);
  if (existing) {
    if (existing.uploaded_by !== req.admin.id) return res.status(403).json({ error: "You do not own this upload." });
    await deletePendingUpload(storagePath).catch(() => {});
    return res.status(200).json({ ...existing, preview_url: await createDownloadUrl(storagePath) });
  }

  const pending = isLocalStorage ? {
    original_filename: String(req.body.originalFilename || 'upload'),
    content_type: String(req.body.contentType || ''),
    file_size: Number(req.body.fileSize || 0),
  } : await getPendingUpload(storagePath, req.admin.id);
  if (!pending) return res.status(403).json({ error: "Upload was not issued to this administrator or has expired." });

  // Verify the object exists and read the authoritative bytes. Hashing the
  // server-side object prevents a client from claiming a different checksum.
  const storageMetadata = isLocalStorage ? null : await getObjectMetadata(storagePath);
  let uploadedBytes;
  if (isLocalStorage) {
    try {
      uploadedBytes = await readObject(storagePath);
      if (uploadedBytes.length !== Number(pending.file_size) || uploadedBytes.length > config.get('storage.maxUploadMb') * 1024 * 1024) throw new Error('invalid size');
    } catch { return res.status(404).json({ error: "Uploaded file not found. Upload may have failed." }); }
  }
  if (!isLocalStorage && !storageMetadata) {
    return res.status(404).json({ error: "Backblaze object not found. Upload may have failed." });
  }

  const verifiedContentType = isLocalStorage ? pending.content_type : (storageMetadata.ContentType || 'application/octet-stream');
  const verifiedFileSize = isLocalStorage ? pending.file_size : (Number(storageMetadata.ContentLength) || 0);
  if (!isLocalStorage && (verifiedContentType !== pending.content_type || verifiedFileSize !== Number(pending.file_size))) {
    return res.status(422).json({ error: "Uploaded object metadata does not match the issued upload." });
  }

  try {
    uploadedBytes ||= await readObject(storagePath, bucketName);
  } catch {
    return res.status(404).json({ error: "Uploaded file could not be read. Upload may have failed." });
  }
  if (!validateImageUpload(uploadedBytes, pending.content_type, config.get('storage.maxUploadMb') * 1024 * 1024)) {
    await deleteObject(storagePath, bucketName).catch(() => {});
    await deletePendingUpload(storagePath).catch(() => {});
    return res.status(422).json({ error: 'The uploaded file is not a valid supported image.' });
  }
  const actualChecksum = crypto.createHash('sha256').update(uploadedBytes).digest('hex');
  if (requestedChecksum && requestedChecksum !== actualChecksum) {
    await deleteObject(storagePath, bucketName).catch(() => {});
    await deletePendingUpload(storagePath).catch(() => {});
    return res.status(422).json({ error: 'The uploaded file checksum does not match the selected file.' });
  }

  const item = await finalizePendingUpload(pending, {
    id: crypto.randomUUID(),
    originalFilename: pending.original_filename,
    storageBucket: bucketName,
    storagePath,
    contentType: verifiedContentType,
    fileSize: verifiedFileSize,
    uploadedBy: req.admin.id,
    relatedRecordId,
    checksumSha256: actualChecksum,
    createdAt: new Date().toISOString().slice(0, 23).replace('T', ' '),
  });

  const canonicalStoragePath = item.storage_path || item.storagePath || storagePath;
  if (item.reused && canonicalStoragePath !== storagePath) {
    await deleteObject(storagePath, bucketName).catch((error) => {
      console.error('Duplicate media cleanup failed:', error.message);
    });
  }

  // Keep the completion response aligned with the database/media-list shape;
  // the repository insert object uses camelCase internally.
  res.status(201).json({
    ...item,
    storage_path: item.storage_path || item.storagePath,
    storage_bucket: item.storage_bucket || item.storageBucket,
    original_filename: item.original_filename || item.originalFilename,
    content_type: item.content_type || item.contentType,
    file_size: item.file_size ?? item.fileSize,
    preview_url: await createDownloadUrl(canonicalStoragePath, item.storage_bucket || bucketName),
    reused: Boolean(item.reused),
  });
});

app.delete('/api/media', admin, permission('content.media.manage'), async (req, res) => {
  const ids = req.body?.ids;
  const force = req.body?.force === undefined ? false : req.body.force;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => typeof id !== 'string')) {
    return res.status(422).json({ error: 'Select between one and 100 media items.' });
  }
  if (typeof force !== 'boolean') return res.status(422).json({ error: 'The media deletion request is invalid.' });
  const uniqueIds = [...new Set(ids)];
  const results = [];
  for (const id of uniqueIds) {
    try {
      const deleted = await deleteMediaAsset({ mediaId: id, force, actorId: req.admin.id });
      results.push({ id, success: true, ...deleted });
    } catch (error) {
      if (!error.code) console.error('Bulk media deletion failed:', { mediaId: id, error: error.message });
      results.push(mediaErrorPayload(error, id));
    }
  }
  res.json({ results });
});

app.delete('/api/media/:id', admin, permission('content.media.manage'), async (req, res) => {
  try {
    const force = req.body?.force === undefined ? false : req.body.force;
    const deleted = await deleteMediaAsset({ mediaId: req.params.id, force, actorId: req.admin.id });
    res.json({ ok: true, ...deleted });
  } catch (error) {
    if (!error.code) console.error('Media deletion failed:', { mediaId: req.params.id, error: error.message });
    const payload = mediaErrorPayload(error, req.params.id);
    res.status(error.status || 500).json(payload);
  }
});

// -- Dashboard --
app.get("/api/admin/dashboard", admin, permission('admin.dashboard.view'), async (req, res) => {
  const allNews = await getNewsArticles();
  const decoratedNews = await Promise.all(allNews.map(n => decorate(n)));
  res.json({
    published: decoratedNews.filter((n) => n.status === "published").length,
    drafts: decoratedNews.filter((n) => n.status === "draft").length,
    recent: decoratedNews.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 5),
  });
});

// -- Health Endpoints --
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "better-getafe" });
});

app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get('/health/live', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/health/ready', (req, res) => {
  const ready = Object.values(serviceStatus).every(status => status === 'connected' || status === 'local');
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
});

app.get('/api/admin/infrastructure/redis', admin, permission('system.infrastructure.view'), async (req, res) => {
  let queues = { email: 0, notifications: 0 };
  if (isRedisReady()) {
    try {
      const [email, notifications] = await Promise.all([
        redis.lLen(redisKeys.queue('email')),
        redis.lLen(redisKeys.queue('notifications')),
      ]);
      queues = { email, notifications };
    } catch { /* Report operational degradation without exposing Redis details. */ }
  }
  res.json({ redis: trafficProtector.health(), cache: isRedisReady() ? 'operational' : 'degraded', queues, workers: 'not_configured' });
});

app.get("/api/health/storage", admin, permission('system.infrastructure.view'), (req, res) => {
  const health = storageHealth();
  const healthy = health.status === 'healthy' && serviceStatus.storage === 'connected';
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'healthy' : 'degraded', provider: health.provider });
});

app.get("/api/health", admin, permission('system.infrastructure.view'), (req, res) => {
  const healthy = serviceStatus.cmsDatabase === 'connected' || serviceStatus.cmsDatabase === 'local';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    cmsDatabase: serviceStatus.cmsDatabase,
    portalDatabase: serviceStatus.portalDatabase,
    redis: trafficProtector.health(),
  });
});

app.get('/api/health/database', admin, permission('system.infrastructure.view'), async (req, res) => {
  const health = await databaseHealth('database');
  res.status(health.status === 'healthy' || health.status === 'local' ? 200 : 503).json({ status: health.status === 'healthy' ? 'healthy' : health.status });
});

app.get("/ready", (req, res) => {
  const redis = trafficProtector.health();
  const ready = Object.values(serviceStatus).every((status) => status === 'connected' || status === 'local');
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    services: {
      cmsDatabase: serviceStatus.cmsDatabase,
      portalDatabase: serviceStatus.portalDatabase,
      storage: serviceStatus.storage,
      redis,
    }
  });
});

app.put(/^\/uploads\/(.+)$/, admin, permission('content.media.manage'), express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  const relative = req.params[0];
  if (!relative || relative.includes('..') || relative.includes('\\') || !/^[a-zA-Z0-9_\/-]+\.(jpg|png|webp)$/.test(relative)) return res.status(400).json({ error: 'Invalid upload path.' });
  const contentType = relative.endsWith('.jpg') ? 'image/jpeg' : relative.endsWith('.png') ? 'image/png' : 'image/webp';
  if (!Buffer.isBuffer(req.body) || req.body.length > config.get('storage.maxUploadMb') * 1024 * 1024 || !imageSignatureMatches(req.body, contentType)) return res.status(422).json({ error: 'The uploaded file is not a valid supported image.' });
  try {
    if (config.get('storage.provider') === 'backblaze') {
      await uploadObject(relative, req.body, contentType);
      return res.status(200).json({ ok: true });
    }
    const root = path.resolve(config.get('storage.localPath') || 'data/uploads');
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`)) return res.status(400).json({ error: 'Invalid upload path.' });
    await (await import('node:fs/promises')).mkdir(path.dirname(target), { recursive: true });
    await (await import('node:fs/promises')).writeFile(target, req.body);
    res.status(200).json({ ok: true });
  } catch { res.status(503).json({ error: 'Local upload storage is unavailable.' }); }
});
app.use('/uploads', (req, res, next) => {
  const referer = req.get('referer') || req.get('origin');
  if (referer) {
    try {
      const source = new URL(referer);
      // Vite proxies local media requests during development. Compare the
      // browser origin with the forwarded host when one is available so the
      // same-origin guard does not reject valid proxied previews.
      const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
      if (host && source.host !== host) return res.status(403).json({ error: 'External media embedding is not allowed.' });
    } catch { return res.status(400).json({ error: 'Invalid referrer.' }); }
  }
  res.set('Vary', 'Referer, Origin');
  try {
    const pathSegments = decodeURIComponent(req.path).replaceAll('\\', '/').split('/').filter(Boolean);
    if (pathSegments[0] === 'citizen-private' || pathSegments[0] === 'profiles') return res.sendStatus(404);
  }
  catch { return res.sendStatus(400); }
  next();
});
app.use('/uploads', express.static(path.resolve(config.get('storage.localPath') || 'data/uploads')));
const crawlableRoutes = ['/', '/info/about', '/accessibility', '/info/history', '/officials', '/info/sitemap', '/contact', '/legal/privacy', '/legal/terms', '/services', '/services/directory', '/barangays', '/services/hotlines', '/services/business-trade', '/services/certificates', '/services/education', '/services/health', '/weather', '/news', '/discover', '/tourism', '/events'];
app.get('/sitemap.xml', async (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  let routes = [...crawlableRoutes];
  try {
    const records = await getBarangays();
    routes = routes.concat(records.map((item) => `/barangays/${item.id}`));
  } catch { /* Keep the core sitemap available if CMS data is unavailable. */ }
  const urls = routes.map((route) => `<url><loc>${origin}${route}</loc></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});
app.get('/robots.txt', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /auth/\nDisallow: /admin/\nDisallow: /api/\nDisallow: /uploads/\nSitemap: ${origin}/sitemap.xml\n`);
});
// server/index.js lives one directory below the Vite output directory in
// both the repository and the production image.
const distDirectory = path.resolve(__dirname, '..', 'dist');

// API endpoints should never fall through to the SPA renderer. In particular,
// /api/media/complete is a POST-only finalization endpoint; opening it in a
// browser sends GET and must return a useful API response instead.
app.use('/api', (req, res) => {
  const isMediaCompletion = req.path === '/media/complete';
  res.status(isMediaCompletion ? 405 : 404).json({
    error: isMediaCompletion ? 'Use POST to finalize an uploaded media file.' : 'API endpoint not found.',
  });
});

// Respect a visitor's public-cache preference while keeping private responses
// protected by their existing no-store rules.
app.use((req, res, next) => {
  if (readCookies(req.headers.cookie).getafe_cache === 'off') res.set('Cache-Control', 'no-store, max-age=0');
  next();
});

// Keep the SPA fallback from turning missing JavaScript, CSS, and image files
// into HTML responses. Browsers report that as a misleading MIME-type error
// and dynamic imports fail much later than the actual missing asset request.
app.use('/assets', express.static(path.join(distDirectory, 'assets'), {
  fallthrough: false,
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
  immutable: process.env.NODE_ENV === 'production',
  setHeaders: (res, filePath, stat) => {
    if (readCookies(res.req.headers.cookie).getafe_cache === 'off') res.set('Cache-Control', 'no-store, max-age=0');
  },
}));
app.use(express.static(distDirectory, {
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
  immutable: process.env.NODE_ENV === 'production',
  setHeaders: (res, filePath) => {
    if (path.basename(filePath) === 'index.html') res.set('Cache-Control', 'no-store');
    else if (readCookies(res.req.headers.cookie).getafe_cache === 'off') res.set('Cache-Control', 'no-store, max-age=0');
  },
}));
app.use((req, res) => {
  // A request with a file extension is an asset/API typo, not an SPA route.
  // Return a real 404 instead of serving index.html with text/html.
  if (path.extname(req.path)) return res.status(404).type('text/plain').send('Not found');
  if (!['GET', 'HEAD'].includes(req.method) || !req.accepts('html')) {
    return res.status(404).type('text/plain').send('Not found');
  }
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(distDirectory, 'index.html'));
});

// Keep parser and route failures in the JSON API contract. This must follow
// route registration so errors from every endpoint reach the same handler.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const apiRequest = String(req.originalUrl || req.url || '').split('?')[0].startsWith('/api/');
  const requestId = req.requestId || null;
  if (error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, 'body')) {
    return res.status(400).json({ error: 'Request body must be valid JSON.', request_id: requestId });
  }
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.', request_id: requestId });
  console.error(JSON.stringify({ event: 'request_failed', request_id: requestId, path: req.path, method: req.method, message: error?.message || 'unknown error' }));
  if (apiRequest) {
    const status = Number(error?.status || error?.statusCode);
    const safeStatus = [400, 401, 403, 404, 405, 409, 413, 415, 422, 429].includes(status) ? status : 503;
    const safeMessages = {
      400: 'Request is invalid.',
      401: 'Authentication required.',
      403: 'Access denied.',
      404: 'Resource not found.',
      405: 'Method not allowed.',
      409: 'Request conflicts with the current state.',
      413: 'Request body is too large.',
      415: 'Unsupported request content type.',
      422: 'Request validation failed.',
      429: 'Too many requests. Please try again later.',
    };
    return res.status(safeStatus).json({ error: safeMessages[safeStatus] || 'The service is temporarily unavailable.', request_id: requestId });
  }
  res.status(500).type('text/plain').send('The service is temporarily unavailable.');
});

async function startServer() {
  try {
    console.log('[STARTUP 1/8] Process started');
    const isProd = process.env.NODE_ENV === 'production';
    console.log(`[STARTUP 2/8] Environment: ${process.env.NODE_ENV || 'development'}`);

    console.log('[STARTUP 3/8] Validating production configuration');
    if (isProd && (!secret || /^(change-this-|replace-with-|your-)/.test(secret))) throw new Error('A bootstrap session signing secret is required.');

    console.log('[STARTUP 4/8] Initializing CMS database (and User database)');
    console.log('[STARTUP 5/8] Initializing user database');
    console.log('[STARTUP 6/8] Initializing Backblaze B2 storage');

    // We already do timeouts internally in initializeServices
    await initializeServices();
    console.log('[STARTUP] Connecting to Redis');
    await trafficProtector.start();
    if (isRedisReady()) await recoverEmailJobs().catch(error => console.error('[EMAIL] Queue recovery failed:', error.message));
    startEmailWorker(async ({ to, subject, text, html, attachments, deliveryId }) => {
      if (deliveryId && !await validateQueuedNotification(deliveryId)) return;
      await sendEmail(to, subject, text, undefined, undefined, attachments || [], html);
      await markNotificationDeliverySent(deliveryId).catch(error => console.error('[EMAIL] Delivery log update failed:', error.message));
    }, async ({ deliveryId }, _job, error) => {
      await markNotificationDeliveryFailed(deliveryId, error).catch(() => {});
    });

    console.log('[STARTUP 7/8] Starting HTTP server');
    const PORT = Number(process.env.PORT) || 8080;
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`[STARTUP 8/8] Server listening on 0.0.0.0:${PORT}`);
    });
    const orphanCleanupTimer = setInterval(() => {
      cleanupExpiredPendingUploads({ limit: 100 }).catch(error => console.error(JSON.stringify({ event: 'storage_orphan_cleanup', result: 'failed', errorCode: error.name || error.code || 'UnknownError' })));
    }, 60 * 60 * 1000);
    orphanCleanupTimer.unref?.();
    // Release slow or incomplete connections instead of allowing them to
    // exhaust the Node worker during a slowloris-style flood.
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    server.keepAliveTimeout = 5_000;
    server.maxRequestsPerSocket = 100;
    let stopping = false;
      const shutdown = () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 25000);
      server.close(async (error) => {
        try {
          clearInterval(orphanCleanupTimer);
          await stopEmailWorker(); await trafficProtector.stop(); await closeCloudSql(); await closeConfigStore();
          process.exitCode = error ? 1 : 0;
        } catch {
          console.error('Database shutdown failed');
          process.exitCode = 1;
        } finally {
          clearTimeout(deadline);
        }
      });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('\n[STARTUP FAILED]');
    console.error('Stage: Service initialization');
    console.error(`Message: ${error.message || 'Unknown error'}`);
    console.error(`Stack: ${error.stack}`);
    console.error('Local fallback: DISABLED\n');
    process.exit(1);
  }
}

startServer();



