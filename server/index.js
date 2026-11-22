import { createSessionEndpoint } from './src/services/sessionEndpoint.js';
import { verifySessionToken } from './src/services/sessionToken.js';
import { saveCmsMfa, consumeCmsRecoveryCode } from './src/services/cmsMfa.js';
import { pipeline } from 'node:stream/promises';
import { activeAzureImageKey, openAzureArticleImage, activateStorage } from './src/services/storage.js';
import { validatePasswordLogin } from '../src/services/loginValidation.js';
import { sendStartupPage } from './src/services/startupPage.js';
import { drainStaffNotifications, markStaffEmailDelivery, validateStaffEmailDelivery } from './src/services/staffNotifications.js';
import { createCsrfProtection } from './src/services/csrf.js';
import { requirePermission as requireSettingsPermission } from './src/config/permissions.js';
import { checkRequestOrigin } from './src/services/requestOrigin.js';
import { authDiagnostics } from './src/services/authDiagnostics.js';
import { registerManagedContentRoutes } from './src/services/managedContentRoutes.js';
import { registerDepartmentRoutes } from './src/services/departmentRoutes.js';
import { installEserviceRoutes, drainEserviceOutbox } from './src/services/eserviceRoutes.js';
import { registerDestinationRoutes } from './src/services/destinationRoutes.js';
import { rememberGoogleProfile, googleOnboarding } from './src/services/googleOnboarding.js';
import { installCitizenRoutes } from './src/services/citizenRoutes.js';
import { homepageMetadata } from './src/services/homepageMetadata.js';
import { safeReturnPath, loginDestination, resolvePostAuthDestination } from '../src/authNavigation.js';
// Continuing to serve requests after an uncaught exception or unhandled
// rejection can leave shared state partially updated. Log the fatal error and
// terminate so the process supervisor can start a clean worker.
process.on('uncaughtException', (error) => {
  console.error(JSON.stringify({ event: 'uncaught_exception', message: redactDiagnostic(error?.message), stack: redactDiagnostic(error?.stack) }));
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error(JSON.stringify({ event: 'unhandled_rejection', message: redactDiagnostic(error?.message || error), stack: redactDiagnostic(error?.stack) }));
  process.exit(1);
});

import express from "express";
import { createServer } from 'node:http';
import { getGetafeWeather } from './src/services/getafeWeather.js';
import { getHeaderExchangeRates } from './src/services/headerExchangeRates.js';
import { getAggregatedCurrent, getAggregatedForecast, providerKeys } from './src/services/weatherAggregator.js';
import { normalizeWeather } from './src/services/weatherNormalizer.js';
import { closeDatabaseConnection, databaseHealth, getPortalPool, getCmsPool, getActiveDatabaseConnectionOptions, getDatabaseRuntimeStatus } from './src/services/database.js';
import { getDataApiCategories } from './src/services/supabaseDataApi.js';
import path from "path";

import crypto from "crypto";
import QRCode from 'qrcode';
import { config } from './src/config/index.js';
import { closeConfigStore } from './src/config/DatabaseSettingsProvider.js';
import { installSettingsRoutes } from './src/services/settingsRoutes.js';
import { installAiRoutes } from './src/services/aiRoutes.js';
import { startAiKnowledgeWorker, stopAiKnowledgeWorker } from './src/services/aiKnowledgeBase.js';
import { installPublicDataRoutes } from './src/services/publicDataRoutes.js';
import { installAdminUsersRoutes } from './src/services/adminUsersRoutes.js';
import { installStaffRoutes } from './src/services/staffRoutes.js';
import { installAccessManagementRoutes } from './src/services/accessManagementRoutes.js';
import { effectiveAccessFor, hasAccess, requireAccess, audit } from './src/services/authorizationService.js';
import { loginThrottle, passwordResetEmailThrottle, issueCode, resendCode, verifyCode, actionThrottle, verificationCodeDigest } from './src/services/authSecurity.js';
import { enrichWithPsgc, getLocalGetafePsgc, normalizeName as normalizePsgcName, startPsgcSyncSchedule, stopPsgcSyncSchedule, syncGetafePsgc } from './src/services/psgcSyncService.js';
import { stateKey, stateTransaction, putState, consumeState, readState } from './src/services/authState.js';
import { replacePassword } from './src/services/passwords.js';
import { integrationRequest } from './src/services/integrations.js';
import { registerIntegrationHubRoutes } from './src/integrationHub/routes.js';
import { installExternalApiRoutes } from './src/services/externalApiRoutes.js';
import { sendEmail } from './src/services/email.js';
import { createNewsletterHandlers, newsletterPublicOrigin } from './src/services/newsletterRoutes.js';
import { AdaptiveTrafficProtector, isTrustedProxyAddress, resolveClient, resolveClientAddress } from './src/services/trafficProtection.js';
import { installContactRoutes } from './src/services/contactRoutes.js';
import { cacheService } from './src/services/cacheService.js';
import redis, { isRedisReady } from './src/infrastructure/redis/redisClient.js';
import { redisKeys } from './src/infrastructure/redis/redisKeys.js';
import { enqueueEmail, recoverEmailJobs, startEmailWorker, stopEmailWorker } from './src/services/redisInfrastructure.js';
import { markNotificationDeliveryFailed, markNotificationDeliverySent, validateQueuedNotification } from './src/services/notificationService.js';
import { createSessionRegistry } from './src/services/sessionRegistry.js';
import { passwordMeetsPolicy } from './src/services/passwordPolicy.js';
import { safeUser } from './src/services/authPayload.js';
import { hashPassword, verifyPassword } from './src/services/passwordHashing.js';
import { selectLoginAccount } from './src/services/loginAccount.js';

import { fileURLToPath } from "url";
import { initializeServices, serviceStatus } from "./src/services/initialization.js";
import { systemStatus } from './src/services/runtimeConfiguration.js';
import { emailHealth, activateEmail, retryEmailVerification } from './src/services/email.js';
import { evaluateDependencies, reportStartup, dependencyReason } from './src/services/startupDiagnostics.js';
import { createUploadUrl, uploadObject, createDownloadUrl, deleteObject, getObjectMetadata, readObject, imageSignatureMatches, validateImageUpload, validateObjectKey, storageIsLocal, storageLocation, storageHealth, refreshStorageHealth, initializeStorage, writePrivateFile, readPrivateFile, deletePrivateFile, isStorageNotFoundError } from "./src/services/storage.js";

import { getCategories, createCategory, updateCategory, deleteCategory } from "./src/repositories/categoryRepository.js";
import { getPopularServices } from "./src/repositories/popularServicesRepository.js";
import { getNewsArticles, getNewsArticleBySlug, createNewsArticle, updateNewsArticle, deleteNewsArticle, bulkUpdateNewsArticles } from "./src/repositories/newsRepository.js";
import { getMedia, getMediaPage, finalizePendingUpload, createPendingUpload, deletePendingUpload, getMediaByStoragePath, getMediaByStorageIdentity, getMediaByChecksum, getPendingUpload, registerAzureMedia } from "./src/repositories/mediaRepository.js";
import { listAzureMediaFolder, readAzureMediaVersion, mediaWriteRoute } from './src/services/storage.js';
import { publicMediaAccess } from './src/services/publicMediaAccess.js';
import { getContentMedia } from './src/repositories/contentMediaRepository.js';
import { cleanupExpiredPendingUploads, deleteMediaAsset, mediaErrorPayload } from './src/services/mediaService.js';
import { getCmsUsers, getCmsUserById, getCmsUserByEmail, saveCmsAvatar } from "./src/repositories/cmsUserRepository.js";
import { getPortalUserByEmail, getPortalUserById, createPortalUser, savePortalUserMfa, consumePortalRecoveryCode } from "./src/repositories/portalUserRepository.js";
import { generateTotpSecret, verifyTotp, encryptMfaSecret, decryptMfaSecret, generateRecoveryCodes, hashRecoveryCode, recoveryCodeMatches } from './src/services/mfa.js';
import { getOfficials, saveOfficials } from "./src/repositories/officialsRepository.js";
import { getBarangays, saveBarangays } from "./src/repositories/barangaysRepository.js";
import { decorateLegacyOfficials, getOfficialDirectory, syncLegacyOfficials, syncBarangayTerms, findElectionMatches, connectElectionRecord, disconnectElectionRecord, rejectElectionRecord, refreshElectionRecord, officialsDataQuality, getOfficeholder, createHistoricalOfficeAssignment } from './src/repositories/governmentOfficialsRepository.js';
import { getPostgresRuntime } from './src/repositories/postgresRuntime.js';
import { renderNewsMedia, sanitizeRichText, sanitizeOfficials, sanitizeBarangays } from './src/services/sanitizeHtml.js';
import { id as createId, now as dbNow } from './src/services/identifiers.js';
import { createPkcePair, getGoogleRedirectUri, googleRedirectFromState } from './src/services/googleOAuth.js';
import { verifyRecaptchaToken } from './src/services/recaptchaVerification.js';
import { isMediaUploadPath, isMediaFolderKey, isAzureMediaUploadPath } from './src/services/mediaUploadPath.js';
import { createApiCorsMiddleware, createApiSecurityMiddleware, installApiRegistrationGuard, resolveApiRoutePolicy } from './src/services/apiRoutePolicy.js';
import { publicConfigKeys, toPublicBarangays, toPublicCategory, toPublicNews, toPublicOfficials, toPublicOfficialsDirectory, toPublicPopularService } from './src/services/publicApiDtos.js';
import { installResponseSanitizer, sendPublicError, recordDiagnosticError, redactDiagnostic } from './src/services/errorHandling.js';
import { installErrorCenterRoutes } from './src/services/errorCenterRoutes.js';
import { installApiVersionAliases } from './src/services/apiVersioning.js';
import { registerSearchRoutes } from './src/services/searchRoutes.js';
import { registerWebsiteAnalyticsRoutes, recordPublicNotFound, recordServerOperation, isAnalyticsCollectionEnabled, rejectDisabledAnalytics } from './src/services/websiteAnalyticsRoutes.js';

const invalidatePublicNewsCaches = async () => {
  await Promise.all([
    cacheService.invalidate('news-public'),
    cacheService.invalidate('news-article-public'),
    cacheService.invalidate('notifications'),
  ]);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
let viteDevServer;
installApiRegistrationGuard(app);
installApiVersionAliases(app);
let lifecycle = 'STARTING', initialized = false, coreReady = false;
let lifecycleTimer, lifecycleCheck, lastCheckedAt = 0;
const available = () => coreReady && config.available && lifecycle !== 'SHUTTING_DOWN' && Date.now() - lastCheckedAt < 20000;
let dependencySnapshot = [];
app.disable('x-powered-by');
app.use((req, res, next) => {
  const started = Date.now()
  res.once('finish', () => {
    if (res.statusCode !== 404) return
    const pathname = String(req.path || '').split('?')[0]
    if (/^\/(?:admin|app|auth|portal-auth)(?:\/|$)/i.test(pathname)) return
    const first = pathname.split('/').filter(Boolean)[0] || ''
    const sections = { services: 'services', data: 'data', news: 'news', events: 'events', barangays: 'barangays' }
    const referringSections = { services: 'services', data: 'data', news: 'news', events: 'events', barangays: 'barangays' }
    const root = sections[first] || 'other'
    const routeFamily = /^\/api(?:\/|$)/i.test(pathname) ? 'api' : /\.[A-Za-z0-9]{1,12}$/.test(pathname) ? 'asset' : root
    let referringSection = 'unknown'
    try {
      const referer = req.get('referer')
      if (referer) {
        const refRoot = new URL(referer).pathname.split('/').filter(Boolean)[0] || 'home'
        referringSection = refRoot === 'home' || refRoot === '' ? 'home' : referringSections[refRoot] || 'other'
      }
    } catch { /* Store only the allowlisted section bucket. */ }
    const synthetic = req.get?.('x-analytics-synthetic') === 'true'
    void recordPublicNotFound(routeFamily, referringSection, synthetic)
    void recordServerOperation({ operation: 'public_404', datasetId: 'none', outcome: 'failure', category: 'not_found', cacheStatus: 'none', durationMs: Date.now() - started, synthetic })
  })
  next()
})
const adminAvatarFailures = new Map();
// Production is behind one trusted proxy. Do not trust forwarded
// client-IP headers during local development, where they can be forged.
app.set('trust proxy', address => isTrustedProxyAddress(address));

// Every request gets a server-generated correlation identifier. It is safe to
// expose to callers and lets operators connect a rejected API response with a
// security audit event without logging credentials or request bodies.
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});
installResponseSanitizer(app);
app.use((req, res, next) => {
  const pathname = String(req.originalUrl || req.url || '').split('?')[0];
  const policy = /^\/api\//i.test(pathname) ? resolveApiRoutePolicy(req.method, pathname) : null;
  req.publicSurface = !/^\/api\//i.test(pathname) || policy?.access === 'PUBLIC';
  if (policy && policy.access !== 'PUBLIC') {
    res.set('Cache-Control', 'no-store, private');
    res.vary('Cookie'); res.vary('Authorization');
  }
  next();
});
// Liveness must not wait on configuration, rate limiting, or a dependency.
app.get(['/health', '/healthz', '/health/live', '/api/health/live'], (_req, res) => {
  res.set('Cache-Control', 'no-store').status(200).json({ status: 'ok', service: 'better-getafe' });
});
const checkLifecycle = () => {
  if (lifecycleCheck) return lifecycleCheck;
  lifecycleCheck = (async () => {
  if (!initialized || lifecycle === 'SHUTTING_DOWN') return;
  await config.load();
  await refreshStorageHealth();
  const databases = await Promise.all([databaseHealth('database'), databaseHealth('portalDatabase')]);
  for (const [index, category] of ['database', 'portalDatabase'].entries()) systemStatus[category] = { ...systemStatus[category], status: databases[index].status === 'healthy' ? 'connected' : 'degraded', reason: databases[index].reason };
  systemStatus.redis = { status: trafficProtector.health() };
  systemStatus.storage = { ...systemStatus.storage, provider: storageHealth().provider, status: storageHealth().status === 'healthy' ? 'connected' : 'degraded' };
  const email = emailHealth();
  if (email.status === 'disabled' && systemStatus.email?.status === 'degraded') { email.status = 'degraded'; email.reason = systemStatus.email.reason; }
  dependencySnapshot = [
    { name: 'CMS_DB', required: true, ...databases[0] },
    { name: 'USER_DB', required: true, ...databases[1] },
    { name: 'RUNTIME_CONFIG', required: true, status: config.available ? 'healthy' : 'unhealthy', reason: config.failureReason },
    { name: 'REDIS', required: process.env.NODE_ENV === 'production', status: systemStatus.redis.status, reason: isRedisReady() ? undefined : 'Redis is not ready' },
    { name: 'MEDIA_STORAGE', provider: storageHealth().provider, required: false, status: storageHealth().status, reason: storageHealth().status === 'healthy' ? undefined : systemStatus.storage?.reason || 'Media storage is unavailable' },
    { name: 'EMAIL', required: Boolean(config.get('authentication.mfaEnabled') || config.get('authentication.requireEmailVerification')), ...email },
  ];
  const result = evaluateDependencies(dependencySnapshot);
  coreReady = result.ready;
  if (lifecycle !== 'SHUTTING_DOWN') lifecycle = result.status === 'healthy' ? 'READY' : result.ready ? 'DEGRADED' : 'FAILED';
  })().catch(error => { coreReady = false; if (lifecycle !== 'SHUTTING_DOWN') lifecycle = 'FAILED'; dependencySnapshot = [{ name: error.subsystem || 'RUNTIME_CONFIG', required: true, status: 'unhealthy', reason: dependencyReason(error) }]; console.error(JSON.stringify({ event: 'readiness_failed', subsystem: error.subsystem || 'RUNTIME_CONFIG', reason: dependencyReason(error) })); }).finally(() => { lastCheckedAt = Date.now(); lifecycleCheck = null; });
  return lifecycleCheck;
};
const readiness = (_req, res) => {
  const ready = available();
  if (!ready) res.set('Retry-After', '2');
  res.set('Cache-Control', 'no-store').status(ready ? 200 : 503).json({
    service: 'better-getafe',
    status: !initialized ? 'initializing' : !ready ? 'unavailable' : lifecycle === 'DEGRADED' ? 'degraded' : 'healthy',
    ready,
    dependencies: dependencySnapshot.map(({ name, status }) => ({ name, status })),
  });
};
app.get(['/ready', '/health/ready', '/api/ready'], readiness);
// No application handler can run until the initial security/configuration
// snapshot has been activated. Liveness and readiness bypass this gate.
app.use((req, res, next) => {
  if (initialized && available()) return next();
  if (req.method === 'POST' && /^\/api\/analytics\/events\/?$/i.test(req.path)) {
    console.warn(JSON.stringify({ event: 'website_analytics_ingest_failed', request_id: req.requestId, reason: 'application_not_ready' }));
  }
  const starting = lifecycle === 'STARTING';
  res.set({ 'Retry-After': '2', 'Cache-Control': 'no-store' }).status(503);
  res.vary('Accept');
  res.vary('Sec-Fetch-Mode');
  if (sendStartupPage(req, res, { starting })) return;
  res.json({ code: starting ? 'APPLICATION_STARTING' : 'SERVICE_UNAVAILABLE', error: 'The service is temporarily unavailable. Please try again shortly.' });
});

