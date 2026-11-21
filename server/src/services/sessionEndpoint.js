import { safeUser } from './authPayload.js';

export function createSessionEndpoint({ authenticated, readCookies, SESSION_COOKIE, config, clearSessionCookie, tokenIsRevoked, getCmsUserById, getPortalUserById, sessionUpdatedAt, effectiveAccessFor, googleOnboarding, logApiFailure }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Vary', 'Cookie');
    let stage = 'read_session';
    try {
      const session = authenticated(req);
      const cookies = readCookies(req.headers.cookie);
      if (config.get('advanced.authDebug')) {
        console.info('Auth session check:', { cookiePresent: Boolean(cookies[SESSION_COOKIE]), sessionValid: Boolean(session) });
      }
      if (!session) {
        if (cookies[SESSION_COOKIE]) console.info(JSON.stringify({ event: 'session_expired', request_id: req.requestId || null, reason: 'invalid_or_expired_session' }));
        if (cookies[SESSION_COOKIE]) clearSessionCookie(res);
        return res.status(401).json({ user: null, error: 'Authentication required.' });
      }
      if (!['cms', 'portal'].includes(session.kind)) {
        clearSessionCookie(res);
        return res.status(401).json({ user: null, error: 'Authentication required.' });
      }
      stage = 'check_revocation';
      if (await tokenIsRevoked(session, { touch: false, requestId: req.requestId })) {
        clearSessionCookie(res);
        return res.status(401).json({ user: null, error: 'Authentication required.' });
      }
      stage = 'load_account';
      const user = session.kind === 'cms' ? await getCmsUserById(session.id) : await getPortalUserById(session.id);
      if (!user || session.role !== user.role || (session.updatedAt && session.updatedAt !== sessionUpdatedAt(user))
        || (session.kind === 'cms' && !['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user.role))
        || (session.kind === 'portal' && user.role !== 'resident')) {
        clearSessionCookie(res);
        return res.status(401).json({ user: null, error: 'Authentication required.' });
      }
      stage = 'load_account_access';
      const authorization = session.kind === 'cms' ? await effectiveAccessFor(user) : null;
      stage = 'build_session_response';
      console.info(JSON.stringify({ event: 'session_validated', request_id: req.requestId || null, session_kind: session.kind }));
      if (session.idleExpiresAt) res.setHeader('X-Session-Expires-At', String(session.idleExpiresAt));
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
        session: { expiresAt: session.idleExpiresAt ?? null, absoluteExpiresAt: session.exp,
          idleTimeoutEnabled: config.get('authentication.sessionIdleEnabled') !== false,
          idleMinutes: config.get('authentication.sessionIdleMinutes'), warningMinutes: config.get('authentication.sessionWarningMinutes') },
      });
    } catch (error) {
      logApiFailure(req, `authentication_session_${stage}`, error, 503);
      res.status(503).json({ error: "The sign-in service is temporarily unavailable." });
    }
  };
}
