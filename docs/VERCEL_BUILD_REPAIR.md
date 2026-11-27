# Vercel build repair — 2026-11-27

The 13 missing-import errors are resolved and verified by an uncached Linux Vercel build. Preview is READY, but the application is not runtime-ready: its API returns controlled 503 responses and the resident pages display the existing connection-error screen. Production was not deployed or promoted. No database migration, reset, seed, media operation or settings-key rotation was performed during this build repair.

## Confirmed causes

The original unanchored `data` rule in `.vercelignore` excluded every directory named data, including tracked `src/data`. All six source modules are committed in `d0213e4`; their filenames, imports and implementations were already correct. They were neither generated nor missing from Git. The failure was upload filtering. The reported 2,815 removed files included ordinary ignored dependencies/artifacts; that count alone did not identify which exclusions were harmful.

`scripts/reproduce-vercel-import-errors.mjs` archives the failed commit to an isolated temporary directory and simulates that source exclusion. It captured exactly these 13 compiler errors, including ones hidden by truncated platform output:

| Importing file | Line | Unresolved import |
| --- | ---: | --- |
| src/pages/app/Erequest.jsx | 8 | ../../data/serviceApplication |
| src/pages/app/Erequests.jsx | 8 | ../../data/serviceApplication |
| src/pages/dashboard/Profile.jsx | 14 | ../../data/residentContact |
| src/pages/app/Setup.jsx | 16 | ../../data/residentContact |
| src/pages/app/Ebilling.jsx | 5 | ../../data/businessBillingWorkflow |
| src/pages/info/AboutUs.jsx | 4 | ../../data/getafe |
| src/components/ServiceDetails.jsx | 6 | ../data/serviceApplication |
| src/components/EserviceUI.jsx | 8 | ../data/serviceApplication |
| src/components/MobileVerification.jsx | 3 | ../data/residentContact |
| src/components/StaffEservices.jsx | 3 | ../data/eserviceWorkflow |
| src/components/AdminEservices.jsx | 6 | ../data/eserviceWorkflow |
| src/components/AdminEservices.jsx | 7 | ../data/serviceApplication |
| src/components/AdminEservices.jsx | 8 | ../data/businessBillingWorkflow |

No placeholder modules, feature removals, path changes or case-only renames were necessary. Tests exercise the real `normalizeMobile`, `validMobile`, `billingStatus`, `fieldProfileSource` and `publicStatus` exports and representative results.

## Corrections and safeguards

- `.vercelignore` now anchors runtime data, uploads, temporary and deployment directories to the root. It retains application source, API handlers, scripts, manifests and migrations. Environment files, dependencies, Git metadata, local build outputs, caches, coverage and artifacts remain excluded.
- `.gitignore` now excludes all `.env*` except `.env.example`; runtime upload and temporary directory rules are root-relative. It already used `/data/` correctly.
- `scripts/audit-dependencies.mjs` checks parsed static/literal dynamic imports, named/default exports, re-exports, exact filesystem capitalization, relative paths, Node extensions, declared workspace dependencies, lockfile agreement, runtime dependency classification, client/server boundaries and deployment exclusion rules. The final graph has 513 source files, 14 workspaces, 160 runtime modules, zero reported problems and zero cycles. Computed dynamic imports remain a stated limit.
- The audit uses explicitly declared development dependency `ignore@5.3.2` for ignore-file semantics. It works in Git-less uploaded sources. `scripts/audit-secrets.mjs` scans Git history plus tracked/unignored working source locally and in CI; on Vercel it explicitly reports that only uploaded source is available. It records hashes/locations, never credential values.
- `scripts/verify-deployment.mjs` combines the import audit, real production dependency imports/API registration, resident export and route contracts, backend syntax checks, VITE credential-name checks, source credential scanning, frontend compilation and injected-secret checks on browser output. `npm run verify:deployment` runs in Ubuntu GitHub Actions and in every Vercel build. `--runtime` additionally checks bootstrap configuration; compilation alone does not certify external services or authorize promotion.
- `scripts/test-production-runtime.mjs` now selects production/serverless behavior before importing application configuration, preventing workstation env files from starting a live Redis client in this contract test. The corrected suite passes and exits normally.
- `scripts/vercel-npm.mjs`, root scripts/lockfile and `vercel.json` provide the install/build wrappers. Installation still executes `npm ci`; build executes deployment verification, which invokes the existing Vite production builder. React/Vite and unified local entry `http://localhost:5173` are preserved.
- Existing dependency repairs retained: runtime `pg@8.23.1`, explicit root shared-workspace dependencies, app-local Vite tooling declarations, dependency preflight, isolated production installation smoke and extraction of the Azure copy engine to remove its service/CLI cycle. See the earlier dependency report for their provenance. Multiple transitive major versions required by different parents were retained.

## Node and npm configuration