async function configuredWeatherProviders() {
  try { await config.load(); } catch { /* Environment defaults remain available when settings storage is unavailable. */ }
  return providerKeys({
    openWeatherApiKey: config.get('weather.openWeatherApiKey'),
    accuWeatherApiKey: config.get('weather.accuWeatherApiKey'),
  });
}

const secret = process.env.AUTH_SESSION_SECRET || process.env.CMS_SESSION_SECRET || process.env.SESSION_SECRET || (
  process.env.NODE_ENV === "production" ? null : "change-this-local-development-session-secret"
);
if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32 || /^(replace-with|change-this|example|test-secret)/i.test(secret))) throw new Error('A random AUTH_SESSION_SECRET of at least 32 characters is required in production.');

const csrf = createCsrfProtection(secret);

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
  if (process.env.NODE_ENV === 'production' && !secure && /^\/api\/(auth|portal-auth)(\/|$)/i.test(req.path)) {
    return res.status(400).json({ error: 'Secure HTTPS connection required for sign-in.' });
  }
  next();
});
app.use(authDiagnostics({ hasSessionCookie: req => Boolean(readCookies(req.headers.cookie)[SESSION_COOKIE]) }));
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
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; child-src 'self' https://www.facebook.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/; frame-src 'self' https://www.facebook.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/; connect-src 'self' https:; font-src 'self' data: https:; form-action 'self'");
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && /^\/api\//i.test(req.path)) {
    const cookies = readCookies(req.headers.cookie);
    const hasCookieSession = csrf.requiresToken(req, resolveApiRoutePolicy(req.method, req.originalUrl) || { access: 'PROTECTED' });

    const decision = checkRequestOrigin(req, () => config.get('general.url'), { isTrustedProxy: isTrustedProxyAddress });
    const blocked = hasCookieSession && (!decision.allowed || !csrf.verify(req));
    if (req.authDiagnostic) { req.authDiagnostic.csrf = blocked ? 'rejected' : hasCookieSession ? 'accepted' : 'not_required'; if (blocked) req.authDiagnostic.rejection_reason = 'csrf_origin'; }
    if (blocked) return res.status(403).json({ error: 'Cross-site request blocked.' });
  }
  if (config.get('maintenance.enabled') && !req.path.startsWith('/admin') && !req.path.startsWith('/api/auth/') && !req.path.startsWith('/api/portal-auth/') && req.path !== '/api/public/config' && !['/health', '/healthz', '/ready', '/api/health', '/api/health/storage'].includes(req.path)) {
    if (req.method === 'POST' && /^\/api\/(?:analytics\/events|search\/complete)\/?$/i.test(req.path)) {
      return rejectDisabledAnalytics(req, res, 'maintenance');
    }
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
    // A document navigation and the frontend assets it needs are the only
    // public requests that continue during maintenance. The React app then
    // renders the shared 503 page. All application endpoints remain closed.
    const frontendAsset = req.path.startsWith('/assets/') || req.path.startsWith('/packages/') || (process.env.NODE_ENV !== 'production' && (/^\/(?:src|@vite|@react-refresh|node_modules)\//.test(req.path) || ['/favicon.ico', '/vite.svg'].includes(req.path)));
    const frontendNavigation = !/^\/api\//i.test(req.path) && ['GET', 'HEAD'].includes(req.method) && !req.path.includes('.') && req.accepts(['html']) === 'html';
    if (frontendAsset || frontendNavigation) return next();
    return res.status(503).json({ error: config.get('maintenance.message'), expectedCompletion: config.get('maintenance.expectedCompletion') });
  }
  next();
});
// CORS is an explicit allowlist. No API response uses a wildcard origin, and
// preflight requests are accepted only for routes in the API policy registry.
// Keep it after the rate limiter and common security headers so rejected
// cross-origin traffic is still rate-limited and receives the normal headers.
app.use('/api', createApiCorsMiddleware({ configuredOrigin: () => config.get('general.url'), isTrustedProxy: isTrustedProxyAddress }));
app.use('/api/contact', (req, res, next) => {
  const length = Number(req.get('content-length') || 0);
  if (length > 16 * 1024) return res.status(413).json({ error: 'Message payload is too large.' });
  next();
});
app.use('/api/contact', express.json({ limit: '16kb' }));
app.use('/api/analytics/events', express.json({ limit: '8kb' }));
app.use('/api/search/complete', express.json({ limit: '8kb' }));
app.use(['/api/auth', '/api/portal-auth'], express.json({ limit: '32kb' }));
app.use('/api/eservices/payment-webhooks', express.json({ limit: '64kb', verify: (req, _res, bytes) => { req.rawBody = Buffer.from(bytes); } }));
app.use('/api/integrations/webhooks', express.json({ limit: '64kb', verify: (req, _res, bytes) => { req.rawBody = Buffer.from(bytes); } }));
// Large open-data selections are split into provider-sized batches after parsing.
app.use('/api/public-data/datasets', express.json({ limit: '64mb' }));
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
  validateAccount: async (req, session) => {
    const user = await (session.kind === 'cms' ? getCmsUserById : getPortalUserById)(session.id);
    if (!user || user.role === 'disabled' || user.role !== session.role || !session.updatedAt || session.updatedAt !== sessionUpdatedAt(user)) return false;
    req.apiAccount = user;
    return true;
  },
  authorize: async (req, name, type) => {
    await requireAccess(req.apiAccount, name);
    if (type === 'settings') {
      try { requireSettingsPermission(req.apiAccount, name); } catch { throw Object.assign(new Error('Access denied.'), { status: 403 }); }
    }
  },
}));

app.get('/api/auth/csrf', (req, res) => { res.set('Cache-Control', 'no-store, private').json({ token: csrf.issue(req) }); });

app.post('/api/client-errors', async (req, res) => {
  const message = String(req.body?.message || '').slice(0, 2000);
  const stack = String(req.body?.stack || '').slice(0, 12000);
  const componentStack = String(req.body?.componentStack || '').slice(0, 12000);
  if (!message && !stack) return res.status(400).json({ error: 'A client error is required.' });
  const error = new Error(message || 'Client rendering error');
  error.code = 'CLIENT_RENDER_ERROR';
  error.stack = [stack, componentStack].filter(Boolean).join('\n\n');
  await recordDiagnosticError({ req, error, status: 500, context: 'unknown', service: 'Frontend' });
  res.status(202).json({ ok: true });
});

app.get('/api/public/exchange-rates', async (req, res) => {
  try {
    const rates = await getHeaderExchangeRates();
    res.set('Cache-Control', rates.stale ? 'public, max-age=300' : 'public, max-age=3600').json(rates);
  } catch {
    res.set('Cache-Control', 'no-store').status(503).json({ error: 'Exchange rates are temporarily unavailable.' });
  }
});

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
  // Public documents and public APIs never consume an account credential,
  // even when a legacy root cookie or an Authorization header is supplied.
  if (req.publicSurface) return null;
  try {
    if (req.headers.authorization && !/^Bearer \S+$/i.test(req.headers.authorization)) return null;
    const authorization = req.headers.authorization ? req.headers.authorization.slice(7) : '';
    const token = authorization || readCookies(req.headers.cookie)[SESSION_COOKIE] || '';
    return verifySessionToken(token, secret, {
      sessionMinutes: config.get('authentication.sessionMinutes'),
      rememberDays: config.get('authentication.rememberDays'),
    });
  } catch {
    return null;
  }
}

// Development remains usable without Redis, with server-side idle enforcement.
// Production still requires the shared Redis registry.
const developmentSessions = new Map();
const { tokenIsRevoked, registerSession } = createSessionRegistry({
  redis, redisKeys, isRedisReady, config, readState, putState, stateKey, developmentSessions,
});

