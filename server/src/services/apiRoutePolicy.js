import { checkRequestOrigin } from './requestOrigin.js';
const CMS_ROLES = new Set(['admin', 'super_admin', 'staff', 'it_support', 'content_manager']);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const route = (id, path, methods, access, options = {}) => ({
  id,
  path,
  methods,
  access,
  body: options.body || (methods.some(method => MUTATING_METHODS.has(method)) ? 'json' : 'none'),
  matcher: options.matcher,
});

// This registry is the allowlist for the HTTP API.  A route module may still
// apply a narrower permission or ownership check, but a new API path must be
// added here before Express can reach it.  Keep the broad namespace entries
// after the specific public entries so GET and mutation policies do not bleed
// into one another.
const definitions = [
  route('eservices.webhooks', '/api/eservices/payment-webhooks/*', ['POST'], 'PUBLIC'),
  route('eservices.catalog', '/api/services/*', ['GET'], 'PUBLIC'),
  route('eservices.requests', '/api/requests/*', ['GET','POST','PATCH'], 'RESIDENT', { body: 'mixed' }),
  route('eservices.businesses', '/api/businesses', ['GET', 'POST'], 'RESIDENT'),
  route('eservices.business', '/api/businesses/:id', ['PUT'], 'RESIDENT'),
  route('eservices.billing', '/api/billing/*', ['GET'], 'RESIDENT'),
  route('eservices.payment-orders', '/api/payment-orders/*', ['GET','POST'], 'RESIDENT'),
  route('eservices.staff', '/api/staff/eservices/*', ['GET','POST'], 'CMS', { body: 'mixed' }),
  route('weather.getafe', '/api/weather/getafe', ['GET'], 'PUBLIC'),
  route('weather.forecast', '/api/weather/forecast', ['GET'], 'PUBLIC'),
  route('weather', '/api/weather', ['GET'], 'PUBLIC'),
  route('feedback.article', '/api/feedback/article', ['POST'], 'PUBLIC'),
  route('client-errors', '/api/client-errors', ['POST'], 'PUBLIC'),

  route('auth.login', '/api/auth/login', ['POST'], 'AUTH_FLOW'),
  route('auth.mfa.verify', '/api/auth/mfa/verify', ['POST'], 'AUTH_FLOW'),
  route('auth.google', '/api/auth/google', ['GET'], 'AUTH_FLOW'),
  route('auth.google.callback', '/api/auth/google/callback', ['GET'], 'AUTH_FLOW'),
  route('auth.me', '/api/auth/me', ['GET'], 'AUTH_FLOW'),
  route('auth.logout', '/api/auth/logout', ['POST'], 'AUTH_FLOW', { body: 'optional-json' }),
  route('auth.verify-code', '/api/auth/verify-code', ['POST'], 'AUTH_FLOW'),
  route('auth.resend-code', '/api/auth/resend-code', ['POST'], 'AUTH_FLOW'),
  route('auth.forgot-password', '/api/auth/forgot-password', ['POST'], 'AUTH_FLOW'),
  route('auth.forgot-password.verify', '/api/auth/forgot-password/verify', ['POST'], 'AUTH_FLOW'),
  route('auth.renew-password', '/api/auth/renew-password', ['POST'], 'AUTH_FLOW'),
  route('portal-auth.login', '/api/portal-auth/login', ['POST'], 'AUTH_FLOW'),
  route('portal-auth.register', '/api/portal-auth/register', ['POST'], 'AUTH_FLOW'),
  route('auth.sessions', '/api/auth/sessions', ['GET', 'DELETE'], 'SESSION', { body: 'optional-json' }),
  route('auth.session', '/api/auth/sessions/:sessionId', ['DELETE'], 'SESSION', { body: 'none' }),
  route('auth.mfa.status', '/api/auth/mfa/status', ['GET'], 'RESIDENT'),
  route('auth.change-password', '/api/auth/change-password', ['POST'], 'RESIDENT'),
  route('auth.mfa.setup', '/api/auth/mfa/setup', ['POST'], 'RESIDENT'),
  route('auth.mfa.activate', '/api/auth/mfa/activate', ['POST'], 'RESIDENT'),
  route('auth.mfa.disable.request', '/api/auth/mfa/disable/request', ['POST'], 'RESIDENT'),
  route('auth.mfa.disable.confirm', '/api/auth/mfa/disable/confirm', ['POST'], 'RESIDENT'),

  route('public.config', '/api/public/config', ['GET'], 'PUBLIC'),
  route('contact', '/api/contact', ['POST'], 'PUBLIC'),
  route('notifications.public', '/api/notifications', ['GET'], 'PUBLIC'),
  route('news.public.collection', '/api/news', ['GET'], 'PUBLIC'),
  route('news.public.article', '/api/news/:slug', ['GET'], 'PUBLIC'),
  route('categories.public', '/api/categories', ['GET'], 'PUBLIC'),
  route('popular-services.public', '/api/popular-services', ['GET'], 'PUBLIC'),
  route('officials.directory', '/api/officials/directory', ['GET'], 'PUBLIC'),
  route('officials.public', '/api/officials', ['GET'], 'PUBLIC'),
  route('barangays.public', '/api/barangays', ['GET'], 'PUBLIC'),
  route('departments.collection', '/api/departments', ['GET'], 'PUBLIC'),
  route('departments.item', '/api/departments/:slug', ['GET'], 'PUBLIC'),
  route('discover.collection', '/api/discover', ['GET'], 'PUBLIC'),
  route('discover.legacy', '/api/discover/legacy/:key', ['GET'], 'PUBLIC'),
  route('discover.item', '/api/discover/:slug', ['GET'], 'PUBLIC'),
  route('public-data', '/api/public-data/*', ['GET', 'POST'], 'PUBLIC'),

  route('resident.citizen', '/api/citizen/*', ['GET', 'POST', 'PUT', 'PATCH'], 'RESIDENT', { body: 'mixed' }),
  // Keep the account-preferences resource explicit.  A broad /api/users/me/*
  // allowlist would make typos look like valid private routes until they hit
  // the final 404 handler, which is exactly the failure this resource should
  // not produce for a supported request.
  route('resident.preferences', '/api/users/me/preferences', ['GET', 'PATCH'], 'RESIDENT'),
  route('resident.notification-preferences', '/api/users/me/notification-preferences', ['GET', 'PATCH'], 'RESIDENT'),

  route('account.password', '/api/account/password', ['PATCH'], 'CMS'),
  route('account.avatar', '/api/account/avatar', ['GET', 'POST'], 'CMS', { body: 'raw-image' }),
  route('officials.mutation', '/api/officials', ['PUT'], 'CMS'),
  route('barangays.mutation', '/api/barangays', ['PUT'], 'CMS'),
  route('categories.mutation', '/api/categories/*', ['POST', 'PUT', 'DELETE'], 'CMS'),
  route('news.mutation', '/api/news/*', ['POST', 'PUT', 'PATCH', 'DELETE'], 'CMS'),
  route('media', '/api/media', ['GET', 'DELETE'], 'CMS'),
  route('media.item', '/api/media/:id', ['DELETE'], 'CMS', { matcher: /^\/api\/media\/(?!upload-proxy(?:\/|$)|complete(?:\/|$))[^/]+\/?$/ }),
  route('media.upload-proxy', '/api/media/upload-proxy', ['PUT'], 'CMS', { body: 'raw-image' }),
  route('media.complete', '/api/media/complete', ['POST'], 'CMS'),
  route('storage.upload-url', '/api/storage/upload-url', ['POST'], 'CMS'),
  route('storage.local-upload', '/api/storage/local-upload/*', ['PUT'], 'CMS', { body: 'raw-image' }),

  route('staff', '/api/staff/*', ['GET', 'POST', 'PATCH'], 'STAFF', { body: 'mixed' }),
  route('admin.system-errors', '/api/admin/system/errors/*', ['GET', 'PATCH'], 'CMS', { body: 'mixed' }),
  route('admin', '/api/admin/*', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], 'CMS', { body: 'mixed' }),

  // These endpoints are retained for operator diagnostics, but are never a
  // public health check.  Public probes should use /health/live or /healthz.
  route('health.storage', '/api/health/storage', ['GET'], 'CMS'),
  route('health.database', '/api/health/database', ['GET'], 'CMS'),
  route('health', '/api/health', ['GET'], 'CMS'),
  route('health.live', '/api/health/live', ['GET'], 'PUBLIC'),
  route('health.ready', '/api/ready', ['GET'], 'PUBLIC'),
];

