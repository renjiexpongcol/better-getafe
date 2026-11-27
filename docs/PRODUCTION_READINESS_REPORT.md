# Production-readiness report — 2026-11-27

## Executive status

**Not ready for production promotion.** The repository now builds a Vite frontend plus a Node 24 Express function for Vercel, and a critical live Supabase permission exposure has been repaired. Cloud credentials, Preview isolation, external worker provisioning and end-to-end verification remain incomplete. No Preview or Production deployment was created, promoted or assigned a domain.

This was an implementation and architecture investigation across the repository, route declarations, configuration, storage/authentication services, workers, migrations, builds and connected project metadata. It was not exhaustive runtime validation of all 609 handlers or every business workflow. Passing builds and doubles-based tests are reported separately from live infrastructure evidence.

## Verified targets and preserved state

| Item | Evidence |
| --- | --- |
| Vercel | Existing team lgu-getafe; better-getafe; prj_0gnvJzzefBfHs8lA5ZHW5TfiaR55; Vite, repository root |
| Supabase | Existing LGU GETAFE project wrgbfwexraarwxpoqzpv; healthy; PostgreSQL 17.11; ap-southeast-2 |
| Initial database schema | 142 public tables, only 13 with RLS; all repository journal entries through 055 present |
| Initial data counts | 2 staff accounts, 8 resident accounts, 45 media records, 5 news records |
| After security repair | Same four counts; anonymous account reads/writes and authenticated settings reads denied; public categories view still granted |
| Final schema | 144 public tables; zero without RLS; zero public-table grants to anon/authenticated; 056 and 057 journaled |
| Storage journal | Accepted Azure cutover already existed, dated 2026-11-15; all 45 media records use Azure |
| Azure intent | lgu-getafe-media / lgumedia / portal-media; private; requested Malaysia West. Actual Azure resource state and bytes were not tested |
| Database capacity | About 23 MB; max_connections 60. Not a load or capacity certification |

No account, content or media record was deleted, reset or replaced. No seed data was run. Migration 056 changes access controls; 057 adds private operational tables. Existing media IDs, references, captions and alternative text remain in the existing schema. Permission snapshots were saved before live access-control changes.

## Significant findings and corrections