Root engines select Node 24.x/npm 11.x, `.nvmrc` and `.node-version` select 24, `.npmrc` enforces engines, and CI reads `.nvmrc`. The backend belongs to the root manifest. The existing Vercel project `better-getafe`, team `lgu-getafe`, was updated from Node 26.x to 24.x and re-read to confirm. Local cached project metadata was also corrected. Generated function configuration explicitly specifies `nodejs24.x`.

The failed build's warning identifies an **environment** configuration named `cache-dir`. No such setting was found in repository/user npmrc, process configuration or project environment metadata. The Linux build confirms the platform injects it: both wrappers detect and translate that environment key to npm's supported `cache` setting without hiding warnings or changing registry/authentication settings. Those install/build invocations no longer warn. Vercel's subsequent independent function-packaging install still emits one warning. Its platform-owned source was not removed; full warning elimination remains unresolved and should be raised with Vercel if necessary. It does not fail the verified build.

## Actual validation results

| Check | Result |
| --- | --- |
| Clean root `npm ci` | Passed; 353 installed packages, zero reported vulnerabilities |
| `npm run lint` | Passed |
| `npm test` | 131 passed |
| `npm run test:production` | 17 passed |
| `npm run verify:deployment` | Passed on Windows and uploaded Linux source |
| `npm run build` | Passed on Windows; Vite build also passed remotely |
| `vercel build` | Passed locally using CLI 50.44.0; packaged Node 24 API function |
| Uncached remote `vercel build` | Passed on Linux, platform CLI 66.6.0; fresh install, 765 downloaded source files |
| Browser checks | Six direct resident URLs returned HTTP 200, rendered React and raised no page exceptions; all showed the API connection-error page |
| Liveness | `/api/health/live` returned JSON 200 |
| Readiness / unknown API | `/api/ready` and `/api/not-a-route` returned JSON 503, never SPA HTML |

There is no configured TypeScript type-check command. Tests passed after the test isolation correction; an earlier run was stopped because its Redis connection kept the process alive and is not counted as a pass. No dependency installation overlapped the final tests. Local CLI compatibility fallback avoids the previously observed native Windows builder symlink issue.

The remote source was uploaded from the corrected working tree based on `d0213e4`, including uncommitted repair files; it was not a clean Git checkout of a new committed revision. Root dependencies were removed/reinstalled by npm ci, and the remote build downloaded source and explicitly skipped build cache. This proves fresh Linux installation/upload filtering, but a new Git checkout cannot contain these repairs until they are committed. Nothing was committed or pushed automatically. Commit all required scripts/manifests/configuration together before relying on Git deployment or CI.

Evidence is under `artifacts/deployment-fix/`: original-13-errors.json, clean-install.log, default-tests.log, production-tests.log, lint.log, validation.json, verify-deployment.log, build.log, vercel-build.log, preview-deploy.log, linux-build.log, preview-http.json, browser-results.json and preview-browser.png. Credential scanning is heuristic and does not certify absence of every possible secret.

## Preview and remaining release requirements

[Preview](https://better-getafe-n6s31m4ne-lgu-getafe.vercel.app), deployment `dpl_5NL9kQafHPuP7i5KYWKEzGskuWgs`, is READY, source CLI, target Preview (API target null), function region Sydney. The old production deployment remains failed; it was not retried. Linux build completion is verified, production runtime acceptance is not.

Browser checks used origin-scoped short-lived Vercel OIDC authentication without disabling protection. Tested `/app/setup`, `/app/profile`, `/app/e-billing/business`, `/app/e-payment/preview-check`, `/app/e-requests`, and `/app/e-requests/preview-check`. Billing kind and record IDs are routing probes, not claims that corresponding disposable records exist. Rendering the existing 503 screen confirms bootstrap execution, not working account, billing, payment or service-request flows.

Required before runtime acceptance/promotion:

1. Finish the already requested environment configuration: correct HTTPS APP_URL, existing stable SETTINGS_ENCRYPTION_KEY, intended database/Redis URLs, Azure credentials/container settings and CRON_SECRET. Never replace saved encryption keys or use sensitive-value placeholders.
2. Verify a separate Preview database/project, Azure container and Redis namespace. Set PREVIEW_DATA_ISOLATED only after verifying isolation; the production Supabase ref is intentionally rejected in Preview. Current successful compilation does not verify Supabase/Redis/Azure connections.
3. Rebuild Preview after configuration, obtain ready=true, and test disposable resident setup/profile changes, billing/payment, requests, session renewal/revocation, production cookie attributes and media flows. These live workflows remain unverified.
4. Keep persistent workers outside Vercel Functions; provision and verify the documented external worker heartbeat. API imports do not start permanent intervals/listeners. Optional provider package imports passed; actual provider outages and credentials still need live checks.
5. Require the Linux verification check through repository protection/deployment checks before release. The workflow/build checks are implemented; organization branch protection or an external promotion approval policy was not changed. Stage and verify any separately authorized production candidate before promotion.

The existing database records, media and provider configuration must remain intact. Do not bypass the Preview guard, substitute local persistent storage, or promote the current Preview to hide the remaining 503.