const exact = value => new RegExp(`^${value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}/?$`);
const segment = value => new RegExp(`^${value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}/[^/]+/?$`);
const wildcard = value => new RegExp(`^${value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:/[^?]*)?/?$`);
const parameterized = definition => {
  if (definition.matcher) return definition.matcher;
  if (definition.path.endsWith('/*')) return wildcard(definition.path.slice(0, -2));
  if (definition.path.includes('/:')) return segment(definition.path.replace(/\/:\w+$/, ''));
  return exact(definition.path);
};

const compiled = definitions.map(definition => ({ ...definition, matcher: parameterized(definition) }));

export const apiRouteInventory = Object.freeze(compiled.map(({ matcher, ...definition }) => ({
  id: definition.id,
  path: definition.path,
  methods: [...definition.methods],
  access: definition.access,
  body: definition.body,
})));

export function resolveApiRoutePolicy(method, pathname) {
  const normalizedPath = String(pathname || '').split('?')[0].replace(/\/{2,}/g, '/');
  const normalizedMethod = String(method || '').toUpperCase();
  const matches = compiled.filter(candidate => candidate.matcher.test(normalizedPath));
  const definition = matches.find(candidate => candidate.methods.includes(normalizedMethod)) || matches[0];
  if (!definition) return null;
  return {
    id: definition.id,
    path: definition.path,
    access: definition.access,
    body: definition.body,
    methods: [...definition.methods],
    // Express treats HEAD as the body-less equivalent of a registered GET.
    // Keep it available without adding duplicate HEAD entries to the audit
    // inventory.
    methodAllowed: definition.methods.includes(normalizedMethod) || (normalizedMethod === 'HEAD' && definition.methods.includes('GET')),
  };
}

