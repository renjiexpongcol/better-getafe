# Better Getafe Portal — startup, storage and authentication follow-up

Date: 21 November 2026 (Asia/Manila). This follow-up describes the current repair and supersedes conflicting results in the earlier audit retained below. The workspace already contained substantial uncommitted changes when this investigation began; those changes were preserved.

## Session timeout interface and policy follow-up

Implemented the reference-style settings layout in Admin Settings > Authentication and a centered inactivity warning with a dimmed backdrop, live countdown, Log out, Keep working, and a working dismiss icon. Controls adapt to mobile widths and use the existing modal focus isolation. Dismissing the warning leaves expiry unchanged; only a successful renewal records activity. Loading/error states identify the action being performed.

- Added automatic inactivity logout (enabled by default), duration presets from 5 minutes through 6 hours, preservation of existing custom durations, and a warning interval shorter than the idle duration. Disabling inactivity hides its child controls and preserves their saved values. Maximum sign-in lifetime and remembered sign-in limits remain separate and enforced.
- The server applies the toggle and returns the current policy with session/renewal responses. Passive session checks do not touch activity; expired sessions cannot be renewed. Development has a bounded local idle registry when optional Redis is unavailable; production still requires Redis. Development activity is mirrored across Redis availability changes. Existing durable revocation checks remain authoritative.
- The client clears idle deadlines when disabled, accepts a newly shortened deadline when policy changes, records successful Keep working activity, and ignores interactions with the warning/backdrop as automatic activity. Saving authentication settings refreshes the current session policy.
- Main files: src/components/SessionTimeoutSettings.jsx and .css; src/components/SessionTimeoutWarning.jsx and .css; src/components/AdminSettings.jsx; src/components/settingsPresentation.js; src/context/AuthContext.jsx; server/src/config/defaults.js; server/src/services/sessionRegistry.js; server/src/services/sessionEndpoint.js; server/index.js.
- Verification: 120 unit/regression tests passed; lint passed; frontend build passed. The isolated Chrome browser check passed settings toggle/retained duration, no warning at sign-in, countdown, dimmed backdrop, dismiss without renewal, failed renewal and retry, Keep working, mobile layout, explicit logout, disabled inactivity, inactivity expiry, and absolute expiry. It uses real UI components/AuthProvider with mocked API responses and a controlled browser clock. No live account or production data was used. Run npm run test:session-timeout-ui to repeat; Windows uses installed Chrome, or set PLAYWRIGHT_CHANNEL.
- Browser previews are artifacts/session-settings-desktop.png, session-settings-mobile.png, session-timeout-desktop.png and session-timeout-mobile.png. The page surrounding these real components is an isolated fixture. Live signed-in integration remains unverified because of the dependency connectivity limitations below.

## Current outcome

The startup/storage/session inconsistencies have code repairs and regression coverage. Live operational sign-off remains blocked by dependency connectivity and an occupied, unresponsive development port. No production records, media objects, storage credentials, environment files, migrations, deployments or running user processes were changed by this investigation. Live checks used schema/settings SELECTs, Redis PING and storage metadata requests; upload/download fixtures were isolated mocks.

## Root causes and repairs

1. **Provider selection happened twice.** Runtime configuration initialized the configured provider, and a separate migration-journal synchronizer could subsequently activate Azure. The runtime configuration could still identify B2. The settings provider now reads the cutover journal on its existing pool before runtime resources are prepared. A single storage selection module resolves the active provider; runtime activation, configuration, media operations and health reporting consume that selection.
2. **Journal state was treated as an independent runtime activation path.** It now selects the provider but cannot mark Azure connected. Azure becomes healthy only after an authenticated, bounded container-properties check confirms a private container. A failed Azure initialization becomes optional media degradation with Azure still identified as the selected provider; public/core readiness can remain available when their required services are healthy. Storage retries occur through the cached settings lifecycle, not a frontend request loop. Failed admin provider/credential changes still reject activation.
3. **Request middleware performed migration checks.** Removed the per-request synchronizer and the second startup storage initialization. Settings/journal refreshes share the existing 30-second configuration cache. Read-only storage health checks run from the single lifecycle monitor, are coalesced, and have a 60-second freshness interval. Settings edits rebuild storage only for active-provider changes; unchanged healthy resources are reused.
4. **Downloads could initialize B2 behind an Azure selection.** Removed the implicit legacy B2 client. A media record naming another provider or bucket now fails closed instead of selecting another provider. Existing objects, records and credentials are retained. This deliberately does not make unmigrated legacy objects available from Azure; an authorized, verified migration or corrected selection is needed for those records.
5. **Anonymous session probes explicitly returned 200.** The shared session endpoint now returns 401 with an empty user for missing, malformed, expired, revoked, invalid-kind, missing-account or outdated-account sessions. Valid sessions retain the existing allowlisted own-account fields and allowed permissions. Responses use no-store/private and Vary: Cookie. Database/registry failures stay 503 so the frontend preserves recovery state. Token signature and expiry checks are extracted for testing; Redis remains authoritative for idle expiry. No raw database row, password hash, MFA secret, recovery code or session token is returned.
6. **Preflight opened throwaway database connections.** The server previously verified SELECT 1 and then verified schema on a separate pool before runtime settings opened another connection. The normal configured startup path now verifies schema once on the retained settings pool. Interactive candidate URLs still use an isolated check until selected. Existing CMS/user database pools are reused unless their relevant settings change. Preflight retries remain bounded at three attempts.
7. **Readiness logs watched only the ready boolean.** The current checkout already had a single IPC-driven development supervisor rather than the historical HTTP polling loop that printed an early unreachable warning. Kept that architecture and its 180-second startup deadline. Lifecycle reports now include changes to status and provider, including degraded/recovered transitions. Public readiness distinguishes initializing, healthy, degraded and unavailable; required failures never report ready. No polling monitor was added.
8. **Background dependencies and cached PSGC data.** Preserved worker gating behind API readiness, the worker's own database/vault checks, and email work behind Redis/email readiness. Preserved the saved PSGC snapshot logic. A new regression verifies a valid 24-barangay snapshot performs only local SELECTs across repeated sync calls, with no external request or write.