| Severity | Root cause and effect | Changed files | Correction | Verification |
| --- | --- | --- | --- | --- |
| P0 | Public Supabase roles had broad grants on users, portal_users, auth_state, role assignments, settings and other application tables without RLS | database/migrations/postgresql/056_restrict_browser_database_access.sql | Enable RLS; revoke backing-table, sequence, public-function and public-view access; repair postgres default privileges; retain fixed public categories projection | BEGIN/ROLLBACK test, live migration, post-change grant checks, unchanged record counts, security advisor run |
| P0 | Vercel project built only the frontend; API import started a listener, process hooks and permanent work | api/index.js, server.js, server/index.js, vercel.json | Separate exported Express app and explicit local start; lazy function bootstrap; no serverless listener/intervals/process-fatal hooks | Production import test replaces setInterval with a throwing sentinel, full route registration, packaged liveness, Vercel-compatible build |
| P1 | Redis configuration errors threw during module loading and stopped the whole app | redisClient.js, redisConfiguration.js, scripts/dev-runner.mjs | Invalid Redis becomes unavailable, bounded connection attempts/queues/commands, fail-closed authentication; public readiness can remain degraded | Import with malformed Redis; existing outage/renewal regression tests |
| P1 | Optional storage/email/Redis health could block unaffected public functionality | server/index.js | Public readiness requires database/configuration; affected auth/email/storage paths retain their own checks | Existing readiness tests and session outage tests; live outage flow still pending |
| P1 | Azure image bytes were routed through a function upload proxy | storage.js, mediaUpload.js, Admin.jsx | HTTPS create-only single-blob SAS, max 15 minutes; browser BlockBlob PUT; authenticated metadata/content finalization retained | Azure SDK doubles inspect SAS scope/protocol/expiry; real upload and CORS pending |
| P1 | Azure object could change between metadata check and validation read | server/index.js | Validate the observed ETag with a bounded-length Azure read | Source verification and existing storage doubles; real race/expiry test pending |
| P1 | Permanent AI/email/notification/integration work does not survive function freeze | server/managed-worker.js, scheduledJobs.js, server/index.js, settingsRoutes.js, websiteAnalyticsRoutes.js | Explicit external worker for long work; authenticated daily bounded cron; no runtime intervals in functions; function-hosted long migration mutation rejected | Function import sentinel, cron credential/claim/failure tests; external host not provisioned |
| P1 | Recovering email processing queues from multiple replicas could duplicate live work; retry bookkeeping could lose a job | managed-worker.js, redisInfrastructure.js | PostgreSQL singleton worker lease; atomic processing-to-retry/dead-letter transition; bounded retries and dead-letter retention | Code-path review; live crash recovery/SMTP still pending. At-least-once SMTP remains |
| P1 | Saved settings could override deployment origin, OAuth tuple or Azure infrastructure | ConfigService.js, defaults.js, deployment.js | Protect environment-provided infrastructure values and validate origin/key/storage/Preview prerequisites | Configuration tests verify environment precedence without decrypting replaced ciphertext |
| P1 | Preview and Production had overlapping integration-variable targets without verified isolation | deployment.js, postgres.js, redisClient.js, ConfigService.js | Reject production database ref in Preview; require isolation attestation; require distinct Azure container; stage/branch-scoped Redis keys | Guard tests. Actual Preview resources remain unverified |
| P1 | Separate settings/CMS/resident pools multiply connections across instances | postgresPool.js, postgres.js, DatabaseSettingsProvider.js, dependencyFailures.js | Share max-two pool leases per instance, finite wait/query/idle limits and deduplicated error handlers | Pool lease lifetime/reuse test. Load test against 60-connection server pending |
| P1 | Existing PostgreSQL session advisory locks are incompatible with transaction pooler assumptions | postgres.js, migrate-postgresql.mjs | Require Session pooler 5432 in Vercel; verify project ref/TLS; direct/session migration URL supported | Resolver tests. Node TCP credentials unavailable |
| P1 | Production Vite configuration evaluated development backend ports | vite.config.js | Production build skips development proxy/port resolution | Regression test and Vercel-compatible build with pulled placeholder port values |
| P1 | Function proxy socket IP would combine visitor rate-limit buckets | trafficProtection.js | Use validated dedicated Vercel forwarded IP only when VERCEL=1; retain trusted-proxy/local rules elsewhere | Dedicated runtime regression check; deployment ingress test still needed |
| P1 | Locked transitive Express packages included body-parser high and qs moderate advisories | package-lock.json | Resolve body-parser 2.4.0 and qs 6.17.1 within parent constraints | Production npm audit reports zero vulnerabilities; default/runtime tests |
| P2 | Scheduled processing had no durable function execution ledger | migration 057, scheduledJobs.js | Persist daily claims, two-minute leases, retry availability and three-attempt ceiling; private heartbeat state | Live additive migration; isolated credential/duplicate/failure tests |
| P2 | PSGC requests could consume a function's whole budget across pages | psgcSyncService.js, scheduledJobs.js | Bound upstream sync to a 35-second scheduled fetch budget; retain snapshot on failure | Existing cached-snapshot test; live failure timing pending |
| P2 | Admin status omitted actual Redis test and worker/scheduler evidence | infrastructureHealth.js, settingsRoutes.js, AdminSettings.jsx | Provider/status/reason display, real Redis Test connection under existing permission/CSRF checks, persisted heartbeat/run checks | Browser fixture: success, failure, CSRF, desktop and mobile; screenshots saved |
| P2 | Package advertised commands with deleted target files | package.json | Remove 58 already-broken commands; retain available tests and add production/infrastructure checks | Missing-target manifest saved; retained commands exercised |
| P2 | Unused Google Secret Manager SDK remained installed | package.json, package-lock.json | Remove unreferenced SDK and 49 installed transitive packages; retain OAuth and Azure diagnostics | Repository import search; subsequent build/test checks |
| P2 | Deployment instructions required a persistent separate backend and omitted operational constraints | README.md and requested docs | Replace Vercel procedure, document exact environment contract, workers, migrations, storage, troubleshooting and rollback | Commands checked against retained implementation; live release steps remain unexecuted |
| P3 | Example Google callback used the wrong backend URL | .env.example, googleOAuth.js | Document browser /auth/callback; enforce production application origin and unchanged state callback | OAuth regression tests |

File names without a directory above are under the corresponding server/src/services, server/src/config, server/src/infrastructure/redis or src service/component directory. The worktree is the concrete review artifact; no commit or PR was created.

## Infrastructure status