const admin = async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  req.admin = authenticated(req);
  try {
    if (await tokenIsRevoked(req.admin) || req.admin?.kind !== 'cms' || !['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(req.admin.role)) return res.status(401).json({ error: "Administrator authentication required." });
    if (req.admin.idleExpiresAt) res.setHeader('X-Session-Expires-At', String(req.admin.idleExpiresAt));
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

const permissionAny = permissionIds => async (req, res, next) => {
  for (const permissionId of permissionIds) {
    try {
      await requireAccess(req.admin, permissionId);
      return next();
    } catch (error) {
      if (Number(error?.status) === 403) continue;
      const status = [400, 401, 404, 409, 422].includes(Number(error?.status)) ? error.status : 503;
      return res.status(status).json({ error: safeClientError(error, status === 503 ? 'Authorization service is temporarily unavailable.' : 'Access denied.') });
    }
  }
  return res.status(403).json({ error: 'Access denied.' });
};

const dependencyUnavailable = error => {
  const code = String(error?.code || '').toUpperCase();
  return ['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', '57P01', '53300', '3D000'].includes(code)
    || /PostgreSQL is not connected|database unavailable|connection timed out|database connection failed/i.test(String(error?.message || ''));
};

const logApiFailure = (req, operation, error, status) => {
  console.error(JSON.stringify({
    event: 'api_error',
    request_id: req.requestId || null,
    route: req.path,
    method: req.method,
    operation,
    user_id: req.admin?.id || null,
    status,
    error: redactDiagnostic(error?.message || 'unknown error'),
    database_code: error?.code || null,
  }));
};

const resident = async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  const session = authenticated(req);
  try {
    if (!session || await tokenIsRevoked(session) || session.kind !== 'portal' || session.role !== 'resident') return res.status(401).json({ error: 'Resident authentication required.' });
    if (session.idleExpiresAt) res.setHeader('X-Session-Expires-At', String(session.idleExpiresAt));
    if (session.exp) res.setHeader('X-Session-Absolute-Expires-At', String(session.exp));
    req.resident = await getPortalUserById(session.id);
    if (!req.resident || req.resident.role !== 'resident' || session.role !== req.resident.role || (session.updatedAt && session.updatedAt !== sessionUpdatedAt(req.resident))) return res.status(401).json({ error: 'Resident account unavailable.' });
    const onboarding = await googleOnboarding(req.resident);
    const onboardingAllowedPaths = [
      '/api/citizen/profile',
      '/api/citizen/profile/avatar',
      '/api/users/me/preferences',
    ];
    if (onboarding.setupRequired && !req.path.startsWith('/api/citizen/onboarding/') && !req.path.startsWith('/api/citizen/mobile-verification/') && !onboardingAllowedPaths.includes(req.path)) return res.status(403).json({ error: 'Complete your account information before using the app.', setupRequired: true });
    next();
  } catch (error) {
    console.error('Resident authentication lookup failed:', error.message);
    res.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
  }
};

const setSessionCookie = async (res, token, remember, recordLogin = false) => {
  const [encodedPayload] = token.split('.');
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
  if (!payload.sid) throw new Error('Session registry is unavailable.');
  const metadata = { userId: payload.id, kind: payload.kind, role: payload.role, updatedAt: payload.updatedAt, createdAt: payload.iat, lastActivityAt: payload.iat, expiresAt: payload.exp, idleTimeoutEnabled: config.get('authentication.sessionIdleEnabled') !== false };
  await registerSession(payload, metadata, res.getHeader('X-Request-Id'));
  if (recordLogin && payload.kind === 'cms') await (await getCmsPool()).execute('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?', [payload.id]);
  const attributes = ['HttpOnly', 'Path=/api', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  if (remember) attributes.push(`Max-Age=${config.get('authentication.rememberDays') * 86400}`);
  // Migrate the previous root cookie without destroying a valid session on a
  // public visit. New login/renewal replaces it with the API-scoped cookie.
  res.append('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.append('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${attributes.join('; ')}`);
  console.info(JSON.stringify({ event: 'session_created', request_id: res.getHeader('X-Request-Id') || null, session_kind: payload.kind }));
};

const clearSessionCookie = (res) => {
  for (const cookiePath of ['/', '/api']) res.append('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=${cookiePath}; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
};

const setGoogleOAuthStateCookie = (res, value, secure) => {
  res.append('Set-Cookie', `google_oauth_state=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`);
};
const setPasswordResetCookie = (res, token, maxAge = 600) => {
  res.append('Set-Cookie', `getafe_password_reset=; HttpOnly; Path=/api/auth/renew-password; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.append('Set-Cookie', `getafe_password_reset=${encodeURIComponent(token)}; HttpOnly; Path=/api/auth; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
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

const markAiContentPublished = async (body, article, actorId) => {
  const generationId = String(body?.ai_generation_id || '').trim();
  if (body.status !== 'published' || !article?.id) return;
  const pool = await getCmsPool();
  let linked = [];
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generationId)) {
    [linked] = await pool.execute(`UPDATE ai_content_generations SET publication_status='published',published_article_id=?,reviewed_at=COALESCE(reviewed_at,CURRENT_TIMESTAMP),published_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? RETURNING id`, [String(article.id), generationId, actorId]);
  } else {
    [linked] = await pool.execute(`UPDATE ai_content_generations SET publication_status='published',reviewed_at=COALESCE(reviewed_at,CURRENT_TIMESTAMP),published_at=CURRENT_TIMESTAMP WHERE published_article_id=? AND publication_status<>'published' RETURNING id`, [String(article.id)]);
  }
  if (!linked.length) return;
  await pool.execute(
    `INSERT INTO ai_audit_logs (id, user_id, action, module_key, details, ip_address) VALUES (?, ?, 'ai.content.published', NULL, ?::jsonb, '')`,
    [crypto.randomUUID(), actorId, JSON.stringify({ articleId: String(article.id), generationId: generationId || linked[0].id })],
  );
};

const linkAiContentDraft = async (body, article, actorId) => {
  const generationId = String(body?.ai_generation_id || '').trim();
  if (!article?.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generationId)) return;
  const pool = await getCmsPool();
  await pool.execute(`UPDATE ai_content_generations SET published_article_id=? WHERE id=? AND user_id=? AND publication_status='pending_review'`, [String(article.id), generationId, actorId]);
};

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

const articleImageUrl = async (fallback, relationship) => {
  if (relationship && relationship.media_status !== 'active') return null;
  return relationship
    ? createDownloadUrl(relationship.storage_path, relationship.storage_bucket, relationship.storage_provider)
    : createDownloadUrl(fallback);
};

const decorate = async (article, lookups = null, publicRequest = false) => {
  const { categories, users } = lookups || await (async () => ({
    categories: await getCategories(),
    users: await getCmsUsers(),
  }))();
  const relationships = article.id ? await getContentMedia('news', article.id) : [];
  const featuredRelationship = relationships.find((item) => item.role === 'featured');
  const galleryRelationships = new Map(relationships.filter((item) => item.role === 'gallery').map((item) => [item.storage_path, item]));
  const publicImageUrl = (url, selector) => publicRequest && activeAzureImageKey(url)
    ? `/api/news/${encodeURIComponent(article.slug || article.id)}?image=${selector}`
    : url;
  const content = sanitizeRichText(String(article.content || '').replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, ''));
  const inlineUrls = publicRequest && content.includes('data-news-media')
    ? new Map(await Promise.all(relationships.filter(item => item.role === 'inline' && item.media_status === 'active').map(async item => [
      item.media_id, publicImageUrl(await articleImageUrl(null, item).catch(() => ''), `inline-${encodeURIComponent(item.media_id)}`),
    ])))
    : null;
  return {
    ...article,
    is_important: article.is_important === true || article.is_important === 1,
    show_in_news: article.show_in_news === true || article.show_in_news === 1,
    show_in_upcoming: article.show_in_upcoming === true || article.show_in_upcoming === 1,
    show_in_events: article.show_in_events === true || article.show_in_events === 1,
    show_on_homepage: article.show_on_homepage === true || article.show_on_homepage === 1,
    content: inlineUrls ? renderNewsMedia(content, inlineUrls) : content,
    featured_image: publicImageUrl(await articleImageUrl(article.featured_image, featuredRelationship), 'featured'),
    featured_image_path: article.featured_image,
    featured_media_id: featuredRelationship?.media_id || null,
    gallery_images: await Promise.all((Array.isArray(article.gallery_images) ? article.gallery_images : []).map(async (image, index) => {
      const relationship = galleryRelationships.get(image.storage_path) || relationships.find(item => item.role === 'gallery' && item.media_id === image.media_id);
      const download = await articleImageUrl(image.storage_path || image.url || '', relationship);
      const url = publicImageUrl(download, `gallery-${index}`);
      return {
        ...image,
        media_id: image.media_id || relationship?.media_id || null,
        position: Number.isInteger(image.position) ? image.position : index,
        url,
        thumbnail_url: !url || url !== download ? url : image.thumbnail_url,
      };
    })),
    category: categories.find((c) => c.id === article.category_id) || null,
    author: (() => {
      const u = users.find((u) => u.id === article.author_id);
      return u ? { id: u.id, name: u.name } : null;
    })(),
  };
};

const NEWS_PUBLIC_LIMIT_DEFAULT = 20;
const NEWS_PUBLIC_LIMIT_MAX = 100;
const NEWS_PAGE_MAX = 10_000;
const NEWS_DISPLAYS = new Set(['news', 'upcoming', 'events', 'homepage']);
const NEWS_TYPES = new Set(['news', 'event', 'meeting']);
const NEWS_TEMPORAL = new Set(['upcoming', 'past']);

const queryValue = (value, fallback = '') => Array.isArray(value) ? String(value[0] ?? fallback) : String(value ?? fallback);
const strictPositiveInteger = (value, fallback, max) => {
  if (value === undefined || value === '') return fallback;
  const raw = queryValue(value);
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max ? parsed : null;
};

function parseNewsQuery(query, { admin: isAdmin = false } = {}) {
  const limit = strictPositiveInteger(query.limit, isAdmin ? NEWS_PUBLIC_LIMIT_MAX : NEWS_PUBLIC_LIMIT_DEFAULT, NEWS_PUBLIC_LIMIT_MAX);
  const page = strictPositiveInteger(query.page, 1, NEWS_PAGE_MAX);
  if (limit === null) return { error: `limit must be an integer between 1 and ${NEWS_PUBLIC_LIMIT_MAX}.` };
  if (page === null) return { error: `page must be an integer between 1 and ${NEWS_PAGE_MAX}.` };

  const normalized = { limit, page };
  if (query.month !== undefined) {
    const month = queryValue(query.month);
    if (!/^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/.test(month)) return { error: 'month must use YYYY-MM.' };
    normalized.month = month;
  }
  if (query.day !== undefined) {
    const day = queryValue(query.day);
    const parsedDay = new Date(`${day}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day) return { error: 'day must use YYYY-MM-DD.' };
    normalized.day = day;
  }
  const booleanKeys = ['public', 'important', 'homepage'];
  for (const key of booleanKeys) {
    if (query[key] === undefined || query[key] === '') continue;
    const value = queryValue(query[key]).toLowerCase();
    if (!['true', 'false'].includes(value)) return { error: `${key} must be true or false.` };
    normalized[key] = value === 'true';
  }
  for (const key of ['display', 'type', 'temporal', 'sort']) {
    if (query[key] === undefined || query[key] === '') continue;
    const value = queryValue(query[key]).toLowerCase();
    const valid = key === 'display' ? NEWS_DISPLAYS.has(value)
      : key === 'type' ? NEWS_TYPES.has(value)
        : key === 'temporal' ? NEWS_TEMPORAL.has(value)
          : ['newest', 'oldest', 'event_soonest', 'title'].includes(value);
    if (!valid) return { error: `${key} is not valid.` };
    normalized[key] = value;
  }
  for (const key of ['category', 'search', 'status']) {
    if (query[key] === undefined || query[key] === '') continue;
    const value = queryValue(query[key]).trim();
    const max = key === 'search' ? 120 : key === 'status' ? 32 : 160;
    if (!value || value.length > max) return { error: `${key} is invalid or too long.` };
    normalized[key] = value;
  }
  if (normalized.status && !isAdmin) delete normalized.status;
  if (normalized.status && !['published', 'draft'].includes(normalized.status)) return { error: 'status is not valid.' };
  return { value: normalized };
}

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
  const loginDecision = (action, result, details = {}) => {
    if (req.authDiagnostic) { req.authDiagnostic.authentication = result; if (details.reason) req.authDiagnostic.rejection_reason = details.reason; }
    logAuthentication(action, result, details);
  };
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const validation = validatePasswordLogin(email, password);
    if (validation) {
      loginDecision('login', 'invalid_input', { reason: validation.code });
      return res.status(422).json({ error: validation.message, code: validation.code });
    }
    const remember = req.body.remember === true;
    const requestIdentity = resolveClient(req).value;
    const accountIdentity = crypto.createHmac('sha256', secret).update(email).digest('hex');
    const combinationIdentity = crypto.createHmac('sha256', secret).update(`${requestIdentity}:${email}`).digest('hex');
    const domainIdentities = Object.fromEntries(['cms', 'portal'].map(kind => [kind, {
      account: crypto.createHmac('sha256', secret).update(`${kind}:${email}`).digest('hex'),
      combination: crypto.createHmac('sha256', secret).update(`${kind}:${requestIdentity}:${email}`).digest('hex'),
    }]));
    const throttle = await loginThrottle({ ip: requestIdentity, account: accountIdentity, combination: combinationIdentity });
    if (!throttle.allowed) {
      loginDecision('login', 'rate_limited', { client_id: requestIdentity.slice(0, 12), account_id: accountIdentity.slice(0, 12) });
      const retryAfter = throttle.retryAfter;
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many attempts. Please try again later.', retryAfter });
    }
    const [cmsUser, portalUser] = await Promise.all([getCmsUserByEmail(email), getPortalUserByEmail(email)]);
    const dummyPasswordHash = await DUMMY_LOGIN_PASSWORD_HASH;
    const selected = await selectLoginAccount(password, cmsUser, portalUser, dummyPasswordHash);
    if (!selected) {
      loginDecision('login', 'failed', { reason: 'invalid_credentials', client_id: requestIdentity.slice(0, 12), account_id: accountIdentity.slice(0, 12) });
      await loginThrottle({ ip: requestIdentity, account: accountIdentity, combination: combinationIdentity }, true);
      // Failed proof counts against both possible domains. A successful
      // resident login must never clear a CMS account's brute-force budget.
      for (const identity of Object.values(domainIdentities)) await loginThrottle(identity, true);
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const domainThrottle = await loginThrottle(domainIdentities[selected.kind]);
    if (!domainThrottle.allowed) {
      loginDecision('login', 'rate_limited', { kind: selected.kind, reason: 'account_domain_lockout', account_id: accountIdentity.slice(0, 12) });
      res.set('Retry-After', String(domainThrottle.retryAfter));
      return res.status(429).json({ error: 'Too many attempts. Please try again later.', retryAfter: domainThrottle.retryAfter });
    }
    await loginThrottle({ ip: requestIdentity, account: accountIdentity, combination: combinationIdentity }, false);
    await loginThrottle(domainIdentities[selected.kind], false);
    const { user, kind, passwordCheck } = selected;
    if (passwordCheck.needsRehash) {
      try { await replacePassword(user.id, kind, password, { touchUpdatedAt: false }); }
      catch (error) { console.warn(JSON.stringify({ event: 'password_hash_upgrade_failed', account_kind: kind, error: error?.name || 'Error' })); }
    }
    const age = config.get('authentication.passwordExpiryDays');
    const passwordChanged = await stateTransaction(stateKey('passwordAge', user.id), async value => ({ value, expires: 32503680000000, result: value }));
    if (age && Date.now() - (passwordChanged || Date.parse(user.created_at || '1970-01-01')) > age * 86400000) {
      loginDecision('login', 'password_reset_required', { kind, account_id: accountIdentity.slice(0, 12) });
      const token = crypto.randomBytes(32).toString('hex');
      await putState(stateKey('passwordReset', token), { id: user.id, kind }, 600000);
      setPasswordResetCookie(res, token);
      return res.json({ passwordExpired: true });
    }
    if (user.mfa_enabled === true || user.mfa_enabled === 1) {
      loginDecision('login', 'mfa_challenge', { kind, account_id: accountIdentity.slice(0, 12) });
      const challengeId = crypto.randomBytes(32).toString('hex');
      await putState(stateKey('mfa-login', challengeId), { id: user.id, kind, updatedAt: sessionUpdatedAt(user), remember, attempts: 0, expiresAt: Date.now() + 5 * 60 * 1000 }, 5 * 60 * 1000);
      return res.json({ mfaRequired: true, mfaChallengeId: challengeId });
    }
    const verified = await stateTransaction(stateKey('verified', user.id), async value => ({ value, expires: 3250368000000000, result: value }));
    const emailCodeRequired = config.get('authentication.mfaEnabled') || (config.get('authentication.requireEmailVerification') && !verified);
    if (emailCodeRequired) {
      try {
        const challengeId = await issueCode(user.email, 'login', { id: user.id, kind, updatedAt: sessionUpdatedAt(user), remember });
        const challenge = await readState(stateKey('challenge', challengeId));
        loginDecision('login', 'email_challenge', { kind, account_id: accountIdentity.slice(0, 12) });
        return res.json({ challengeId, verificationRequired: true, nextResendAt: challenge?.nextResendAt, retryAfter: Math.max(1, Math.ceil(((challenge?.nextResendAt || Date.now() + 30000) - Date.now()) / 1000)) });
      } catch (error) {
        console.error('Sign-in verification email failed:', error.message);
        return res.status(503).json({ error: 'We could not send the sign-in code. Please check the email service configuration and try again.' });
      }
    }
    await setSessionCookie(res, makeToken(user, kind, remember), remember, true);
    loginDecision('login', 'success', { kind, account_id: accountIdentity.slice(0, 12) });
    res.json({ user: safeUser(user), admin: kind === 'cms' });
  } catch (error) {
    if (req.authDiagnostic) req.authDiagnostic.authentication = 'service_unavailable';
    logApiFailure(req, 'authentication_lookup', error, 503);
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
    const kind = challenge.kind === 'cms' ? 'cms' : 'portal';
    const user = kind === 'cms' ? await getCmsUserById(challenge.id) : await getPortalUserById(challenge.id);
    if (!user || (kind === 'portal' ? user.role !== 'resident' : !['staff','it_support','content_manager','admin','super_admin'].includes(user.role)) || (challenge.updatedAt && challenge.updatedAt !== sessionUpdatedAt(user)) || !(user.mfa_enabled === true || user.mfa_enabled === 1) || !user.mfa_secret_encrypted) return res.status(401).json({ error: 'MFA is unavailable for this account.' });
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
      recoveryValid = await (kind === 'cms' ? consumeCmsRecoveryCode : consumePortalRecoveryCode)(user.id, code, recoveryCodeMatches);
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
    const sessionUser = recoveryValid ? await (kind === 'cms' ? getCmsUserById : getPortalUserById)(user.id) : user;
    if (!sessionUser) return res.status(503).json({ error: 'MFA verification is temporarily unavailable.' });
    await setSessionCookie(res, makeToken(sessionUser, kind, completedChallenge.remember), completedChallenge.remember);
    res.json({ user: safeUser(sessionUser), admin: kind === 'cms', recoveryCodeUsed: recoveryValid });
  } catch (error) {
    console.error('MFA verification failed:', error.code || error.name || 'Error');
    res.status(503).json({ error: 'MFA verification is temporarily unavailable.' });
  }
});

// OAuth initiation, token exchange, and Admin → Settings all use the same
// resolved configuration snapshot. Bootstrap environment values are fallback
// inputs only; they must not silently replace a saved admin credential here.
const googleCredentialsFor = () => ({
  clientId: config.get('google.clientId'),
  clientSecret: config.get('google.clientSecret'),
  redirectUri: config.get('google.redirectUri'),
});

app.get('/api/auth/google', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { clientId, clientSecret, redirectUri } = googleCredentialsFor();
  if (!clientId || !clientSecret) return res.status(503).json({ error: 'Google sign-in is not configured.' });
  const intent = req.query.intent === 'signup' ? 'signup' : 'signin';
  const state = crypto.randomBytes(24).toString('hex');
  const pkce = createPkcePair();
  const remember = intent === 'signup' ? true : req.query.remember === 'true';
  try {
    const redirect = getGoogleRedirectUri({
      configured: redirectUri,
      publicSiteUrl: config.get('general.url'),
      protocol: req.protocol,
      host: req.get('host'),
      production: process.env.NODE_ENV === 'production',
    });
    await putState(stateKey('google-oauth-state', state), { intent, codeVerifier: pkce.verifier, redirectUri: redirect, clientId, returnUrl: safeReturnPath(req.query.returnUrl), remember }, 10 * 60 * 1000);
    setGoogleOAuthStateCookie(res, `${state}.${intent}`, req.secure);
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
  let intended = null;
  let stage = 'state';
  try {
    const cookies = readCookies(req.headers.cookie);
    const [savedState, cookieIntent = 'signin'] = String(cookies.google_oauth_state || '').split('.');
    if (!req.query.state || !/^[a-f0-9]{48}$/.test(String(req.query.state)) || savedState !== req.query.state) return res.status(400).send('Invalid Google sign-in state.');
    const oauthState = await consumeState(stateKey('google-oauth-state', String(req.query.state)));
    if (!oauthState || oauthState.intent !== cookieIntent) return res.status(400).send('Invalid Google sign-in state.');
    intended = safeReturnPath(oauthState.returnUrl);
    if (req.query.error) return res.redirect(loginDestination(intended, { google: req.query.error === 'access_denied' ? 'cancelled' : 'unavailable' }));
    if (!req.query.code) return res.status(400).send('Invalid Google sign-in state.');
    const intent = oauthState.intent;
    const { clientId, clientSecret, redirectUri } = googleCredentialsFor();
    if (!clientId || !clientSecret || (oauthState.clientId && oauthState.clientId !== clientId)) {
      return res.redirect(loginDestination(intended, { google: 'unavailable' }));
    }
    const redirect = googleRedirectFromState({
      redirectUri: oauthState.redirectUri,
      configured: redirectUri,
      publicSiteUrl: config.get('general.url'),
      protocol: req.protocol,
      host: req.get('host'),
      production: process.env.NODE_ENV === 'production',
    });
    if (typeof oauthState.codeVerifier !== 'string' || oauthState.codeVerifier.length < 43) return res.status(400).send('Invalid Google sign-in state.');
    stage = 'token_exchange';
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: oauthState.codeVerifier }), signal: AbortSignal.timeout(10_000) });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) {
      if (token.error === 'invalid_grant') return res.redirect(loginDestination(intended, { google: 'expired' }));
      throw new Error('Token exchange failed');
    }
    stage = 'profile';
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) });
    const profile = await profileResponse.json(); if (!profileResponse.ok) throw new Error('Profile lookup failed');
    if (profile.email_verified !== true || typeof profile.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) return res.redirect(loginDestination(intended, { google: 'verification' }));
    stage = 'account';
    const cmsUser = await getCmsUserByEmail(profile.email);
    let user = cmsUser;
    const kind = cmsUser ? 'cms' : 'portal';
    let onboarding = {};
    if (cmsUser) {
      if (intent === 'signup') return res.redirect(loginDestination(intended, { google: 'existing' }));
      if (!['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(cmsUser.role)) return res.redirect(loginDestination(intended, { google: 'unavailable' }));
    } else {
      user = await getPortalUserByEmail(profile.email);
      if (user && user.role !== 'resident') return res.redirect(loginDestination(intended, { google: 'unavailable' }));
      if (user && intent === 'signup' && !(await googleOnboarding(user)).googleAccount) {
        return res.redirect(loginDestination(intended, { google: 'existing' }));
      }
      if (!user) user = await createPortalUser(profile.name || profile.email, profile.email, crypto.randomBytes(32).toString('hex'));
      await rememberGoogleProfile(user, profile);
      onboarding = await googleOnboarding(user);
    }
    stage = 'session';
    if (user.mfa_enabled === true || user.mfa_enabled === 1) {
      const challengeId = crypto.randomBytes(32).toString('hex');
      await putState(stateKey('mfa-login', challengeId), { id: user.id, kind, updatedAt: sessionUpdatedAt(user), remember: oauthState.remember === true, attempts: 0, expiresAt: Date.now() + 5 * 60 * 1000 }, 5 * 60 * 1000);
      // Keep the one-use pre-auth challenge out of query strings, proxy logs,
      // and Referer headers; the login page consumes and clears the fragment.
      return res.redirect(`${loginDestination(intended)}#mfa=${encodeURIComponent(challengeId)}`);
    }
    await setSessionCookie(res, makeToken(user, kind, oauthState.remember === true), oauthState.remember === true, kind === 'cms');
    if (kind === 'cms') return res.redirect(loginDestination(intended));
    res.redirect(resolvePostAuthDestination({ ...user, ...onboarding }, intended));
  } catch (error) { console.error('Google OAuth callback failed:', stage, error.code || error.name); res.redirect(loginDestination(intended, { google: stage === 'token_exchange' || stage === 'profile' ? 'provider' : 'unavailable' })); }
});

