import { endpointPolicies } from './apiEndpointPolicies.js';
import { validateApiInput } from './apiInputValidation.js';
import { checkRequestOrigin } from './requestOrigin.js';
const CMS_ROLES = new Set(['admin', 'super_admin', 'staff', 'it_support', 'content_manager']);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Each method/path is audited explicitly; only the storage-key tail is variable.
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compiled = endpointPolicies.map(definition => ({
  ...definition,
  id: `${definition.method} ${definition.path}`,
  methods: [definition.method],
  matcher: new RegExp('^' + definition.path.split('/').map(segment => segment === '*' ? '.+' : segment.startsWith(':') ? '[^/]+' : escapePattern(segment)).join('/') + '/?$', 'i'),
}));
export const apiRouteInventory = Object.freeze(compiled.map(({ matcher, ...definition }) => Object.freeze(definition)));

export function resolveApiRoutePolicy(method, pathname) {
  const normalizedPath = String(pathname || '').split('?')[0];
  const normalizedMethod = String(method || '').toUpperCase();
  const matches = compiled.filter(candidate => candidate.matcher.test(normalizedPath));
  const definition = matches.find(candidate => candidate.method === normalizedMethod || (normalizedMethod === 'HEAD' && candidate.method === 'GET')) || matches[0];
  if (!definition) return null;
  return { ...definition, methods: [...new Set(matches.filter(candidate => candidate.path === definition.path).map(candidate => candidate.method))], methodAllowed: definition.method === normalizedMethod || (normalizedMethod === 'HEAD' && definition.method === 'GET') };
}

// Enforce classification at registration, including aliases and generated routes.
// Checking the template (not a sample URL) prevents a broad parameter route
// from silently classifying a newly added, literal endpoint.
export function installApiRegistrationGuard(app) {
  const middlewareMounts = new Set(['/api', '/api/auth', '/api/portal-auth', '/api/contact', '/api/analytics/events', '/api/search/complete', '/api/citizen', '/api/admin/news', '/api/admin/settings', '/api/admin/access', '/api/admin/users', '/api/admin/system/errors', '/api/public-data/datasets', '/api/eservices/payment-webhooks', '/api/integrations/webhooks']);
  const originalUse = app.use;
  app.use = function (...args) {
    const prefixes = typeof args[0] === 'string' || Array.isArray(args[0]) ? args[0] : '';
    const handlers = prefixes === '' ? args : args.slice(1);
    for (const prefix of Array.isArray(prefixes) ? prefixes : [prefixes]) {
      if (typeof prefix !== 'string') throw new Error('Unclassified middleware mount expression.');
      if (/^\/api(?:\/|$)/i.test(prefix) && !middlewareMounts.has(prefix) && handlers.flat(Infinity).some(handler => !Array.isArray(handler?.stack))) {
        throw new Error(`Unclassified API middleware mount: ${prefix}`);
      }
    }
    for (const handler of handlers.flat(Infinity)) {
      if (!Array.isArray(handler?.stack)) continue;
      for (const prefix of Array.isArray(prefixes) ? prefixes : [prefixes]) {
        for (const layer of handler.stack) {
          if (!layer.route) throw new Error('Mounted router middleware must be registered on the classified application boundary.');
          for (const routePath of Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path]) {
            if (typeof routePath !== 'string') throw new Error('Unclassified mounted router expression.');
            const fullPath = `${prefix}/${routePath}`.replace(/\/{2,}/g, '/');
            for (const method of Object.keys(layer.route.methods)) assertDeclaration(method, fullPath);
          }
        }
      }
      // Freeze the mounted route surface so later router registration cannot
      // silently introduce a handler under an existing parameter policy.
      for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all', 'route', 'use']) {
        handler[method] = () => { throw new Error('Register router endpoints before mounting and declaring their policies.'); };
      }
    }
    return originalUse.apply(this, args);
  };
  const originalRoute = app.route;
  app.route = function (paths) {
    const registered = originalRoute.call(this, paths);
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']) {
      const original = registered[method];
      registered[method] = function (...handlers) {
        assertDeclaration(method, paths);
        return original.apply(this, handlers);
      };
    }
    return registered;
  };
  function assertDeclaration(method, paths) {
    for (const routePath of Array.isArray(paths) ? paths : [paths]) {
      const declared = routePath instanceof RegExp ? '/api/storage/local-upload/*' : routePath;
      if (routePath instanceof RegExp && routePath.source !== '^\\/api\\/storage\\/local-upload\\/(.+)$') throw new Error('Unclassified regular expression route.');
      if (!endpointPolicies.some(policy => policy.method === method.toUpperCase() && policy.path === declared)) throw new Error(`Unclassified endpoint: ${method.toUpperCase()} ${declared}`);
    }
  }
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']) {
    const original = app[method];
    app[method] = function (paths, ...handlers) {
      if (!handlers.length) return original.call(this, paths);
      assertDeclaration(method, paths);
      return original.call(this, paths, ...handlers);
    };
  }
}

export const cmsRoles = Object.freeze([...CMS_ROLES]);
export const mutatingMethods = Object.freeze([...MUTATING_METHODS]);

const requestPath = req => String(req.apiRoutePath || req.originalUrl || req.url || '').split('?')[0];

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
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-CSRF-Token, X-Requested-With, Idempotency-Key, X-Filename, X-Requirement-Id, X-Replaces-Id, X-Request-Version');
      return res.status(204).end();
    }
    next();
  };
}

const privateAccess = new Set(['SESSION', 'RESIDENT', 'STAFF', 'CMS']);
const privateError = (res, status, error) => res.status(status).json({ error, request_id: res.getHeader('X-Request-Id') || null });

export function createApiSecurityMiddleware({ authenticate, isRevoked, validateAccount, authorize }) {
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
        path: policy.path,
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
      try {
        if (!validateAccount) return privateError(res, 503, 'Authentication service is temporarily unavailable.');
        if (!await validateAccount(req, session)) return privateError(res, 401, 'Authentication required.');
        if (policy.permissions.length && !authorize) return privateError(res, 503, 'Authorization service is temporarily unavailable.');
        if (policy.permissionMode === 'any') {
          let allowed = false;
          for (const permission of policy.permissions) {
            try {
              await authorize(req, permission, policy.authorization);
              allowed = true;
              break;
            } catch (error) {
              if (Number(error?.status) !== 403) throw error;
            }
          }
          if (!allowed) throw Object.assign(new Error('Access denied.'), { status: 403 });
        } else {
          for (const permission of policy.permissions) await authorize(req, permission, policy.authorization);
        }
      } catch (error) {
        return privateError(res, Number(error?.status) === 403 ? 403 : 503, Number(error?.status) === 403 ? 'Access denied.' : 'Authorization service is temporarily unavailable.');
      }
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
    const inputError = validateApiInput(req, policy);
    if (inputError) return privateError(res, 400, inputError);
    next();
  };
}