| Service | Verified | Not verified / release prerequisite |
| --- | --- | --- |
| Frontend | Clean npm install; Vite production and three workspace builds; route splitting remains; static asset output | Live route refresh, real homepage/content and all resident/admin flows on a Preview |
| Functions | Node 24/60-second function generated; API-first rewrites and two cron definitions in output; no listener/timer import; packaged liveness | Real Vercel routing, cold/warm concurrent requests, cache/private response behavior |
| Supabase | Project/schema read queries, temporary-table write/update/rollback, permission fix, migrations 056/057, data counts | Application driver's TCP connection, dedicated role least privilege, pool load test and restore drill |
| Azure | Existing accepted migration journal; 45 Azure metadata records; central SDK service and direct SAS implementation | Account/container/region/privacy/CORS, real upload/download/listing, signed URL expiration, object checksum/count verification |
| Redis | Marketplace integration and variable name; doubles for expiry, renewal races and fail-closed behavior | Live PING/ephemeral key/session test, TLS endpoint, memory/plan/eviction and outage recovery |
| Authentication | Existing custom auth/MFA preserved; renewal, session endpoint and cookie/UI regression coverage | Real resident/admin login, MFA, reset, OAuth, RBAC/IDOR and sessions across deployed instances |
| Email | Existing optional SMTP service and durable Redis delivery path retained | SMTP connectivity and disposable delivery; external worker |
| AI/integrations | Persisted job infrastructure retained; external worker entry point supplied | External deployment, real indexing/source rebuild/budget/circuit-breaker and failure recovery |
| Cron | Classified bearer-authenticated endpoint, durable daily idempotency and bounded attempts, private tables | Plan entitlement, CRON_SECRET, actual scheduling/delivery/retry and timeout recovery |
| Health administration | Liveness/readiness separation; restricted status and Redis connection action; fixture UX checks | Cross-instance durable health history, full provider test coverage and alert delivery |

## Testing evidence

- Baseline: clean npm ci, 127 default tests and production frontend build passed.
- After implementation: 128 default tests; 12 production/configuration/pooling/job tests; 9 Redis/session tests; ESLint; frontend/workspace builds; deployment artifact checks. Final exact command results are in the artifact logs and verification manifest.
- Isolated browser session fixture passed saved timeout behavior, active use, initial login warning timing, countdown, failed renewal/retry, keep working, logout, disabled timeout, absolute expiry and mobile layout.
- Isolated AdminSettings fixture passed provider rendering, successful/failed Redis action, CSRF header use and 1280/390-pixel layout. These are browser fixtures, not cloud integration tests.
- Vercel CLI 65.16.0 failed on Windows builder symlinks (EPERM). JavaScript CLI 50.44.0 then built the actual Vercel output. Its first application failure exposed production evaluation of local backend ports; that was fixed and the build succeeded. The function artifact was approximately 58.8 MB before the final minor source pass, below the documented standard bundle ceiling; this is not a latency/load measurement.
- The Vercel build pins Node 24.x through package engines despite the inspected dashboard's 26.x setting. It emits the expected api/index.js handler, 60-second max duration and daily cron paths.
- npm run dev stops cleanly with missing Supabase configuration; it was not a successful live startup. The local app cannot satisfy the localhost:5173 acceptance criterion until real Development credentials are supplied.
- An intermediate test run overlapped Vercel npm ci and failed because packages were temporarily absent. It was rerun after installation and passed. No such overlapping run is counted as a successful verification.
- No production migration, media or account functional test inserted persistent disposable records. Database transaction checks used a temporary table and ROLLBACK.

## Configuration and required manual actions

Initially present Vercel metadata: MY_REDIS_REDIS_URL, Supabase prefixed and legacy database variables, public Supabase browser variables, legacy CMS_SESSION_SECRET, Google OAuth tuple, B2 configuration and integration vault variables. Presence is not validation. Vercel sensitive values cannot be pulled into local runtime tests: the CLI writes placeholders.

At the last metadata check, the new APP_URL, SETTINGS_ENCRYPTION_KEY, AZURE_STORAGE_CONNECTION_STRING and CRON_SECRET names were still absent. SUPABASE_PROJECT_REF and Preview isolation configuration also require setup. The user has said they will configure values directly in Vercel. Do not paste secrets into chat. Preserve the existing settings key and session secret; replacing the former loses access to saved ciphertext.

Required next actions:

1. Complete exact-origin, existing-key, Azure, scheduler and database-ref configuration. Verify which existing aliases are retained, remove conflicts and keep only public values under VITE_.
2. Supply usable Development/test credentials securely outside Git; a Vercel sensitive placeholder cannot authenticate the local app.
3. Provision/verify an isolated Preview database/branch, Azure container and Redis state. Do not connect a Preview to the verified production ref.
4. Verify Azure resource intent, private access, CORS and storage operations. Review old B2 object counts/manifests before removing legacy code or credentials.
5. Verify Marketplace Redis TLS, plan, memory/eviction and disposable session operations.
6. Provision the explicit managed worker host and test actual jobs. No external host was created or selected without user context.
7. Check actual Vercel plan duration, region, Cron entitlements, project Git connection and release checks. The team lookup did not establish plan capacity.
8. Register the exact environment-specific Google callback and complete an actual OAuth/MFA/sign-in flow.
9. Run the feature acceptance matrix below, then approve a Preview deployment if desired. Production staging/promotion/domain assignment still require explicit approval.