// Google returns to this browser-facing callback. The exchange remains
// centralized in the API handler above so state, PKCE, cookies, and errors
// are handled in one place.
app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
  const query = String(req.originalUrl || req.url || '').split('?')[1];
  res.redirect(302, `/api/auth/google/callback${query ? `?${query}` : ''}`);
});

app.get("/api/auth/me", createSessionEndpoint({ authenticated, readCookies, SESSION_COOKIE, config, clearSessionCookie, tokenIsRevoked, getCmsUserById, getPortalUserById, sessionUpdatedAt, effectiveAccessFor, googleOnboarding, logApiFailure }));

app.post('/api/auth/renew', (req, res) => {
  const session = req.apiSession;
  if (!session || session.exp <= Date.now() || (session.idleExpiresAt != null && session.idleExpiresAt <= Date.now())) return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  if (session.idleExpiresAt) res.setHeader('X-Session-Expires-At', String(session.idleExpiresAt));
  res.setHeader('X-Session-Absolute-Expires-At', String(session.exp));
  res.setHeader('Cache-Control', 'no-store, private');
  res.json({ expiresAt: session.idleExpiresAt ?? null, absoluteExpiresAt: session.exp, idleTimeoutEnabled: config.get('authentication.sessionIdleEnabled') !== false, idleMinutes: config.get('authentication.sessionIdleMinutes'), warningMinutes: config.get('authentication.sessionWarningMinutes') });
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
    const passwordCheck = await verifyPassword(currentPassword, account?.password, await DUMMY_LOGIN_PASSWORD_HASH);
    if (!account || !passwordCheck.valid) return res.status(401).json({ error: 'Current password is incorrect.' });
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
    console.error(JSON.stringify({ event: 'cms_password_change_failed', error: error?.name || 'Error' }));
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
    res.status(201).json({ ok: true, avatar_url: `/api/account/avatar?v=${crypto.randomUUID()}` });
  } catch (error) {
    console.error('Admin avatar upload failed:', error?.message || error);
    res.status(503).json({ error: 'The profile image could not be uploaded right now.' });
  }
});

app.get('/api/account/avatar', admin, async (req, res) => {
  try {
    const account = await getCmsUserById(req.admin.id);
    if (!account?.avatar_storage_path) {
      res.set('Cache-Control', 'no-store, private');
      return res.sendStatus(404);
    }
    const blockedUntil = adminAvatarFailures.get(account.id) || 0;
    if (blockedUntil > Date.now()) {
      const retryAfter = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000));
      res.set({ 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store, private' });
      return res.status(503).json({ error: 'Profile image storage is temporarily unavailable.', retryAfter });
    }
    const bytes = await readPrivateFile(account.avatar_storage_path);
    const contentType = account.avatar_storage_path.endsWith('.png') ? 'image/png' : account.avatar_storage_path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    adminAvatarFailures.delete(account.id);
    // This URL carries the account's updated_at version, so private browser
    // caching avoids re-downloading a large avatar on every admin route while
    // an avatar change naturally produces a new URL.
    res.set({ 'Cache-Control': 'private, max-age=300', 'Content-Type': contentType }).send(bytes);
  } catch (error) {
    if (isStorageNotFoundError(error)) {
      await saveCmsAvatar(req.admin.id, null).catch(() => {});
      res.set('Cache-Control', 'no-store, private');
      return res.sendStatus(404);
    }
    adminAvatarFailures.set(req.admin.id, Date.now() + 30_000);
    res.set({ 'Retry-After': '30', 'Cache-Control': 'no-store, private' });
    console.error('Administrator avatar retrieval failed:', error?.name || 'StorageError');
    res.status(503).json({ error: 'Profile image storage is temporarily unavailable.', retryAfter: 30 });
  }
});