## Selection contract

| Input | Meaning and precedence |
| --- | --- |
| Committed migration journal with active/accepted status | Pins Azure because stored media references already belong to that cutover. An old B2 environment value cannot restore B2. Active keeps the existing upload freeze until explicit acceptance. |
| CMS_MEDIA_PROVIDER, then STORAGE_PROVIDER | Selects the active provider when no committed cutover owns the references; retains existing environment precedence. |
| Saved storage.provider | Used when no provider environment variable overrides it. |
| Default | Existing Backblaze default is retained; it is a default selection, never an Azure failure fallback. |
| storage.configuredProvider | Existing Settings form target for editing/testing provider-specific credentials. It does not independently activate storage. |
| Provider credentials | Existing environment/database secret resolution is preserved. Inactive credentials are retained. Azure uses the configured account/container and connection string. |
| Journal read failure | Pauses storage activation; it does not guess a provider or claim healthy. A missing journal table on an older installation is tolerated only when no cutover was already observed. |

The existing verified-cutover/migration guard for activating Azure remains. No automatic copying, deletion, reference rewrite, migration acceptance or provider-setting write was introduced.

## Files changed for this follow-up

| Files | Change |
| --- | --- |
| server/src/services/storageSelection.js | Shared provider selection and fail-closed journal state. |
| server/src/config/DatabaseSettingsProvider.js, ConfigService.js | Resolve journal selection before resource preparation; preserve active selection during settings updates. |
| server/src/services/runtimeConfiguration.js, initialization.js, mediaMigration.js | One initialization path, optional degraded storage, reuse and recovery, explicit cutover compatibility. |
| server/src/services/storage.js | Verified read-only startup health, cached lifecycle checks, selected-provider reporting, no implicit B2 downloads. |
| server.js, server/src/config/supabaseSetup.js | Reuse the schema-verified settings pool and remove duplicate connection verification. |
| server/index.js, server/src/services/startupDiagnostics.js | Remove request-level journal checks, register the session handler, report lifecycle/provider changes and unavailable state. |
| server/src/services/sessionEndpoint.js, sessionToken.js | Testable session endpoint and signature/expiry validation. |
| scripts/test-session-endpoint.mjs | Missing/invalid/expired/valid/revoked/stale sessions, response allowlist, outage recovery and transport behavior. |
| scripts/test-storage-selection.mjs, test-storage-runtime.mjs | Selection precedence, Azure failure/recovery, no B2 fallback, unified operations, cached health, journal failure, migration freeze and database resource reuse. |
| scripts/test-readiness-probe.mjs, test-supabase-setup.mjs | Four readiness states and retained verified-pool coverage. |
| scripts/test-psgc-startup-cache.mjs | Cached PSGC startup behavior with no network or writes. |
| package.json | Add test:stabilization and include the new regression suites plus existing development lifecycle coverage in npm test. |
| docs/STABILIZATION_AUDIT.md | This follow-up; prior audit retained below. |

## Verification