## Remaining risks and acceptance matrix

| Requirement / risk | Current disposition |
| --- | --- |
| Full app reliably served at localhost:5173 | Blocked by missing usable Development infrastructure configuration |
| Production and Vercel-compatible builds | Passed locally; final run logged. No live deployment certification |
| API routes do not become SPA pages | Configuration and generated output reviewed; real deployment refresh/API test pending |
| All existing user data intact | No application record migrations/deletes performed; key counts unchanged. Full independent backup/restore still needed |
| Media remains accessible | Metadata and accepted cutover preserved; bytes and private retrieval not operationally verified |
| Distributed login/MFA/RBAC/OAuth | Regression coverage only; actual credentials/accounts/isolated deployment tests pending |
| News/events/barangays/services/Open Data/search/analytics/newsletter/AI/settings | Compilation and existing targeted regressions cover parts; complete functional matrix not executed |
| Optional outage containment | Code and isolated tests; real provider outage simulation pending |
| Background jobs reliable in production | Architecture implemented; external host/queue crash recovery not operationally verified |
| Session pool capacity | Bounded pools help, but session-mode connections can still exhaust a 60-connection database as instances scale |
| Large private resident/document uploads | Existing buffered endpoints still face Vercel payload ceilings. The new direct workflow covers CMS image uploads; larger private-file workflows need a reviewed direct-upload extension or external execution path |
| Large AI rebuilds | External worker avoids function lifetime, but memory, total cost and worst-case runtime are not load tested |
| Durable health history/alerts | Worker and scheduled-run persistence implemented; full per-service cross-instance success/failure history and alerts are not implemented |
| Legacy dependencies | B2/local compatibility and migration tooling intentionally retained; provider cutover cleanup requires verified objects and authorization |
| todos demonstration | Browser demo queries a todos table that was not present in the inspected public table list; no duplicate/demo table was created in production |
| Existing cloud exposure | Revoked grants stop this route of access. Historical unauthorized use is unknown; review logs/changes and assess key/session revocation or rotation |
| Security coverage | Not a complete exploit audit of every source/sink; SSRF, IDOR, private-file access and role workflows require further isolated validation |
| Secret history | Heuristic scan of 64 reachable commits found five fixture candidates and no confirmed real secret. It is not a guarantee; remote/unreachable/binary/untracked formats are outside scope |
| Working tree | An unrelated deletion of Start Better Getafe.cmd appeared during work and was left untouched. Generated browser baseline images were restored; new evidence was saved separately |
| Migrations pending | 056/057 are applied and journaled on the verified project. Isolated Preview schema migration remains the operator's responsibility |

The acceptance criteria are therefore **partially satisfied, with production promotion blocked**. Use the linked runbooks and recorded evidence to finish actual integration and feature verification after configuration is available.

## Evidence and runbooks

- artifacts/production-readiness/verification-results.json ? final command results and packaged-source checks.
- artifacts/production-readiness/infrastructure-evidence.json — sanitized project/schema/configuration/grant observations.
- artifacts/production-readiness/database-permissions-before.json and database-permissions-additional.json — access-control backups, without account records or credential values.
- artifacts/production-readiness/secret-scan.json — hashes and locations only.
- artifacts/production-readiness/missing-script-targets.json — commands removed because their files were already absent.
- artifacts/production-readiness/dependency-audit.json — refreshed production dependency audit.
- artifacts/production-readiness/*png — isolated browser screenshots.
- [Deployment](VERCEL_DEPLOYMENT.md), [environment variables](ENVIRONMENT_VARIABLES.md), [architecture](ARCHITECTURE.md), [database](SUPABASE_DATABASE.md), [storage](AZURE_STORAGE.md), [Redis](REDIS_CONFIGURATION.md), [migrations](DATABASE_MIGRATIONS.md), [jobs](BACKGROUND_JOBS.md), [troubleshooting](TROUBLESHOOTING.md), [security](SECURITY.md), [rollback](ROLLBACK.md).

Provider references checked during implementation: [Vercel Express](https://vercel.com/docs/frameworks/backend/express), [function limits](https://vercel.com/docs/functions/limitations), [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Vercel ingress headers](https://vercel.com/docs/headers/request-headers), [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres), [Azure JavaScript SAS](https://learn.microsoft.com/en-us/azure/storage/blobs/sas-service-create-javascript).