const cmsMfaAccount = async (req,res) => {
  const account=await getCmsUserById(req.admin.id);
  if (!account || !['staff','it_support','content_manager','admin','super_admin'].includes(account.role)) {res.status(401).json({error:'Authentication required.'});return null;}
  const throttle=await actionThrottle('cms-mfa',account.id,10,15*60*1000);
  if(!throttle.allowed){res.set('Retry-After',String(throttle.retryAfter));res.status(429).json({error:'Too many attempts. Try again later.'});return null;}
  return account;
};
app.get('/api/account/mfa',admin,async(req,res)=>{
  res.set('Cache-Control','no-store, private');
  try {const account=await getCmsUserById(req.admin.id);res.json({enabled:Boolean(account.mfa_enabled),verifiedAt:account.mfa_verified_at||null});}
  catch {res.status(503).json({error:'Security settings are unavailable.'});}
});
app.post('/api/account/mfa/setup',admin,async(req,res)=>{
  res.set('Cache-Control','no-store, private');
  try {
    const account=await cmsMfaAccount(req,res);if(!account)return;
    if(account.mfa_enabled)return res.status(409).json({error:'Authenticator verification is already enabled.'});
    if(!(await verifyPassword(String(req.body.password||''),account.password,await DUMMY_LOGIN_PASSWORD_HASH)).valid)return res.status(401).json({error:'Current password is incorrect.'});
    const secret=generateTotpSecret(),enrollmentId=crypto.randomBytes(32).toString('hex');
    await putState(stateKey('cms-mfa-enrollment',enrollmentId),{userId:account.id,updatedAt:sessionUpdatedAt(account),secret:encryptMfaSecret(secret),attempts:0,expiresAt:Date.now()+600000},600000);
    const issuer=config.get('general.name')||'Municipality of Getafe';
    const uri=`otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    res.json({enrollmentId,qrCode:await QRCode.toDataURL(uri,{width:240,margin:1}),expiresIn:600});
  } catch {res.status(503).json({error:'Authenticator setup is unavailable.'});}
});
app.post('/api/account/mfa/activate',admin,async(req,res)=>{
  res.set('Cache-Control','no-store, private');
  try {
    const account=await cmsMfaAccount(req,res);if(!account)return;
    if(account.mfa_enabled)return res.status(409).json({error:'Authenticator verification is already enabled.'});
    const key=stateKey('cms-mfa-enrollment',String(req.body.enrollmentId||''));
    const result=await stateTransaction(key,async current=>{
      if(!current||current.userId!==account.id||current.updatedAt!==sessionUpdatedAt(account))return{value:null,result:null};
      if(verifyTotp(decryptMfaSecret(current.secret),req.body.code))return{value:null,result:current};
      current.attempts++;return{value:current.attempts>=5?null:current,expires:current.expiresAt,result:null};
    });
    if(!result)return res.status(401).json({error:'Invalid or expired code. Start setup again after five attempts.'});
    const recoveryCodes=generateRecoveryCodes();
    await saveCmsMfa(account.id,{enabled:true,secret:result.secret,recoveryCodes:recoveryCodes.map(code=>hashRecoveryCode(code)),verifiedAt:new Date().toISOString(),expectedUpdatedAt:account.updated_at});
    const updated=await getCmsUserById(account.id),session=authenticated(req);
    await setSessionCookie(res,makeToken(updated,'cms',session?.remember===true),session?.remember===true);
    res.json({enabled:true,recoveryCodes});
  }catch{res.status(503).json({error:'Authenticator verification could not be enabled.'});}
});
app.post('/api/account/mfa/disable',admin,async(req,res)=>{
  res.set('Cache-Control','no-store, private');
  try {
    const account=await cmsMfaAccount(req,res);if(!account)return;
    if(!account.mfa_enabled)return res.status(409).json({error:'Authenticator verification is already disabled.'});
    if(!(await verifyPassword(String(req.body.password||''),account.password,await DUMMY_LOGIN_PASSWORD_HASH)).valid)return res.status(401).json({error:'Current password is incorrect.'});
    const code=String(req.body.code||'');
    if(!verifyTotp(decryptMfaSecret(account.mfa_secret_encrypted),code)&&!await consumeCmsRecoveryCode(account.id,code,recoveryCodeMatches))return res.status(401).json({error:'Invalid authenticator or recovery code.'});
    await saveCmsMfa(account.id,{enabled:false,secret:null,recoveryCodes:[],verifiedAt:null,expectedUpdatedAt:account.updated_at});
    const updated=await getCmsUserById(account.id),session=authenticated(req);
    await setSessionCookie(res,makeToken(updated,'cms',session?.remember===true),session?.remember===true);
    res.json({enabled:false});
  }catch{res.status(503).json({error:'Authenticator verification could not be disabled.'});}
});

app.get('/api/auth/mfa/status', resident, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.json({ enabled: req.resident.mfa_enabled === true || req.resident.mfa_enabled === 1, verifiedAt: req.resident.mfa_verified_at || null });
});

app.post('/api/auth/change-password', resident, async (req, res) => {
  try {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!currentPassword || !password) return res.status(422).json({ error: 'Enter your current password and a new password.' });
    if (currentPassword.length > 1024 || password.length > 1024) return res.status(422).json({ error: 'Passwords must be 1,024 characters or fewer.' });
    const throttle = await actionThrottle('portal-password-change', `${req.resident.id}:${resolveClient(req).value}`, 5, 15 * 60 * 1000);
    if (!throttle.allowed) { res.set('Retry-After', String(throttle.retryAfter)); return res.status(429).json({ error: 'Too many attempts. Please try again later.', retryAfter: throttle.retryAfter }); }
    if (!(await verifyPassword(currentPassword, req.resident.password, await DUMMY_LOGIN_PASSWORD_HASH)).valid) return res.status(401).json({ error: 'Current password is incorrect.' });
    if (!passwordIsStrong(password) || password.length < config.get('authentication.passwordMinLength')) return res.status(422).json({ error: 'Choose a stronger password with uppercase and lowercase letters, a number, and a special character.' });
    if (password === currentPassword) return res.status(422).json({ error: 'Choose a different password.' });
    await replacePassword(req.resident.id, 'portal', password);
    const updated = await getPortalUserById(req.resident.id);
    const session = authenticated(req);
    if (!updated || !session) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    await setSessionCookie(res, makeToken(updated, 'portal', session.remember === true), session.remember === true);
    res.json({ ok: true });
  } catch (error) { console.error(JSON.stringify({ event: 'password_change_failed', error: error?.name || 'Error' })); res.status(503).json({ error: 'Password could not be changed.' }); }
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
    res.json({ enrollmentId, qrCode, expiresIn: 600 });
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
          await redis.hDel(redisKeys.userSessionKeys(session.kind, session.id), session.sid);
        }
      }
      console.info(JSON.stringify({ event: 'session_revoked', request_id: res.getHeader('X-Request-Id') || null, session_kind: session.kind, reason: 'explicit_logout' }));
    }
    catch (error) {
      console.error('Session revocation failed:', error.message);
      return res.status(503).json({ error: 'Sign out could not be completed.' });
    }
  }
  console.info(JSON.stringify({ event: 'explicit_logout', request_id: res.getHeader('X-Request-Id') || null, session_kind: cookieSession?.kind || bearerSession?.kind || null }));
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
      if (!raw) {
        await redis.sRem(index, id);
        await redis.hDel(redisKeys.userSessionKeys(context.session.kind, context.session.id), id);
        continue;
      }
      const metadata = JSON.parse(raw);
      if (Number(metadata.expiresAt) <= Date.now()) {
        await redis.del(redisKeys.session(id));
        await redis.sRem(index, id);
        await redis.hDel(redisKeys.userSessionKeys(context.session.kind, context.session.id), id);
        continue;
      }
      if (metadata.updatedAt !== sessionUpdatedAt(context.user)) {
        await putState(stateKey('revoked-session', id), true, Math.max(1, metadata.expiresAt - Date.now()));
        await redis.del(redisKeys.session(id));
        await redis.sRem(index, id);
        await redis.hDel(redisKeys.userSessionKeys(context.session.kind, context.session.id), id);
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
    await redis.hDel(redisKeys.userSessionKeys(context.session.kind, context.session.id), req.params.sessionId);
    console.info(JSON.stringify({ event: 'session_revoked', request_id: req.requestId || null, session_kind: context.session.kind, reason: 'user_revoked_session' }));
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
      await redis.hDel(redisKeys.userSessionKeys(context.session.kind, context.session.id), id);
      console.info(JSON.stringify({ event: 'session_revoked', request_id: req.requestId || null, session_kind: context.session.kind, reason: 'user_revoked_sessions' }));
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
    await setSessionCookie(res, makeToken(user, payload.kind, payload.remember), payload.remember, true);
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
    setPasswordResetCookie(res, token);
    res.json({ verified: true });
  } catch { res.status(503).json({ error: 'Verification is temporarily unavailable.' }); }
});
app.post('/api/auth/renew-password', async (req, res) => {
  try {
    const password = String(req.body.password || '');
    if (!passwordIsStrong(password) || password.length < config.get('authentication.passwordMinLength')) return res.status(422).json({ error: 'Choose a stronger password with uppercase and lowercase letters, a number, and a special character.' });
    const payload = await consumeState(stateKey('passwordReset', readCookies(req.headers.cookie).getafe_password_reset || ''));
    setPasswordResetCookie(res, '', 0);
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
      if (!token) return res.status(422).json({ error: 'Please complete the reCAPTCHA verification.' });
      if (!(await verifyRecaptchaToken(token, 'register'))) return res.status(422).json({ error: 'reCAPTCHA verification failed. Please try again.' });
    }
    const name = String(req.body.name || "").trim(),
      email = String(req.body.email || "").trim().toLowerCase(),
      password = String(req.body.password || "");
    if (password.length > 1024) return res.status(422).json({ error: 'Password must be 1,024 characters or fewer.' });
    if (!name || name.length > 160 || email.length > 255 || !isValidEmail(email) || !passwordIsStrong(password) || password.length < config.get('authentication.passwordMinLength'))
      return res.status(422).json({ error: `Enter a name, a valid email address, and a stronger password of at least ${config.get('authentication.passwordMinLength')} characters.` });

    if (await getCmsUserByEmail(email) || await getPortalUserByEmail(email)) {
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
    const duplicate = error?.code === "ER_DUP_ENTRY" || error?.code === "23505";
    res.status(duplicate ? 409 : 503).json({
      error: duplicate ? "An account with that email already exists." : "Portal account service is unavailable.",
    });
  }
});

installSettingsRoutes(app, admin, { isTrustedProxy: isTrustedProxyAddress });
installAiRoutes(app, admin);
installAdminUsersRoutes(app, admin);
installStaffRoutes(app, admin);
installAccessManagementRoutes(app, admin);
installErrorCenterRoutes(app, admin);
installCitizenRoutes(app, resident, safeUser, { rotateSession: async (req, res) => {
  const updated = await getPortalUserById(req.resident.id), session = authenticated(req);
  await setSessionCookie(res, makeToken(updated, 'portal', session?.remember === true), session?.remember === true);
} });
installEserviceRoutes(app, { resident, admin, permission });
let eserviceWorkerBusy = false;
const eserviceWorker = setInterval(async () => {
  if (eserviceWorkerBusy) return;
  eserviceWorkerBusy = true;
  try { await drainEserviceOutbox(); await drainStaffNotifications(); }
  catch { /* Durable events remain pending; health monitoring reports database/Redis outages. */ }
  finally { eserviceWorkerBusy = false; }
}, 30000);
eserviceWorker.unref();
installPublicDataRoutes(app);
installContactRoutes(app);

const newsletterHandlers = createNewsletterHandlers({
  getPortalPool,
  sendWelcome: ({ to, subject, text, html }) => sendEmail(to, subject, text, undefined, config.values, [], html),
  getPublicOrigin: () => newsletterPublicOrigin({
    publicSiteUrl: process.env.PUBLIC_SITE_URL,
    configuredUrl: config.get('general.url'),
    production: process.env.NODE_ENV === 'production',
  }),
  getPortalName: () => config.get('general.name') || 'Municipality of Getafe',
  getLogoUrl: () => config.get('general.logo'),
});
app.post('/api/newsletter/subscriptions', newsletterHandlers.subscribe);
app.get('/api/newsletter/confirm/:token', newsletterHandlers.confirm);
app.get('/api/newsletter/unsubscribe/:token', newsletterHandlers.unsubscribe);

app.get('/api/public/config', async (req, res) => {
  // This response contains only intentionally public bootstrap settings. Do
  // not treat browser navigation, Referer, Origin, or Fetch Metadata headers
  // as an authorization mechanism; CORS is applied centrally for callers
  // that need cross-origin access.
  res.setHeader('Cache-Control', 'no-store');
  try {
    // Settings can be saved by a different application instance. Refresh the
    // shared settings snapshot before returning it to public pages.
    try { await config.load(true); } catch { /* Keep the last known working snapshot. */ }
    const publicKeys = publicConfigKeys.filter(key => Object.hasOwn(config.values, key));
    res.json({
      ...Object.fromEntries(publicKeys.map(key => [key, config.get(key)])),
      'analytics.collectionEnabled': isAnalyticsCollectionEnabled() && !config.get('maintenance.enabled'),
    });
  } catch (error) {
    console.error('Public configuration unavailable:', error.message);
    // Keep the public site usable while the settings store is recovering.
    res.json({
      'general.name': 'Municipality of Getafe',
      'general.company': 'Municipality of Getafe',
      'general.url': '',
      'general.timezone': 'Asia/Manila',
      'general.locale': 'en-PH',
      'authentication.registrationEnabled': false,
      'authentication.passwordMinLength': 12,
      'notifications.enabled': false,
      'features.uploads': false,
      'features.publicRegistration': false,
      'analytics.collectionEnabled': false,
      // A fallback may restrict access, never disable authoritative maintenance.
      'maintenance.enabled': config.values?.['maintenance.enabled'] === true,
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
app.use('/api/admin/news', admin, permission('content.news.manage'));
app.get(['/api/news', '/api/admin/news'], async (req, res) => {
  const debugPublicNews = String(process.env.PUBLIC_CONTENT_DEBUG || '').toLowerCase() === 'true';
  const logPublicNews = (event, details = {}) => {
    if (!debugPublicNews) return;
    console.info(JSON.stringify({ event: 'public_news', request_id: req.requestId || null, route: '/api/news', ...details }));
  };
  let failureStage = 'request';
  try {
    const session = authenticated(req);
    const requestedPublic = req.query.public !== undefined && queryValue(req.query.public).toLowerCase() === 'true';
    const cmsUser = !requestedPublic && session?.kind === 'cms' && !(await tokenIsRevoked(session)) ? await getCmsUserById(session.id) : null;
    const isAdmin = Boolean(cmsUser && await hasAccess(cmsUser, 'content.news.manage'));
    const parsed = parseNewsQuery(req.query, { admin: isAdmin });
    if (parsed.error) return res.status(400).json({ error: parsed.error, request_id: req.requestId });
    const query = parsed.value;
    const publicRequest = !isAdmin;
    const cacheMode = publicRequest ? (isRedisReady() ? 'stale_read_through' : 'database_fallback') : 'database';
    const { search: _searchText, ...safeQuery } = query;
    logPublicNews('request_received', { cache_mode: cacheMode, query: { ...safeQuery, has_search: Boolean(_searchText) } });

    const buildResponse = async () => {
      failureStage = publicRequest ? 'public_database' : 'database';
      const allNews = await getNewsArticles();
      const now = new Date();
      let items = allNews.filter((n) => publicRequest
        ? n.status === 'published' && n.published_at && new Date(n.published_at) <= now
        : true);

      if (query.important === true) {
        items = items.filter((n) => (n.is_important === true || n.is_important === 1) && (n.show_on_homepage === true || n.show_on_homepage === 1) && n.status === 'published' && n.published_at && new Date(n.published_at) <= now);
      }

      if (query.status && isAdmin) items = items.filter((n) => n.status === query.status);
      if (query.type) items = items.filter((n) => n.content_type === query.type);

      const displayField = { news: 'show_in_news', upcoming: 'show_in_upcoming', events: 'show_in_events', homepage: 'show_on_homepage' }[query.display];
      if (displayField) items = items.filter((n) => n[displayField] === true || n[displayField] === 1);
      if (query.homepage === true) items = items.filter((n) => n.show_on_homepage === true || n.show_on_homepage === 1);
      if (query.month) {
        const [year, month] = query.month.split('-').map(Number);
        const from = new Date(`${query.month}-01T00:00:00+08:00`);
        const until = new Date(Date.UTC(year, month, 1) - 8 * 60 * 60 * 1000);
        items = items.filter(n => ['event', 'meeting'].includes(n.content_type) && n.event_start_at && new Date(n.event_start_at) < until && new Date(n.event_end_at || n.event_start_at) >= from);
      }
      if (query.day) items = items.filter(n => String(n.published_at || '').slice(0, 10) === query.day);
      if (query.temporal === 'upcoming') {
        items = items.filter((n) => ['event', 'meeting'].includes(n.content_type) && n.event_start_at && new Date(n.event_end_at || n.event_start_at) >= now);
      } else if (query.temporal === 'past') {
        items = items.filter((n) => ['event', 'meeting'].includes(n.content_type) && n.event_start_at && new Date(n.event_end_at || n.event_start_at) < now);
      }

      const [categories, users] = await Promise.all([getCategories(), getCmsUsers()]);
      if (query.category) items = items.filter((n) => n.category_id === query.category || categories.find((c) => c.id === n.category_id)?.slug === query.category);

      if (query.search) {
        const q = query.search.toLowerCase();
        items = items.filter((n) => `${n.title} ${n.excerpt} ${n.content}`.toLowerCase().includes(q));
      }
      if (query.sort === 'title') items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
      else if (query.sort === 'oldest') items.sort((a, b) => new Date(a.published_at || 0) - new Date(b.published_at || 0));
      else if (query.sort === 'event_soonest' || query.temporal === 'upcoming' || query.display === 'upcoming') items.sort((a, b) => new Date(a.event_start_at || 0) - new Date(b.event_start_at || 0));
      else if (query.display === 'events') items.sort((a, b) => new Date(b.event_start_at || 0) - new Date(a.event_start_at || 0));
      else items.sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));

      const pages = Math.ceil(items.length / query.limit) || 1;
      const statusCounts = isAdmin ? items.reduce((counts, item) => { counts[item.status] = (counts[item.status] || 0) + 1; return counts; }, { published: 0, draft: 0 }) : undefined;
      const page = Math.min(query.page, pages);
      const paginated = items.slice((page - 1) * query.limit, page * query.limit);
      failureStage = 'content_decoration';
      const decorated = await Promise.all(paginated.map(n => decorate(n, { categories, users }, publicRequest)));
      const responseItems = publicRequest ? decorated.map(toPublicNews) : decorated;
      return {
        items: responseItems,
        total: items.length,
        page,
        pages,
        limit: query.limit,
        hasNext: page < pages,
        hasPrevious: page > 1,
        ...(statusCounts ? { statusCounts } : {}),
      };
    };

    const cachePublicNews = publicRequest && storageLocation().provider !== 'azure';
    const result = cachePublicNews
      ? await cacheService.getOrSetStale('news-public', JSON.stringify(query), buildResponse, { ttlSeconds: 300, staleSeconds: 900 })
      : await buildResponse();
    if (cachePublicNews) res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    else res.set('Cache-Control', 'no-store, max-age=0');
    logPublicNews('response_ready', { cache_mode: cacheMode, total: result.total, returned: result.items.length });
    res.json(result);
  } catch (error) {
    console.error(JSON.stringify({ event: 'public_news', request_id: req.requestId || null, route: '/api/news', action: 'error', stage: failureStage, message: error?.message || 'unknown error' }));
    res.status(503).json({ error: 'News is temporarily unavailable.' });
  }
});

async function sendPublishedArticleImage(req, res, article, selector) {
  if (storageLocation().provider !== 'azure' || article.status !== 'published' || !article.published_at || new Date(article.published_at) > new Date()) return res.sendStatus(404);
  const relationships = await getContentMedia('news', article.id);
  let url;
  if (selector === 'featured') {
    url = await articleImageUrl(article.featured_image, relationships.find(item => item.role === 'featured'));
  } else if (/^gallery-\d{1,4}$/.test(selector)) {
    const item = article.gallery_images?.[Number(selector.slice(8))];
    if (!item) return res.sendStatus(404);
    url = await articleImageUrl(item.storage_path || item.url, relationships.find(media =>
      media.role === 'gallery' && (media.storage_path === item.storage_path || (item.media_id && media.media_id === item.media_id))));
  } else if (/^inline-[\w-]{1,120}$/.test(selector)) {
    const item = relationships.find(media => media.role === 'inline' && media.media_id === selector.slice(7));
    if (!item) return res.sendStatus(404);
    url = await articleImageUrl(null, item);
  }
  const key = activeAzureImageKey(url);
  if (!key) return res.sendStatus(404);
  const controller = new AbortController();
  res.once('close', () => controller.abort());
  const deadline = setTimeout(() => controller.abort(), 15000);
  let source;
  try {
    const blob = await openAzureArticleImage(key, controller.signal);
    source = blob.readableStreamBody;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(blob.contentType) || !source) {
      source?.destroy();
      return res.sendStatus(404);
    }
    res.set({ 'Content-Type': blob.contentType, 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' });
    if (Number.isSafeInteger(blob.contentLength)) res.set('Content-Length', String(blob.contentLength));
    if (req.method === 'HEAD') { source.destroy(); return res.end(); }
    await pipeline(source, res);
  } catch (error) {
    if (res.headersSent || res.destroyed) return;
    if (isStorageNotFoundError(error)) return res.sendStatus(404);
    logApiFailure(req, 'published_article_image', error, 503);
    res.removeHeader('Content-Length');
    res.set('Cache-Control', 'no-store').status(503).json({ error: 'The article image is temporarily unavailable.' });
  } finally { clearTimeout(deadline); }
}

app.get(['/api/news/:slug', '/api/admin/news/:slug'], async (req, res) => {
  const identifier = queryValue(req.params.slug).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(identifier)) return res.status(404).json({ error: 'Article not found.' });
  try {
    // Public links normally use slugs, but older feeds stored the article UUID
    // in their URL. Accept both forms without changing the public contract.
    const session = authenticated(req);
    const imageRequested = !req.path.startsWith('/api/admin/') && Object.hasOwn(req.query, 'image');
    const requestedPublic = imageRequested || queryValue(req.query.public).toLowerCase() === 'true';
    const cmsUser = !requestedPublic && session?.kind === 'cms' && !(await tokenIsRevoked(session)) ? await getCmsUserById(session.id) : null;
    const isAdmin = Boolean(cmsUser && await hasAccess(cmsUser, 'content.news.manage'));
    const publicRequest = !isAdmin;
    const loadArticle = async () => {
      const item = await getNewsArticleBySlug(identifier);
      const found = item || (await getNewsArticles()).find(entry => entry.id === identifier);
      if (!found) return null;
      const isVisible = found.status === 'published' && found.published_at && new Date(found.published_at) <= new Date();
      return publicRequest && !isVisible ? null : found;
    };
    const loadPublicArticle = async () => {
      const found = await loadArticle();
      return found ? toPublicNews(await decorate(found, null, true)) : null;
    };
    if (imageRequested) {
      const found = await loadArticle();
      if (!found) return res.sendStatus(404);
      return await sendPublishedArticleImage(req, res, found, queryValue(req.query.image));
    }
    const article = publicRequest
      ? await cacheService.getOrSetNegative('news-article-public', `portal-media:${identifier}`, loadPublicArticle, 600, 45)
      : await loadArticle();
    if (!article) return res.status(404).json({ error: 'Article not found.' });
    if (publicRequest) res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    else res.set('Cache-Control', 'no-store, max-age=0');
    res.json(publicRequest ? article : await decorate(article));
  } catch (error) {
    console.error(JSON.stringify({ event: 'public_news_article', request_id: req.requestId || null, message: error?.message || 'unknown error' }));
    res.status(503).json({ error: 'News is temporarily unavailable.' });
  }
});

app.post("/api/news", admin, permission('content.news.manage'), async (req, res) => {
  if (!validateArticle(req.body, res)) return;
  const categories = await getCategories();
  if (req.body.category_id && !categories.some((category) => category.id === req.body.category_id)) {
    return res.status(422).json({ error: "The selected category does not exist." });
  }
  const article = await createNewsArticle(req.body, req.admin.id);
  await markAiContentPublished(req.body, article, req.admin.id);
  await invalidatePublicNewsCaches();
  res.status(201).json(await decorate(article));
});

app.post("/api/news/drafts", admin, permission('content.news.manage'), async (req, res) => {
  const body = { ...req.body, status: 'draft' };
  if (!validateDraft(body, res)) return;
  try {
    const categories = await getCategories();
    if (body.category_id && !categories.some((category) => category.id === body.category_id)) {
      return res.status(422).json({ error: "The selected category does not exist." });
    }
    const article = await createNewsArticle(body, req.admin.id);
    await linkAiContentDraft(req.body, article, req.admin.id);
    await invalidatePublicNewsCaches();
    res.status(201).json(await decorate(article));
  } catch (error) {
    const status = dependencyUnavailable(error) ? 503 : 500;
    logApiFailure(req, 'news_draft_create', error, status);
    res.status(status).json({
      error: status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR',
      message: status === 503 ? 'The news service is temporarily unavailable.' : 'Unable to create news draft.',
      request_id: req.requestId || null,
    });
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
  await markAiContentPublished(req.body, article, req.admin.id);
  await invalidatePublicNewsCaches();
  res.json(await decorate(article));
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
    await linkAiContentDraft(req.body, article, req.admin.id);
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
    const categories = await cacheService.getOrSetStale('categories-public', 'public', async () => {
      const connectionString = getActiveDatabaseConnectionOptions('database')?.connectionString;
      const dataApiRows = await getDataApiCategories(connectionString).catch(() => {
        console.warn(JSON.stringify({ event: 'supabase_category_read_failed', request_id: req.requestId }));
        return null;
      });
      return (dataApiRows ?? await getCategories()).map(toPublicCategory).filter(Boolean);
    }, { ttlSeconds: 300, staleSeconds: 900 });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400').json(categories);
  } catch (error) {
    logApiFailure(req, 'categories_lookup', error, 503);
    res.set({ 'Cache-Control': 'no-store', 'Retry-After': '2' }).status(503)
      .json({ error: 'Categories are temporarily unavailable.', request_id: req.requestId });
  }
});

app.get("/api/popular-services", async (req, res) => {
  const requestedLimit = Number(queryValue(req.query.limit, '3'));
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 6) {
    return res.status(400).json({ error: 'The limit must be an integer between 1 and 6.' });
  }
  try {
    const services = await cacheService.getOrSetStale(
      'popular-services-public',
      String(requestedLimit),
      async () => (await getPopularServices(requestedLimit)).map(toPublicPopularService).filter(Boolean),
      { ttlSeconds: 300, staleSeconds: 900 },
    );
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400').json(services);
  } catch (error) {
    console.error('Popular services lookup failed:', error.message);
    res.status(503).json({ error: 'Popular services are temporarily unavailable.' });
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
    const directory = await cacheService.getOrSetStale('officials-directory-public', cacheKey, async () => toPublicOfficialsDirectory(await getOfficialDirectory(sanitizeOfficials(await getOfficials()) || {}, { status, barangayId })), { ttlSeconds: 300, staleSeconds: 900 });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400').json(directory);
  } catch (error) { console.error('Official directory lookup failed:', error.message); res.status(503).json({ error: 'Officials are temporarily unavailable.' }); }
});

app.get('/api/officials', async (req, res) => {
  try {
    const content = await cacheService.getOrSetStale('officials-public', 'public', async () => {
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
    return toPublicOfficials(content);
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
    await cacheService.invalidate('officials-public');
    await cacheService.invalidate('officials-directory-public');
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
    const decorated = await cacheService.getOrSetStale('barangays-public', 'public', async () => {
    const records = sanitizeBarangays(await getBarangays());
    const psgcReferences = await getLocalGetafePsgc();
    const psgcByName = new Map(psgcReferences.map(item => [normalizePsgcName(item.name), item]));
    const publicRecords = await Promise.all(records.map(async (rawItem) => {
      const item = enrichWithPsgc(rawItem, psgcByName.get(normalizePsgcName(rawItem.name)));
      return ({
      ...item,
      slug: item.slug || item.id,
      more_information: item.more_information || '',
      latitude: item.coords?.lat ?? null,
      longitude: item.coords?.lng ?? null,
      punong_barangay: item.captain || '',
      cover_image: /^media\/[a-zA-Z0-9_\/-]+\.(?:jpg|png|webp)$/i.test(item.cover_image || '')
        ? await createDownloadUrl(item.cover_image)
        : item.cover_image || '',
    })}));
    return toPublicBarangays(publicRecords);
    }, { ttlSeconds: 300, staleSeconds: 900 });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400').json(decorated);
  } catch (error) { console.error('Barangays lookup failed:', error.message); res.status(503).json({ error: 'Barangays are temporarily unavailable.' }); }
});
app.post('/api/admin/psgc/sync', admin, permission('directory.manage'), async (req, res) => {
  const result = await syncGetafePsgc({ force: true });
  if (!result.synced) return res.status(502).json({ error: result.error, requestedVersion: result.requestedVersion, activeVersion: result.activeVersion });
  return res.json({ synced: true, source: 'PSA official release workbook', version: result.version, requestedVersion: result.requestedVersion, activeVersion: result.activeVersion, recordCount: result.recordCount });
});
app.put('/api/barangays', admin, permission('directory.manage'), async (req, res) => {
  try {
    if (!Array.isArray(req.body)) return res.status(422).json({ error: 'Invalid barangays content.' });
    const aiGenerations = new Map(req.body.filter(item => item && item.ai_generation_id).map(item => [String(item.id), String(item.ai_generation_id)]));
    const saved = sanitizeBarangays(req.body);
    await saveBarangays(saved);
    const aiPool = await getCmsPool();
    for (const item of saved) {
      const generationId = aiGenerations.get(String(item.id));
      let linked = [];
      if (generationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generationId)) {
        [linked] = await aiPool.execute(`UPDATE ai_content_generations SET published_article_id=?,publication_status='published',reviewed_at=COALESCE(reviewed_at,CURRENT_TIMESTAMP),published_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? RETURNING id`, [`barangay:${item.id}`, generationId, req.admin.id]);
      } else {
        [linked] = await aiPool.execute(`UPDATE ai_content_generations SET publication_status='published',reviewed_at=COALESCE(reviewed_at,CURRENT_TIMESTAMP),published_at=CURRENT_TIMESTAMP WHERE published_article_id=? AND publication_status<>'published' RETURNING id`, [`barangay:${item.id}`]);
      }
      if (linked.length) await aiPool.execute(`INSERT INTO ai_audit_logs (id,user_id,action,module_key,details,ip_address) VALUES (?,?,'ai.content.published',NULL,?::jsonb,?)`, [crypto.randomUUID(), req.admin.id, JSON.stringify({ source: 'barangay_profile', barangayId: String(item.id), generationId: generationId || linked[0].id }), req.ip || '']);
    }
    await syncBarangayTerms(saved, req.admin.id);
    await auditDirectoryAction(req, 'BARANGAY_OFFICIAL_TERMS_UPDATED', 'barangays', null, saved.map(item => ({ id: item.id, captain: item.captain, termStart: item.termStart || null, termEnd: item.termEnd || null })));
    await cacheService.invalidate('barangays-public');
    await cacheService.invalidate('officials-public');
    await cacheService.invalidate('officials-directory-public');
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
  await cacheService.invalidate('categories-public');
  await cacheService.invalidate('news-public');
  res.status(201).json(item);
});

app.put("/api/categories/:id", admin, permission('content.categories.manage'), async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(422).json({ error: "A category name is required." });

  const item = await updateCategory(req.params.id, name, req.body.slug);
  if (!item) return res.status(404).json({ error: "Category not found." });
  await cacheService.invalidate('categories-public');
  await cacheService.invalidate('news-public');
  res.json(item);
});

app.delete("/api/categories/:id", admin, permission('content.categories.manage'), async (req, res) => {
  const articles = await getNewsArticles();
  if (articles.some((n) => n.category_id === req.params.id))
    return res.status(409).json({ error: "This category is used by an article." });

  await deleteCategory(req.params.id);
  await cacheService.invalidate('categories-public');
  await cacheService.invalidate('news-public');
  res.status(204).end();
});

registerDestinationRoutes(app, { admin, permission });
registerDepartmentRoutes(app, { admin, permission });
registerManagedContentRoutes(app, { admin, permission });
registerSearchRoutes(app, { admin, permission, permissionAny });
registerWebsiteAnalyticsRoutes(app, { admin, permission });
registerIntegrationHubRoutes(app, { admin, permission });
installExternalApiRoutes(app, { admin, permission, permissionAny });

// -- CMS Media --
const mediaImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
app.get('/api/media/folders', admin, permission('content.media.manage'), async (req, res) => {
  const root = config.get('storage.prefix');
  const folder = req.query.folder ?? root;
  const cursor = req.query.cursor;
  const opened = req.query.folder !== undefined;
  const kind = req.query.kind || 'images';
  const location = storageLocation();
  if (!isMediaFolderKey(folder, root) || !['images', 'documents', 'all'].includes(kind)) return res.status(422).json({ error: 'Invalid media folder.' });
  res.set('Cache-Control', 'private, no-store');
  try {
    const prefix = folder + '/';
    const validFile = key => validateObjectKey(key) && key.startsWith(prefix) && !key.slice(prefix.length).includes('/');
    const accepts = type => kind === 'all' || (kind === 'images' ? mediaImageTypes.has(type) : !type?.startsWith('image/'));
    let folders, items, next, rootFiles;
    if (location.provider === 'azure') {
      const page = await listAzureMediaFolder(prefix, cursor || undefined);
      folders = page.folders.filter(key => isMediaFolderKey(key, root));
      const files = page.files.filter(blob => validFile(blob.name) && accepts(blob.properties.contentType));
      rootFiles = !opened && files.length > 0;
      next = page.next;
      items = opened ? await Promise.all(files.map(async blob => {
        const record = await getMediaByStorageIdentity('azure', location.bucket, blob.name);
        if (record ? record.status !== 'active' : !mediaImageTypes.has(blob.properties.contentType)) return null;
        return {
          ...record, storage_path: blob.name, content_type: blob.properties.contentType,
          original_filename: record?.original_filename || blob.name.split('/').at(-1),
          preview_url: await createDownloadUrl(blob.name, location.bucket),
        };
      })) : [];
    } else {
      if (!['backblaze', 'local'].includes(location.provider)) throw new Error('Media provider unavailable.');
      const offset = cursor === undefined ? 0 : Number(cursor);
      if (!Number.isSafeInteger(offset) || offset < 0) return res.status(422).json({ error: 'Invalid media page.' });
      const paths = new Map();
      for (const record of await getMedia()) {
        const key = record.storage_path;
        if (record.status !== 'active' || !validateObjectKey(key) || !key.startsWith(prefix)
            || record.storage_provider !== location.provider || record.storage_bucket !== (location.bucket || 'local')) continue;
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash >= 0) paths.set(prefix + rest.slice(0, slash), null);
        else if (accepts(record.content_type)) paths.set(key, record);
      }
      rootFiles = !opened && [...paths.values()].some(Boolean);
      const entries = [...paths].filter(([, record]) => opened || !record).sort(([a], [b]) => a.localeCompare(b));
      const page = entries.slice(offset, offset + 40);
      folders = page.filter(([, record]) => !record).map(([key]) => key);
      items = await Promise.all(page.filter(([, record]) => record).map(async ([key, record]) =>
        ({ ...record, preview_url: await createDownloadUrl(key) })));
      next = offset + 40 < entries.length ? String(offset + 40) : null;
    }
    res.json({ root, folder, provider: location.provider, folders, rootFiles, items: items.filter(Boolean), next });
  } catch {
    res.status(503).json({ error: 'Could not load this media folder. Try again.' });
  }
});

app.post('/api/media/register', admin, permission('content.media.manage'), async (req, res) => {
  const key = req.body?.key;
  const root = config.get('storage.prefix');
  const location = storageLocation();
  if (location.provider !== 'azure') return res.status(409).json({ error: 'Azure is not the active media provider.' });
  if (!validateObjectKey(key) || !key.startsWith(root + '/')) return res.status(422).json({ error: 'Invalid media key.' });
  res.set('Cache-Control', 'private, no-store');
  try {
    const metadata = await getObjectMetadata(key, location.bucket);
    if (!metadata) return res.status(404).json({ error: 'This image is no longer in the folder.' });
    const existing = await getMediaByStorageIdentity('azure', location.bucket, key);
    if (existing?.status === 'active') return res.json({ ...existing, preview_url: await createDownloadUrl(key, location.bucket) });
    const size = Number(metadata.ContentLength);
    const type = metadata.ContentType;
    const limit = config.get('storage.maxUploadMb') * 1024 * 1024;
    if (!mediaImageTypes.has(type) || !Number.isSafeInteger(size) || size < 1 || size > limit
        || !validateImageUpload(await readAzureMediaVersion(key, size, metadata.ETag), type, limit)) {
      return res.status(422).json({ error: 'This blob is not a supported image within the media size limit.' });
    }
    const item = await registerAzureMedia({ key, bucket: location.bucket, contentType: type, size, uploadedBy: req.admin.id });
    if (!item || item.status !== 'active') return res.status(409).json({ error: 'This key conflicts with another media record. Verify its migration before registering it.' });
    res.json({ ...item, preview_url: await createDownloadUrl(key, location.bucket) });
  } catch {
    res.status(503).json({ error: 'Could not register this media file. Try again.' });
  }
});

app.get("/api/media", admin, permission('content.media.manage'), async (req, res) => {
  try {
    const page = await getMediaPage({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      usage: req.query.usage,
      sort: req.query.sort,
    });
    const activeLocation = storageLocation();
    const activeBucket = activeLocation.bucket || 'local';
    const decoratedMedia = await Promise.all(page.items.map(async (m) => {
      const result = {
        ...m,
        storage_provider: m.storage_provider || (m.storage_bucket === activeBucket ? activeLocation.provider : 'legacy'),
        preview_url: null,
        preview_status: 'unknown',
        storage_status: 'unknown',
      };
      if (result.storage_provider !== activeLocation.provider || m.storage_bucket !== activeBucket) {
        result.preview_status = 'provider_mismatch';
        result.storage_status = 'provider_mismatch';
        return result;
      }
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
        result.preview_status = error.code === 'STORAGE_UNAVAILABLE' ? 'storage_unavailable' : error.message === 'Invalid storage object key.' ? 'invalid' : quotaExceeded ? 'quota_exceeded' : 'unknown';
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

app.post("/api/storage/upload-url", admin, permission('content.media.manage'), mediaWriteRoute(async (req, res) => {
  if (process.env.MEDIA_MIGRATION_FREEZE === 'true') return res.status(503).json({ error: 'Media writes are paused for Azure migration.' });
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
  const requestedStorage = storageLocation();
  const requestedStorageProvider = requestedStorage.provider;
  const requestedStorageBucket = requestedStorage.bucket || 'local';

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

  const folder = req.body.folder;
  if (folder !== undefined && (requestedStorageProvider !== 'azure' || !isMediaFolderKey(folder, config.get('storage.prefix')))) {
    return res.status(422).json({ error: 'Invalid Azure upload folder.' });
  }
  if (checksumSha256 && requestedStorageProvider !== 'azure') {
    const existing = await getMediaByChecksum(checksumSha256, requestedStorageProvider, requestedStorageBucket);
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

  const storagePath = `${folder ?? `${config.get('storage.prefix')}/${yyyy}/${mm}`}/${uuid}.${ext}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + config.get('storage.signedUrlMinutes') * 60000);
  try {
    await createPendingUpload({
      id: uuid, storagePath, storageProvider: requestedStorageProvider, storageBucket: requestedStorageBucket, originalFilename: filename, contentType, fileSize,
      uploadedBy: req.admin.id, context, expiresAt, createdAt, checksumSha256,
    });
    const uploadUrl = process.env.NODE_ENV !== 'production' && requestedStorageProvider === 'backblaze'
      ? `/api/media/upload-proxy?storagePath=${encodeURIComponent(storagePath)}&contentType=${encodeURIComponent(contentType)}`
      : await createUploadUrl(storagePath, contentType, fileSize);
    res.json({
      uploadUrl,
      storagePath,
      checksumSha256,
      expiresIn: config.get('storage.signedUrlMinutes') * 60
    });
  } catch (error) {
    await deletePendingUpload(storagePath).catch(() => {});
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: "Failed to generate upload URL." });
  }
}));

