# API connectivity diagnosis and verification

## Findings

At inspection, Express was listening on IPv4 port 8080, PostgreSQL and Redis were
reachable, and `/api/public/config` returned 200 directly and through Vite preview.
The reported historical refusal was not present at that instant. There were no
hardcoded `localhost:8080` or `127.0.0.1:8080` API addresses in frontend source or
the generated production assets. The frontend already uses relative API paths.

Two availability defects were established in the startup path:

- Storage initialization threw before Express listened, even for an optional B2
  outage. This also discarded the successfully prepared database resources.
- Preview launched only Vite; it did not start or wait for an API. The development
  runner watched its Node wrapper rather than API health, so a failed worker could
  leave the frontend running. Direct Vite commands did not load the shared `.env`
  port configuration reliably.

An isolated full-server test injected a storage connection refusal. The fixed
server listened on 8086 with storage degraded, accepted a real login, and returned
200 for departments, office options, public config, media metadata, and readiness.
Avatar storage returned 503. No local storage fallback or authentication bypass
was introduced. PostgreSQL/configuration failures still abort startup. Production
authentication still requires Redis. Email failures degrade email-dependent
actions; required email configuration validation remains enforced.

## Architecture and startup

- `scripts/backend-connection.mjs`, `scripts/dev-runner.mjs`, `vite.config.js`, and
  `package.json` make development and preview use one port/target configuration.
  Both start or reuse a healthy API and stop their owned frontend after sustained
  API failure. A reused API is never killed by frontend shutdown.
- `src/services/apiTransport.js` provides relative paths, credentials, timeouts,
  abort handling, JSON parsing and normalized network/HTTP errors. The existing
  API client, request cache, auth provider, config provider, destination/department
  requests, admin API helper, and resident client use this transport.
- Browser requests use `/api/...`; Vite proxies to the configured backend in
  development/preview. Express or a deployment reverse proxy serves the same API
  paths in production. No development address is embedded in browser assets.
- Since Vite changes Host, its proxy changes Origin only for requests already
  same-origin with Vite. Foreign origins remain unchanged for Express to reject.
  This supports preview ports without expanding the backend's origin allowlist
  or proxy trust. Credentialed CORS and CSRF are still enforced.
- `/api/health/live` is a public, minimal process check. `/api/ready` checks both
  databases and production Redis, without exposing infrastructure details.
  Existing detailed `/api/health` remains permission-protected.

## Request repetition and UI states

Forced config refresh previously invalidated pending work during StrictMode/focus
events. It now coalesces concurrent refreshes while still requesting fresh data.
The auth provider had two retry layers and replayed 429 responses. It now makes
at most three transient attempts and immediately stops on 4xx responses; explicit
refresh can recover later. StrictMode remains enabled. Department and media reads
already coalesce concurrent requests; no effect loop was found in those loaders.

Departments now separates loading, failure with Try again, and successful empty
results. Media has a persistent retry state and never shows an empty-library
message on failure. Storage degradation has its own preview label. StableAvatar
already suppresses repeated failed image requests and falls back to initials.
Private CMS cache entries are cleared at logout along with resident cache entries.

## Verification performed

The real browser test uses a generated temporary administrator and normal login,
without mocked authorization. It removes the account and office fixture afterward.

| Request through preview | Result |
| --- | --- |
| POST /api/auth/login | 200 |
| GET /api/health | 200 (authenticated) |
| GET /api/health/live | 200 |
| GET /api/ready | 200 |
| GET /api/public/config | 200 (also anonymous) |
| GET /api/account/avatar | 404 for an absent fixture image; normal fallback |
| GET /api/admin/departments | 200 |
| GET /api/admin/departments/options | 200 |
| GET /api/media?limit=100 | 200 |

Dashboard/direct navigation, Create Office, Edit Office, refresh, and Media Library
passed. Failure-only browser interception verified Departments and Media retry
states, no false empty messages, and no uncontrolled retries. Normal navigation
produced no API connection refusals or browser exceptions. Browser cancellations
when navigating away are intentionally distinguished from connection failures.
The storage-outage test returned 200 for unrelated APIs and 503 for avatar storage.

Quality checks: production build, full lint, API security policy audit, request
cache tests, API transport/origin tests, auth hardening and MFA recovery regression
tests. A production deployment was not changed or tested.

Run these checks from the workspace:

```powershell
npm run build
npm run preview -- --host 127.0.0.1 --port 4176
node scripts/test-connectivity-live.mjs
node --test scripts/test-api-transport.mjs scripts/test-request-origin.mjs
npm run test:request-cache
npm run test:api-security
npm run lint
```

To exercise isolated storage failure, start `node scripts/test-degraded-server.mjs`
in another terminal (8086 by default), then run:

```powershell
$env:CONNECTIVITY_TEST_URL='http://127.0.0.1:8086'
node scripts/test-connectivity-live.mjs --degraded
```
