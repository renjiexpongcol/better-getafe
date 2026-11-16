# Backend startup investigation and fix

Verified on 7 October 2026 (Asia/Manila).

## Root cause

The reproduced failure was a runner/API contract mismatch, not an unavailable PostgreSQL database. `scripts/dev-runner.mjs` polled `/health` and required `body.service === 'better-getafe'`. That endpoint returned only `{ "status": "ok" }`. Every poll therefore failed, including after the backend became ready. The unchanged 90-second deadline eventually terminated the development processes without starting Vite.

During the original reproduction, `/health` returned 200 and `/ready` returned 200 with `{ "status": "ready" }`. Both CMS and portal database checks had passed. The runner nevertheless printed the reported startup-failure message.

## Why B2 looked suspicious

Startup passed `deferHealth: true` to `buildStorage`. That returned a resource already marked degraded, without checking the bucket. Activation launched `checkHealth()` without awaiting it. The lifecycle check then saw degraded storage and printed `Application degraded`. The detached check subsequently succeeded and printed `storage_health: healthy`.

The separate `systemStatus.storage` snapshot still contained the initial degraded value, so the protected storage health route could report failure even after the active resource was healthy. Steps 7 and 8 were never implemented as logs. Database health checks also discarded their exceptions, hiding reasons for real failures in other scenarios.

## Startup before and after

Before: bind HTTP → print steps 4–6 together → await settings/database construction and Redis's initial connection attempt → activate storage with its detached health check still pending → mark initialized → check databases and active storage → print READY or DEGRADED → runner continues rejecting the liveness response.

After:

1. Process start.
2. Report environment.
3. Validate configuration with the correct development/production label; report environment-variable presence without values. Existing production signing-secret requirements remain enforced.
4. Bind HTTP, keep application routes gated, then load runtime settings and build/verify the CMS PostgreSQL resource.
5. Build/verify the portal user PostgreSQL resource. This log now occurs at the actual phase.
6. Await B2's bounded bucket-access check, then initialize SMTP. Redis starts alongside service initialization and performs its bounded initial connection attempt. No deferred B2 activation check remains.
7. After service initialization settles, check live database/schema health, configuration availability, Redis readiness, storage, and SMTP policy.
8. Print dependency results, sanitized reasons, required/optional failures, terminal application state, and API readiness. Fatal initialization exceptions also print a terminal failure summary with their subsystem.

The runner polls `/ready`. It accepts only an HTTP success response from the expected service with `ready: true` and status `healthy` or `degraded`. Liveness alone cannot start the frontend. Required failures continue to return readiness HTTP 503 and keep application handlers gated. Recoverable outages retain the live process and can recover without restart.

Public liveness/readiness responses contain no dependency details or credentials. Detailed dependency results remain in server logs or existing protected infrastructure routes.

## Database and configuration findings

- `cloudSql.js` is a legacy module name. It builds direct `pg.Pool` resources through `postgres.js`; it does not select a Cloud SQL connector or SQLite fallback.
- Both CMS and resident services use the backend `CMS_SUPABASE_DATABASE_URL`; local PostgreSQL connection variables and separate portal URLs are not supported.
- Database pool bounds come from settings. The Supabase URL is a bootstrap environment value and is validated before the app starts.
- The settings provider uses its own PostgreSQL pool and reads `system_settings`. CMS verification checks `users`, `categories`, `news`, `media`, and `media_uploads`; user verification checks `portal_users`. Readiness repeats the required table checks, not just a TCP check.
- CMS and portal repositories use the activated PostgreSQL facades. `postgresCompatibility.js` provides legacy names backed by `postgresRuntime.js`; it does not initialize a local SQL database.
- Setup/migration tooling owns schema creation and bootstrap. Startup verifies the existing schema. No destructive migrations or database-setting changes were performed to make startup succeed.
- The original dotenv `injected env (0)` messages meant no new values were added on repeated loads. Required database, Redis, and B2 variables were present. Redundant backend dotenv calls were removed; backend imports use the quiet config bootstrap. The runner loads its environment in its separate parent process.

## Dependency classification