| Check | Result |
| --- | --- |
| npm run test:stabilization | 35 passed, 0 failed. Includes actual loopback readiness servers and development supervisor process lifecycle fixtures. |
| npm test | 120 passed, 0 failed after the session timeout follow-up. |
| npm run lint | Passed with zero warnings. |
| npm run build | Passed; unified frontend bundle produced. |
| npm run dev | Stopped before starting a duplicate instance: port 5173 already in use. The existing process was not stopped. |
| GET localhost:5173/healthz, /ready, /api/auth/me and / | Requests failed with ETIMEDOUT from this workspace. The existing listener's identity and application state could not be established. |
| node server.js | Correctly stopped after three read-only Supabase/schema preflight attempts. Did not announce readiness or start workers. |
| Supabase | Configured host unreachable; live schema, saved settings, cutover journal and account verification unavailable. Retained-pool behavior passed with fixtures. |
| Redis | Read-only connection/PING attempt timed out. Live revocation/idle-session integration and queue delivery remain unverified. |
| B2 | Read-only HeadBucket failed DNS resolution with ENOTFOUND and returned degraded. No object writes. |
| Azure | Environment-only connection test stopped because no connection string was available there. Saved credentials could not be inspected because Supabase was unreachable. No conclusion that saved Azure credentials are missing or invalid. Actual connection health remains unverified. |
| Authentication | Real signature/expiry and endpoint contract covered with isolated account/registry fixtures. Frontend transport does not retry a session 401 and can still read public API responses. Existing route tests cover public/protected route behavior. A live signed-in browser session remains unverified. |

## Remaining work before operational sign-off

- Restore Supabase DNS/network access and Redis connectivity on the development host, then restart the current checkout through npm run dev on port 5173 after resolving the existing listener.
- Confirm the active selection against saved settings and the cutover journal; supply/use the existing Azure credential if Azure is selected. Do not mark it healthy until its private-container connection succeeds.
- Repeat live startup/readiness, sign-in, session expiry/revocation, Media Library browse and authorized upload/download checks. Real storage write-permission checks were not performed against production media.
- Verify browser rendering and login navigation once the real backend can become ready. Successful unit/build results do not establish live service health.

---

## Earlier stabilization audit (retained historical context)

# Better Getafe Portal stabilization audit

21 November 2026 · Working tree on `update-portal`, based on `d88f210`

## Release status

The unified website and all three independent browser surfaces build. The API registers its routes and reaches listener configuration in an isolated production startup test. A full production startup, authenticated browser session, background job, and dependency-matched installation remain unverified. The configured Supabase hostname could not be reached from this workspace. No migration, deployment, provider switch, or production write was performed.

## Architecture and verification

| Path | Runtime and dependencies | Evidence |
| --- | --- | --- |
| Public website, resident app, admin portal | React Router, Vite, shared packages. The root build serves the combined app. Three workspace builds produce independent HTML and JS bundles. | All four builds passed. Checked each independent HTML entry and its linked assets. Tested route ownership, public menus, page access decisions, settings navigation, and request-cache invalidation. Browser rendering remains unverified. |
| Local startup and preview | Windows launcher or npm → development runner → Supabase connection and schema checks → Express listener → readiness → integration worker. Development defaults to loopback port 5173. Preview serves the built files. | Tested occupied-port handling, missing production configuration, and route registration before bind. Mocked readiness covers unavailable dependencies, timeouts, malformed responses, and service identity. Two HTTP listener tests failed because the host denied loopback connections. |
| API and middleware | Express with version aliases, readiness gates, request policy, origin and session middleware, and service modules. | Enumerated 579 method/path entries including aliases and non-API endpoints. All 295 declared method/path policies have a matching static declaration. The runtime registration guard also ran. This checks coverage of declarations, not every authorization decision. |
| Accounts and CMS | CMS and resident session handlers, Google sign-in, idle and absolute deadlines, staff membership and policy approval, CMS settings and published content. | Tested session deadline calculations, Google callback normalization and PKCE, resident settings, and policy editing with isolated fixtures. Live identity-provider callbacks, sign-in, publishing, and audit persistence remain unverified. |
| Data and workers | Supabase PostgreSQL via `pg`, separate CMS and portal pool facades, 53 SQL migration files, Redis, integration worker, email jobs, PSGC refresh and analytics. | Tested connection selection, readiness with a fixture journal, and physical client reuse. Inspected integration worker readiness and dependencies. Live PostgreSQL locking, Redis recovery, job delivery, and scheduled sync remain unverified. |
| Media and public integrations | Configured storage provider, guarded media routes, Azure or legacy storage integration, Open Data upstream, public analytics. | Verified upload-path rules and mocked statistics responses, caching, and oversized response handling. Actual blob operations, CRM, analytics writes, email delivery, and public statistics upstream remain unverified. |
| Deployment | Multi-stage Node image, Nginx for the static surfaces, reverse proxy with host-based routing. Production readiness also depends on the configured services. | Compose configuration validated. Static deployment artifacts passed. Docker Desktop's Linux daemon was unavailable. Image execution, Nginx request routing, and external smoke tests remain unverified. |