export const cmsRoles = Object.freeze([...CMS_ROLES]);
export const mutatingMethods = Object.freeze([...MUTATING_METHODS]);

const requestPath = req => String(req.originalUrl || req.url || '').split('?')[0];

export function createApiCorsMiddleware({ configuredOrigin, isTrustedProxy }) {
  return (req, res, next) => {
    const origin = req.get('origin');
    if (!origin) return next();
    const decision = checkRequestOrigin(req, configuredOrigin, { isTrustedProxy });
    const requestOrigin = decision.source;
    if (req.authDiagnostic) { req.authDiagnostic.cors = decision.allowed ? 'accepted' : 'rejected'; if (!decision.allowed) req.authDiagnostic.rejection_reason = 'cors_origin'; }
    if (!decision.allowed) return res.status(403).json({ error: 'Origin not allowed.' });

    const policy = resolveApiRoutePolicy(req.method === 'OPTIONS' ? req.get('access-control-request-method') || 'GET' : req.method, requestPath(req));
    if (!policy) return res.status(404).json({ error: 'API endpoint not found.' });
    if (req.method === 'OPTIONS') {
      if (!policy.methodAllowed) {
        res.set('Allow', policy.methods.join(', '));
        return res.status(405).json({ error: 'Method not allowed.' });
      }
    }

    res.set('Access-Control-Allow-Origin', requestOrigin);
    if (policy.access !== 'PUBLIC') res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', policy.methods.join(', '));
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With, Idempotency-Key, X-Filename, X-Requirement-Id, X-Replaces-Id, X-Request-Version');
      return res.status(204).end();
    }
    next();
  };
}

const privateAccess = new Set(['SESSION', 'RESIDENT', 'STAFF', 'CMS']);
const privateError = (res, status, error) => res.status(status).json({ error, request_id: res.getHeader('X-Request-Id') || null });

export function createApiSecurityMiddleware({ authenticate, isRevoked }) {
  return async (req, res, next) => {
    const pathname = requestPath(req);
    const policy = resolveApiRoutePolicy(req.method, pathname);
    if (!policy) return privateError(res, 404, 'API endpoint not found.');
    if (!policy.methodAllowed) {
      res.set('Allow', policy.methods.join(', '));
      return privateError(res, 405, 'Method not allowed.');
    }

    req.apiSecurity = policy;
    const shouldAudit = policy.access !== 'PUBLIC' || mutatingMethods.includes(req.method);
    const writeAudit = () => {
      if (!shouldAudit && res.statusCode < 400) return;
      const session = req.apiSession || authenticate(req);
      const event = {
        event: 'api_security_decision',
        request_id: req.requestId || null,
        route: policy.id,
        method: req.method,
        path: pathname,
        access: policy.access,
        status: res.statusCode,
        user_id: session?.id || null,
        user_kind: session?.kind || null,
      };
      const writer = res.statusCode >= 400 ? console.warn : console.info;
      writer(JSON.stringify(event));
    };
    res.once('finish', writeAudit);

    if (privateAccess.has(policy.access)) {
      res.set('Cache-Control', 'no-store, private');
      const session = authenticate(req);
      req.apiSession = session;
      if (!session) return privateError(res, 401, 'Authentication required.');
      try {
        if (await isRevoked(session)) return privateError(res, 401, 'Authentication required.');
      } catch (error) {
        console.error('API session registry lookup failed:', error.message);
        return privateError(res, 503, 'Authentication service is temporarily unavailable.');
      }
      const isPortalResident = session.kind === 'portal' && session.role === 'resident';
      const isCmsUser = session.kind === 'cms' && CMS_ROLES.has(session.role);
      if (policy.access === 'RESIDENT' && !isPortalResident) return privateError(res, 403, 'Resident access required.');
      if (['STAFF', 'CMS'].includes(policy.access) && !isCmsUser) return privateError(res, 403, 'Staff access required.');
      if (policy.access === 'SESSION' && !isPortalResident && !isCmsUser) return privateError(res, 403, 'Authenticated account access required.');
    }

    const hasBody = Number(req.get('content-length') || 0) > 0 || Boolean(req.get('transfer-encoding'));
    const contentType = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (MUTATING_METHODS.has(req.method) && hasBody && policy.body === 'json' && contentType !== 'application/json') {
      return privateError(res, 415, 'Use application/json for this request.');
    }
    if (MUTATING_METHODS.has(req.method) && hasBody && policy.body === 'raw-image' && !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      return privateError(res, 415, 'Use a supported image content type.');
    }
    if (MUTATING_METHODS.has(req.method) && hasBody && policy.body === 'mixed' && contentType !== 'application/json' && !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      return privateError(res, 415, 'Unsupported request content type.');
    }
    next();
  };
}
