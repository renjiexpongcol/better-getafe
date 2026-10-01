import { originOf } from './requestOrigin.js';
const safeAuthority = value => {
  if (!value) return null;
  try { return new URL(`http://${value}`).host.slice(0, 254); } catch { return '[invalid]'; }
};
export function authDiagnostics({ hasSessionCookie, logger = event => console.info(JSON.stringify(event)) }) {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'production' || process.env.AUTH_DEBUG !== 'true' || !['/api/auth/login', '/api/portal-auth/login'].includes(req.path)) return next();
    const path = req.path;
    req.authDiagnostic = { rateLimit: 'not_reached', csrf: 'not_reached', cors: 'not_reached', authentication: 'not_reached' };
    res.once('finish', () => logger({ event: 'auth_request_diagnostic', request_id: req.requestId || null, method: req.method, path,
      origin: originOf(req.get('origin')) || null, host: safeAuthority(req.get('host')), forwarded_host: safeAuthority(req.get('x-forwarded-host')),
      forwarded_protocol: ['http', 'https'].includes(req.get('x-forwarded-proto')) ? req.get('x-forwarded-proto') : null,
      content_type: req.is('application/json') ? 'application/json' : 'other', session_cookie_present: Boolean(hasSessionCookie(req)),
      ...req.authDiagnostic, status: res.statusCode }));
    next();
  };
}