## Repairs

- Reproduced accumulation of PostgreSQL query wrappers across checkouts of one physical client. Two ordinary writes acquired three shared migration locks. Each checkout now has a separate handle, performs a single acquisition per write, and rejects use after release. The migration runner now keeps its journal checks and migrations on one dedicated session under the existing migration lock.
- Packaged migration SQL and workspace dependencies in the production image. Restricted Docker build contexts. Routed uploads, RSS, sitemap and robots requests to Express and made missing static assets return HTTP 404.
- Fixed port selection from local configuration, early port-conflict reporting, Windows launcher error propagation, preview mode, readiness parsing and worker recovery. The monitor respects shutdown and backs off repeated worker restarts. A production flag mismatch could previously try to load the development Vite server.
- Kept local dotenv loading out of production database preflight. Saving a connection now replaces duplicate active settings and preserves example comments.
- Cancelled superseded dataset queries and dimension lookups. The Open Data UI now follows the provider's next offset and detects non-advancing cursors. The statistics service counts streamed bytes and bounds retained responses by total payload size and entry count. The browser request cache uses pending-request identity for invalidation.
- Removed a duplicate CMS mobile verification description. Added flat ESLint configuration covering executable JavaScript and JSX and a verification workflow for pushes and pull requests. Restored compatible route, cache, scheduling, OAuth, media-path, navigation and preference tests from repository history.

## Baseline and final checks

| Check | Result |
| --- | --- |
| Local toolchain | Node 24.14.1, npm 11.21.0. The installed toolchain differs from the root lockfile. |
| Initial tests | Five test files existed. Without the required Node module-mock flag, 26 of 30 tests passed. The named startup preflight command referenced a missing file. |
| Final `npm test` | 101 passed and 2 failed. Both failures were HTTP readiness checks. A separate minimal local HTTP server reproduced `connect EACCES` on loopback. Transport-injected checks passed. |
| Build and lint | Unified production build, three workspace builds, deployment artifact checks, lint, and undefined-identifier checks passed using installed packages. |
| Static inspection | Checked relative imports in application source, literal public asset paths, and static relative-import cycles. No unresolved active relative imports or cycles were found by this scan. Dynamic imports, computed paths and dead code need additional runtime coverage. |
| Type checking | No tracked TypeScript source, tsconfig, or project type-check script was identified. JSX was parsed by lint and Vite. |
| Dependency verification | 19 installed direct dependencies fall outside their declared ranges and Google Secret Manager is missing. A clean install in an isolated copy failed on a workspace symlink with `EPERM`. The npm advisory registry failed DNS resolution. Current advisories and a build against the exact lockfile remain open. |
| Browser and release | The local browser session could not be established. No visual accessibility, mobile layout or live authenticated workflow sign-off. The GitHub verification workflow was added locally and has no remote run result. |

## Open command inventory

The following npm commands still reference files absent from this checkout. Several have older copies in Git history. Data migration, reconciliation, and deployment commands need validation against the current database and provider configuration before release.


60 commands remain unresolved.

- auth:import:legacy
- auth:check:legacy
- content:import:legacy-barangays
- test:legacy-barangay-import
- content:import:legacy-news
- test:legacy-news-import
- test:legacy-account-import
- test:login-migration-ui
- test:login-account-selection
- migrate:integrations
- check:integrations
- test:six-issues
- test:service-editor
- test:password-change-http
- deploy:local
- deploy:staging
- deploy:production
- test:dev-server
- test:traffic
- test:eservices
- test:eservices-ui
- test:staff-assessment-ui
- test:staff-processing-ui
- test:service-details-ui
- test:business-billing-ui
- test:api-security
- test:api-security-http
- test:api-keys
- test:auth
- test:auth-isolation
- test:auth-isolation-ui
- test:startup-ui
- test:runtime-resilience
- test:dependency-recovery
- test:backend-watch
- test:mobile-profile
- test:mobile-profile-ui
- test:setup-loading-ui
- test:employees
- test:employee-ui
- test:admin-users
- cms:check
- migrate
- media:reconcile
- media:reconcile:b2
- test:config
- test:departments
- test:redis
- test:storage
- test:ui-overhaul
- test:ui-overhaul-interactions
- test:ui-review
- test:ui-review-interactions
- test:ui-review-overlays
- test:security-boundaries
- test:integrations
- test:integrations-http
- test:integrations-ui
- content:restore-footer-navigation
- test:frontend-readiness