| Dependency | Required/optional | Failure result |
|---|---|---|
| CMS PostgreSQL | Required | Unhealthy, not ready; fatal configuration/schema errors identify CMS_DB |
| Portal PostgreSQL | Required | Unhealthy, not ready; fatal configuration/schema errors identify USER_DB |
| Runtime settings | Required | Unhealthy, not ready; security/configuration snapshot must be available |
| Redis in production | Required | Unhealthy, not ready; production sessions and authentication rate limiting require it |
| Redis in development | Optional for global readiness | Degraded but ready; existing durable PostgreSQL auth state and local rate limiting remain; Redis-only locks, queues, and idempotency operations still reject unavailability |
| Backblaze B2 | Optional for core API | Degraded but ready; media operations return controlled unavailability, with no local fallback |
| Email | Required when global email MFA or email verification is required; otherwise optional | Required failure blocks readiness; optional failure degrades readiness; unconfigured optional SMTP is explicitly identified |
| Weather | Optional, request-time integration | Provider errors affect weather functionality; startup does not invent a healthy result or require a provider call |
| BetterGov/external API, Facebook, SMS | Optional/request-time features rather than startup dependencies | Their feature-specific errors do not gate core startup; existing endpoint/configuration policies remain intact |

Production security checks, session behavior, OTP/MFA, CSRF, authorization, rate limiting, headers, and secret validation were not weakened.

## Changed files

These are this task's edits; unrelated pre-existing worktree changes were preserved.

| File | Change |
|---|---|
| `scripts/dev-runner.mjs` | Use explicit readiness polling and report API readiness before frontend launch |
| `scripts/api-readiness.mjs` | Shared strict readiness response validation and bounded HTTP probe |
| `server/index.js` | Public liveness/readiness contract, required/optional evaluation, live registry synchronization, accurate steps, startup summary, environment presence diagnostics, exception subsystem reporting |
| `server/src/services/startupDiagnostics.js` | Dependency evaluation, allow-listed error metadata, terminal summary |
| `server/src/services/runtimeConfiguration.js` | Await B2 check, actual phase logs, database subsystem attribution, preserve failure reasons, atomic SMTP status activation |
| `server/src/services/initialization.js` | Read active storage health rather than a latched startup snapshot |
| `server/src/services/cloudSql.js` | Preserve sanitized database failure reasons and report schema/check exceptions |
| `server/src/services/storage.js` | Remove detached deferred-health path; retain outage reason on recoverable startup resource |
| `server/src/services/email.js` | Preserve SMTP failure reason and expose active transport health |
| `server/src/config/ConfigService.js` | Preserve sanitized settings failure reason and subsystem; clear recovered failures |
| `server/src/infrastructure/redis/redisClient.js` | Use shared quiet environment bootstrap and sanitized connection diagnostics |
| `scripts/test-startup-lifecycle.mjs` | Readiness cases, real runner healthy/degraded/rejection cases, initialization gate, summaries/redaction, healthy B2 registry |
| `scripts/startup-case-fixture.mjs` | Process-isolated startup failure injection without persisted setting changes |
| `scripts/test-startup-failures.mjs` | Real cold-start database refusal, missing database, B2 failure, production Redis failure, optional and required SMTP failure |
| `scripts/test-dependency-recovery.mjs` | Assert settled initialization and live Redis/B2 degraded-to-healthy transitions |
| `docs/BACKEND_STARTUP_FIX.md` | This trace, change inventory, classification, and verification report |

## Tests and final verification

| Command | Result |
|---|---|
| `node --test scripts/test-startup-failures.mjs scripts/test-startup-lifecycle.mjs scripts/test-runtime-resilience.mjs scripts/test-config-service.mjs scripts/test-auth-hardening.mjs` | 34 passed, 0 failed |
| `node scripts/test-dependency-recovery.mjs` | 6 scenario groups passed: early startup gating, PostgreSQL outage/recovery, Redis outage/recovery, B2 outage/recovery, email-worker rejection, cold-start recovery |
| `npm run test:redis` | Passed Redis service assertions, including database-backed security-state operations |
| `npm run test:backend-watch` | 1 scenario passed: runtime files do not restart workers; source edits do |
| Targeted ESLint on all changed JavaScript modules with `--rule no-undef:error --max-warnings 0` | Passed, 0 errors/warnings |
| `npm run dev` | Backend HEALTHY, API Ready YES, runner API ready, Vite running on 5173 |

The first fixed launch encountered an existing frontend-only process occupying 5173. A temporary launch on 5174 verified frontend/proxy operation. After replacing that identified project launcher, the exact `npm run dev` command succeeded on the default ports.

Final checks: backend `/ready` returned HTTP 200 with `{ "service": "better-getafe", "status": "healthy", "ready": true }`; frontend `/`, proxied `/api/public/config`, and database-backed `/api/news` returned HTTP 200. Startup reported both PostgreSQL domains, Redis, B2, runtime configuration, and SMTP healthy. Recovery tests confirmed stable process IDs across dependency outages. Development watcher restarts observed during this task corresponded to source edits, not a dependency-driven restart loop.

The development services are left running at backend port 8080 and frontend port 5173.
