# Login origin rejection

The browser already sends a relative `/api/auth/login` request with JSON and
`credentials: include`. Vite proxies `/api` to the backend; the built application
can also be served directly on port 8080.

The original 403 occurred before the login controller. API CORS accepted the
configured website origin and the specific local Vite origin, but omitted the
application's own effective origin. Direct requests from localhost:8080 or
127.0.0.1:8080 therefore returned `Origin not allowed.`. With an existing session
cookie, the earlier CSRF guard had the same omission and returned
`Cross-site request blocked.` instead. Redis and password validation did not
produce these responses.

Both guards now share one origin policy: accept the application's same origin,
explicitly configured origins, and the specific local Vite origin in development.
Forwarded host values are used only when the immediate connection comes from an
explicitly trusted proxy. Opaque, hostile, and untrusted forwarded origins remain
rejected. No wildcard credentialed CORS, auth-route CSRF exemption, proxy trust
expansion, or rate-limit change was introduced. Credentialed CORS preflight also
permits the existing frontend's `X-Requested-With` header.

An independent MFA lifecycle failure was found during verification: PostgreSQL
already decodes JSONB recovery codes to an array. Recovery-code consumption now
accepts that array as well as legacy JSON strings, retaining its transaction,
row lock, and single-use behavior.

## Development diagnostics

Run the server with `AUTH_DEBUG=true` only while diagnosing login. The default is
off, and production disables these diagnostics regardless of the flag. The
`auth_request_diagnostic` event includes method, path, normalized origin and host,
forwarded authority/protocol, JSON content-type classification, cookie presence,
rate-limit/CSRF/CORS/authentication decisions, status, and rejection reason.
It never includes request bodies, cookie values, passwords, OTPs, or tokens.

## Verification

- Live backend: valid credentials 200, invalid password and nonexistent account
  401, malformed email 422, hostile origins 403; localhost and 127.0.0.1 work.
- Live PostgreSQL/Redis: login after an ordinary failure, MFA challenge and
  recovery-code verification, session lookup, logout, and another login passed.
  Temporary fixture accounts were removed afterward.
- Real browser: login 200, refresh retains authentication, logout clears the
  session, another login succeeds; no browser exceptions.
- Automated origin tests cover production configured origins, trusted versus
  untrusted forwarded hosts, credentialed preflight, hostile origins, and safe
  development diagnostics.
- Traffic tests cover repeated failures/temporary blocks returning 429 and
  production Redis unavailability returning 503. Repository tests cover
  PostgreSQL lookup failure propagation and single-use recovery codes. These
  outage checks use isolated tests; the running dependencies were not stopped.
- Production build, full lint, authentication regression tests, and API security
  policy audit passed. Production origin behavior is tested locally; no live
  production deployment was performed.

Run `node --test scripts/test-request-origin.mjs scripts/test-portal-recovery.mjs`,
`npm run test:auth`, `npm run test:traffic`, and `npm run test:api-security` for
the relevant regression checks.