app.put('/api/media/upload-proxy', admin, permission('content.media.manage'), express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '25mb' }), mediaWriteRoute(async (req, res) => {
  const storagePath = String(req.query.storagePath || '');
  const contentType = String(req.query.contentType || '');
  const validPath = storageLocation().provider === 'azure' ? isAzureMediaUploadPath : isMediaUploadPath;
  if (!validateObjectKey(storagePath) || !validPath(storagePath, config.get('storage.prefix')) || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Invalid upload request.' });
  if (!validateImageUpload(req.body, contentType, config.get('storage.maxUploadMb') * 1024 * 1024)) return res.status(422).json({ error: 'The uploaded file is not a valid supported image.' });
  // Authorization is outside the storage retry: a failed lookup must never
  // enter a retry that writes bytes without a validated upload grant.
  const location = storageLocation();
  const pending = await getPendingUpload(storagePath, req.admin.id, location.provider, location.bucket || 'local');
  if (!pending || pending.content_type !== contentType || Number(pending.file_size) !== req.body.length) return res.status(403).json({ error: 'Upload was not issued to this administrator or has expired.' });
  try {
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
}));

app.post("/api/media/complete", admin, permission('content.media.manage'), mediaWriteRoute(async (req, res) => {
  if (process.env.MEDIA_MIGRATION_FREEZE === 'true') return res.status(503).json({ error: 'Media writes are paused for Azure migration.' });
  const storagePath = String(req.body.storagePath || '');
  const relatedRecordId = req.body.relatedRecordId || null;
  const requestedChecksum = String(req.body.checksumSha256 || '').trim().toLowerCase();

  const azureUpload = storageLocation().provider === 'azure';
  if (!storagePath || !validateObjectKey(storagePath) || (azureUpload
    ? !isAzureMediaUploadPath(storagePath, config.get('storage.prefix'))
    : !/^[a-zA-Z0-9_\/-]+\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(storagePath))) {
    return res.status(422).json({ error: "Invalid storage path." });
  }
  if (relatedRecordId && !/^[0-9a-f-]{36}$/i.test(String(relatedRecordId))) {
    return res.status(422).json({ error: "Invalid related record ID." });
  }
  if (requestedChecksum && !/^[a-f0-9]{64}$/.test(requestedChecksum)) {
    return res.status(422).json({ error: 'The file checksum is invalid.' });
  }

  const storageLocationInfo = storageLocation();
  const storageProviderName = storageLocationInfo.provider;
  const bucketName = storageLocationInfo.bucket || 'local';
  const isLocalStorage = storageIsLocal();

  // Guard against duplicate completion
  const existing = await getMediaByStorageIdentity(storageProviderName, bucketName, storagePath);
  if (existing) {
    if (existing.uploaded_by !== req.admin.id) return res.status(403).json({ error: "You do not own this upload." });
    await deletePendingUpload(storagePath).catch(() => {});
    return res.status(200).json({ ...existing, preview_url: await createDownloadUrl(storagePath) });
  }

  const pending = await getPendingUpload(storagePath, req.admin.id, storageProviderName, bucketName);
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
    return res.status(404).json({ error: "Uploaded object not found. Upload may have failed." });
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
    storageProvider: storageProviderName,
    storagePath,
    contentType: verifiedContentType,
    fileSize: verifiedFileSize,
    uploadedBy: req.admin.id,
    relatedRecordId,
    checksumSha256: azureUpload ? null : actualChecksum,
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
    storage_provider: item.storage_provider || storageProviderName,
    original_filename: item.original_filename || item.originalFilename,
    content_type: item.content_type || item.contentType,
    file_size: item.file_size ?? item.fileSize,
    preview_url: await createDownloadUrl(canonicalStoragePath, item.storage_bucket || bucketName),
    reused: Boolean(item.reused),
  });
}));

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

// -- Administrative Health Endpoints --

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

app.get("/api/health", admin, permission('system.infrastructure.view'), async (_req, res) => {
  const ready = available();
  const healthy = ready && lifecycle !== 'DEGRADED';
  res.status(ready ? 200 : 503).json({
    status: !ready ? 'unhealthy' : healthy ? 'ok' : 'degraded',
    ready,
    cmsDatabase: serviceStatus.cmsDatabase,
    portalDatabase: serviceStatus.portalDatabase,
    redis: trafficProtector.health(),
    // The detailed dependency names are protected by the same infrastructure
    // permission as this endpoint; public readiness continues exposing status only.
    dependencies: dependencySnapshot.map(({ name, required, status }) => ({ name, required, status })),
  });
});

app.get('/api/health/database', admin, permission('system.infrastructure.view'), async (req, res) => {
  const health = await databaseHealth('database');
  res.status(health.status === 'healthy' || health.status === 'local' ? 200 : 503).json({ status: health.status === 'healthy' ? 'healthy' : health.status });
});

app.put(/^\/api\/storage\/local-upload\/(.+)$/, admin, permission('content.media.manage'), express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  const relative = req.params[0];
  if (!relative || relative.includes('..') || relative.includes('\\') || !/^[a-zA-Z0-9_\/-]+\.(jpg|png|webp)$/.test(relative)) return res.status(400).json({ error: 'Invalid upload path.' });
  if (!isMediaUploadPath(relative, config.get('storage.prefix'))) return res.status(403).json({ error: 'Upload path was not issued by the server.' });
  const pending = await getPendingUpload(relative, req.admin.id);
  const contentType = relative.endsWith('.jpg') ? 'image/jpeg' : relative.endsWith('.png') ? 'image/png' : 'image/webp';
  if (!pending || pending.content_type !== contentType || Number(pending.file_size) !== req.body?.length) return res.status(403).json({ error: 'Upload was not issued to this administrator or has expired.' });
  if (!Buffer.isBuffer(req.body) || req.body.length > config.get('storage.maxUploadMb') * 1024 * 1024 || !imageSignatureMatches(req.body, contentType)) return res.status(422).json({ error: 'The uploaded file is not a valid supported image.' });
  try {
    if (!storageIsLocal()) {
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
app.use('/uploads', publicMediaAccess({ getMediaByStoragePath, validateObjectKey }));
app.use('/uploads', express.static(path.resolve(config.values['storage.localPath'] || 'data/uploads')));
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
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /auth\nDisallow: /app\nDisallow: /admin\nDisallow: /api/\nDisallow: /uploads/\nSitemap: ${origin}/sitemap.xml\n`);
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

app.use((req, res, next) => {
  if (/^\/(auth|app|admin)(\/|$)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use((req, res, next) => {
  if (viteDevServer) return viteDevServer.middlewares(req, res, next);
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
app.get('/', async (req, res, next) => {
  try {
    const html = await (await import('node:fs/promises')).readFile(path.join(distDirectory, 'index.html'), 'utf8');
    res.set('Cache-Control', 'no-store').type('html').send(homepageMetadata(html, siteUrl(req), Object.fromEntries(publicConfigKeys.map(key => [key, config.get(key)]))));
  } catch (error) { next(error); }
});
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
  const apiRequest = /^\/api\//i.test(String(req.originalUrl || req.url || ''));
  if (error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, 'body')) {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  if (apiRequest) {
    return sendPublicError(res, req, error).catch(failure => {
      console.error(JSON.stringify({ event: 'public_error_handler_failed', request_id: req.requestId || null, status: 503, message: redactDiagnostic(failure?.message || 'unknown').replace(/\s+/g, ' ').slice(0, 500) }));
      return res.status(503).json({ error: { type: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.', referenceId: `ERR-${crypto.randomBytes(4).toString('hex').toUpperCase()}` } });
    });
  }
  return sendPublicError(res, req, error, { status: 500 }).catch(() => res.status(500).type('text/plain').send('The service is temporarily unavailable.'));
});

async function startServer() {
  try {
    console.log('[STARTUP 1/8] Process started');
    const isProd = process.env.NODE_ENV === 'production';
    console.log(`[STARTUP 2/8] Environment: ${process.env.NODE_ENV || 'development'}`);

    console.log(`[STARTUP 3/8] Validating ${isProd ? 'production' : 'development'} configuration`);
    for (const key of ['CMS_SUPABASE_DATABASE_URL', 'MY_REDIS_REDIS_URL', 'REDIS_URL', 'CMS_MEDIA_PROVIDER', 'STORAGE_PROVIDER', 'AZURE_STORAGE_CONNECTION_STRING', 'B2_ENDPOINT', 'B2_BUCKET_NAME', 'B2_KEY_ID', 'B2_APPLICATION_KEY']) console.info(`[STARTUP][ENV] ${key}: ${process.env[key] ? 'configured' : 'unset'}`);
    if (isProd && (!secret || /^(change-this-|replace-with-|your-)/.test(secret))) throw new Error('A bootstrap session signing secret is required.');
    const unifiedDevelopment = !isProd && process.env.PORTAL_UNIFIED_DEV_SERVER === 'true';
    const PORT = Number(isProd ? process.env.PORT || 8080 : unifiedDevelopment ? process.env.VITE_PORT || 5173 : process.env.PORT || process.env.VITE_PORT || 5173);
    if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Backend port must be an integer between 1 and 65535.');
    const HOST = isProd ? '0.0.0.0' : process.env.HOST || '127.0.0.1';
    const server = createServer(app);
    if (unifiedDevelopment) {
      const { createServer: createViteServer } = await import('vite');
      viteDevServer = await createViteServer({
        configFile: path.resolve(__dirname, '..', 'vite.config.js'),
        appType: 'spa',
        server: { middlewareMode: true, ws: { server } },
      });
    }
    server.listen(PORT, HOST);
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    console.log(`[SERVER] Listening on ${HOST}:${PORT}`);
    if (viteDevServer) console.info(`[STARTUP] Vite middleware attached to the application server on ${HOST}:${PORT}`);
    console.log('[STARTUP] Application initializing');
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    server.keepAliveTimeout = 5_000;
    server.maxRequestsPerSocket = 100;
    let stopping = false, maintenanceStarted = false, emailStarted = false, knowledgeWorkerStarted = false;
    let orphanCleanupTimer, cleanupTask, refreshTask, initialization, lastReportedState;
    function shutdown() {
      if (stopping) return;
      stopping = true;
      lifecycle = 'SHUTTING_DOWN';
      coreReady = false;
      clearInterval(lifecycleTimer);
      clearInterval(orphanCleanupTimer);
      const psgcTask = stopPsgcSyncSchedule();
      const deadline = setTimeout(() => process.exit(1), 25000);
      const drained = new Promise(resolve => server.close(resolve));
      (async () => {
        await Promise.allSettled([initialization, refreshTask, cleanupTask, psgcTask, stopEmailWorker(), stopAiKnowledgeWorker(), viteDevServer?.close(), drained]);
        activateEmail(null);
        activateStorage(null);
        const closed = await Promise.allSettled([trafficProtector.stop(), closeDatabaseConnection(), closeConfigStore()]);
        if (closed.some(item => item.status === 'rejected')) process.exitCode = 1;
      })().catch(error => {
        console.error('[Shutdown]', dependencyReason(error));
        process.exitCode = 1;
      }).finally(() => {
        clearTimeout(deadline);
        if (process.connected) process.disconnect();
      });
    }
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);

    function refresh() {
      if (stopping || refreshTask) return refreshTask;
      refreshTask = (async () => {
        if (!isRedisReady()) await trafficProtector.start();
        await checkLifecycle();
        if (stopping) return;
        const ready = available();
        const reportState = JSON.stringify([lifecycle, dependencySnapshot.map(({ name, provider, status }) => ({ name, provider, status }))]);
        if (reportState !== lastReportedState) {
          lastReportedState = reportState;
          reportStartup(dependencySnapshot);
          if (process.connected) process.send({ type: 'portal-readiness', ready, status: evaluateDependencies(dependencySnapshot).status }, () => {});
        }
        if (emailHealth().status === 'degraded') retryEmailVerification();
        if (!ready) return;
        if (!knowledgeWorkerStarted && serviceStatus.cmsDatabase === 'connected') {
          knowledgeWorkerStarted = true;
          startAiKnowledgeWorker({ isReady: () => serviceStatus.cmsDatabase === 'connected' && !stopping });
        }
        if (!maintenanceStarted) {
          maintenanceStarted = true;
          startPsgcSyncSchedule(available);
          orphanCleanupTimer = setInterval(() => {
            if (available() && !cleanupTask && storageHealth().status === 'healthy') {
              cleanupTask = cleanupExpiredPendingUploads({ limit: 100 }).catch(error =>
                console.error('[Storage] Pending-upload cleanup failed:', dependencyReason(error))).finally(() => { cleanupTask = null; });
            }
          }, 3600000);
          orphanCleanupTimer.unref();
        }
        if (!emailStarted && isRedisReady() && emailHealth().status === 'healthy') {
          await recoverEmailJobs();
          if (stopping || !available()) return;
          emailStarted = true;
          startEmailWorker(async ({ to, subject, text, html, attachments, deliveryId, staffNotificationId }) => {
            if (deliveryId && !await validateQueuedNotification(deliveryId)) return;
            if (staffNotificationId && !await validateStaffEmailDelivery(staffNotificationId,to)) return;
            await sendEmail(to, subject, text, undefined, undefined, attachments || [], html);
            await markStaffEmailDelivery(staffNotificationId,true).catch(error=>console.error('[EMAIL] Staff delivery log update failed:',error.message));
            await markNotificationDeliverySent(deliveryId).catch(error => console.error('[EMAIL] Delivery log update failed:', error.message));
          }, async ({ deliveryId,staffNotificationId }, _job, error) => {
            await markStaffEmailDelivery(staffNotificationId,false).catch(()=>{});
            await markNotificationDeliveryFailed(deliveryId, error).catch(() => {});
          }, () => available() && emailHealth().status === 'healthy');
        }
      })().catch(error => console.warn('[Background services]', dependencyReason(error))).finally(() => { refreshTask = null; });
      return refreshTask;
    }

    console.log('[STARTUP 4/8] Initializing runtime settings and CMS database');
    initialization = Promise.all([initializeServices(), trafficProtector.start()]);
    await initialization;
    if (stopping) return;
    initialized = true;
    console.log('[STARTUP 7/8] Checking dependency readiness');
    lifecycleTimer = setInterval(refresh, 5000);
    lifecycleTimer.unref();
    await refresh();
  } catch (error) {
    console.error('\n[STARTUP FAILED]');
    console.error('Stage: Service initialization');
    console.error(`Subsystem: ${error.subsystem || 'BOOTSTRAP'}; Required: true; Reason: ${dependencyReason(error)}`);
    console.error(`Message: ${redactDiagnostic(error.message || 'Unknown error')}`);
    reportStartup([{ name: error.subsystem || 'BOOTSTRAP', required: true, status: 'unhealthy', reason: dependencyReason(error) }]);
    console.error('Local fallback: DISABLED\n');
    process.exit(1);
  }
}

startServer();
