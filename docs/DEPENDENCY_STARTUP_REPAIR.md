# Dependency and startup investigation

Follow-up: [Vercel build repair](VERCEL_BUILD_REPAIR.md) records the subsequent Node dashboard correction, successful Linux Preview build and remaining runtime blockers. Statements below describe the earlier dependency repair checkpoint.

## Findings before changes

On 2026-11-27, the exact `server/src/config/supabaseSetup.js` import succeeded on Node 24.14.1. `npm ls pg` found `pg@8.23.1` at the repository root. Both the root manifest and the authoritative npm v3 lockfile already declare it as a production dependency. There is no package manifest under `server/`; the root package owns that source. Named ESM imports of `Client` and `Pool` work with this installed version.

The earlier work captured the same missing-`pg` exception while a Vercel build ran `npm ci` concurrently with tests in this working directory. `npm ci` removes the existing installed tree before reinstalling it. That overlapping operation is a confirmed way this session produced the failure; adding a second declaration or changing drivers would not fix it. The user's particular failed invocation has no retained timestamp/install log proving whether it happened during that same window. An interrupted/incomplete installation is also consistent with that symptom.

The current `npm run dev` reaches a separate, actionable Supabase configuration failure. No local environment file contains usable database/Redis/Azure configuration; the only root environment file is `.env.example`. This is not a missing-module error. Cloud credentials must not be invented, replaced with local infrastructure, or treated as successfully verified.

The repository uses one root npm workspace installation and one `package-lock.json`. Workspace manifests and all source imports are being audited for undeclared ownership, hoisting assumptions and development-only dependencies reachable in production. Findings, changes and final verification will be recorded below.

## Confirmed additional failures

The source audit initially found **17 undeclared import uses**. The root consumed `@getafe/auth-client`, `@getafe/design-system` and `@getafe/ui` through automatic workspace links without declaring dependencies. Each app's Vite config also consumed `vite` and `@vitejs/plugin-react` without declaring its build tools. These worked with a hoisted root install but were incomplete ownership contracts. The corresponding manifests and root lockfile now declare them explicitly; no replacement PostgreSQL driver was introduced.

The audit also identified a CLI/runtime cycle: `scripts/migrate-b2-to-azure.mjs` exported the copy engine consumed by `mediaMigration.js`, while its CLI dynamically imported that service. The unchanged copy engine now lives in `server/src/services/azureMediaCopy.js`. The CLI imports/re-exports it for compatibility, and the runtime imports the service directly. Dry-run collision/missing-object and collision-safe copy/checksum/metadata tests pass without using cloud storage.

A read-only inspection of existing failed Vercel deployment `dpl_FvuH9d5KjdyeptX3J2ouNVbppSo5` found unresolved imports of `src/data/serviceApplication` and other application data modules. The earlier `.vercelignore` used an unanchored `data` rule, excluding `src/data` during upload. A local build did not simulate that exclusion. The failure was reproduced using the ignore rules before changing them. The rules now exclude only `/data/`, `/uploads/` and other intended root runtime directories. Required source remains included and environment files remain excluded. The audit checks all inspected modules and resolved relative imports for deployment exclusion, Linux case spelling and Node extensions.

## Changes

| Area | Files and correction |
| --- | --- |
| Production driver | `pg@8.23.1` retained in root production dependencies and lockfile; actual named ESM `Client`/`Pool` imports verified |
| Workspace ownership | `package.json`, `apps/admin-portal/package.json`, `apps/public-web/package.json`, `apps/resident-app/package.json`, `package-lock.json` |
| Early dependency diagnostics | New dependency-free `scripts/dependency-preflight.mjs`; `scripts/dev-runner.mjs` and `server.js` check resolution before importing PostgreSQL modules and catch missing-module failures once, without worker/restart scheduling |
| Installation integrity | Root postinstall invokes `scripts/check-runtime-dependencies.mjs`; no automatic repair/install is attempted during startup |
| Runtime compatibility | Node `24.x`, npm `11.x`, `packageManager: npm@11.21.0`, `.nvmrc`, `.node-version`, `.npmrc` engine enforcement; CI reads `.nvmrc` |
| Source/dependency validation | New `scripts/audit-dependencies.mjs` validates all JS/JSX/CSS source import declarations, resolution, production classifications, path casing, extensions, lock agreement and deployment inclusion |
| Production-only proof | New `scripts/smoke-runtime.mjs`, `scripts/verify-production-install.mjs`; the latter installs outside the repository and removes only its own checked temporary directory |
| Import cycle | New `server/src/services/azureMediaCopy.js`; refactored `scripts/migrate-b2-to-azure.mjs` and `server/src/services/mediaMigration.js` |
| Deployment failure | Root-anchored `.vercelignore` exclusions; regression check preserves source while protecting secrets/runtime uploads |
| Tests | `scripts/test-dependency-preflight.mjs`, `scripts/test-media-copy-engine.mjs`; development lifecycle fixture updated for the preflight module |
| CI | `.github/workflows/portal-verification.yml`: dependency audit, runtime smoke, production security audit, then production-only installation/smoke after tests and builds |
| Documentation | `docs/DEPENDENCIES.md`, this report, README and follow-up notice in the prior readiness report |

No new external runtime dependency was needed. No database schema, account, media object, authentication policy or provider was changed in this follow-up. PostgreSQL pooling and existing session/storage failure safeguards were preserved.

## Repository audit result

The final audit inspected **509 JS/JSX/CSS files across 14 workspaces** and followed **157 modules** in the production entry-point closure. It found zero undeclared imports, unresolved packages, broken relative paths, case mismatches, incompatible Node import extensions, manifest/lock mismatches or deployment-excluded inspected source files. No unresolved nonliteral dynamic imports were found in the inspected ASTs, and no import cycles remain.

The audit records ten package names with multiple locked versions. Inspection confirmed incompatible parent API requirements, including application Ajv 8 versus ESLint Ajv 6, Express cookie 0.7 versus React Router cookie 1, and application ipaddr.js 2 versus proxy-addr's ipaddr.js 1. They were retained rather than forcing unsafe overrides. `npm ls --all` completed without missing/invalid peers. No deprecation marker appears in the resulting lockfile and the fresh install emitted no deprecation warning; this is not an independent guarantee against future registry deprecations. The production npm security audit reported zero vulnerabilities.

The scripts include build/lint dependencies in their own root ownership, while the actual production module graph needs no development-only package. The single lazy Vite import in `server/index.js` is restricted to the persistent local development branch; a real install without development dependencies successfully imports the entire API and exact `supabaseSetup.js` path.

## Verification performed

| Command/check | Result |
| --- | --- |
| Exact `supabaseSetup.js` ESM import before changes | Passed; confirms the reported missing driver is not currently absent |
| Inject missing `pg` at that import boundary | Reproduced the original exception before the fix; after the fix, clear `[Dependencies]` guidance and a single controlled exit |
| `npm ci` from root | Passed; 353 packages installed; postinstall runtime resolution passed |
| `npm ls pg` | `pg@8.23.1`, production root dependency; pg-pool shares the same driver |
| `npm ls --all` | Passed; no missing or invalid dependency/peer reports |
| `npm run verify:production-install` | Fresh temporary source snapshot: `npm ci --omit=dev`, production dependency tree and full API/SDK ESM import smoke passed |
| `npm run check:runtime` | Passed; no infrastructure credentials, network requests or permanent timers used |
| `npm run audit:dependencies` | Passed; zero import, ownership, lock, source-exclusion or cycle findings |
| `npm test` | 131 passed, zero failed |
| `npm run test:production` | 14 passed, zero failed, including extracted media-copy behavior |
| `npm run lint` | Passed |
| `npm run build` | Passed after clean install |
| `npm run build:apps` | All three app workspaces passed |
| `npm run deploy:artifacts` | Passed |
| Vercel-compatible build | Passed with CLI 50.44.0; output handler `api/index.js`, runtime `nodejs24.x` |
| Function driver inclusion | `pg@8.23.1` resolves inside `api/index.func/node_modules/pg`, not through the root development tree |
| Deployment exclusion regression | Failed before correction, passed afterward; `src/data` retained and local environment/runtime data excluded |
| Production security audit | Zero reported vulnerabilities |
| `npm run dev` | Driver and setup modules load; startup stops at missing local Supabase configuration, without a dependency exception or restart loop |

There is no TypeScript type-check command in this JavaScript repository; none is claimed. The exact test outcomes and sanitized audit data are in `artifacts/dependency-audit/`. Root installation, tests and Vercel install/build steps were run sequentially after the earlier overlap was diagnosed. The isolated production installation can run separately because it never replaces the working tree's dependencies.

## Node and cloud verification

Local Node 24.14.1/npm 11.21.0 passed the fresh install, ESM import smoke, tests and builds. The inspected Vercel project still lists Node 26.x in dashboard metadata; package engines select Node 24.x and the generated function confirms that runtime. The already-failed Linux deployment log shows Node 24.22.3, with failure in source inclusion rather than driver/runtime compatibility. No downgrade or system Node replacement was performed.

The existing Supabase project `wrgbfwexraarwxpoqzpv` answered a safe read-only connector query: PostgreSQL 17.11, 144 public tables, migration journal through 057, and 45 media records. This is management-connector verification, **not an application TCP/TLS connection test**. The existing database URL resolver, TLS/pooler controls and pool lease implementation were left intact and covered by existing production tests.

Azure Blob, Azure identity, native Redis, Express, OpenAI and SMTP packages loaded their expected ESM exports in the production-only install. No live Azure container operation, managed Redis PING/session operation, SMTP delivery or provider initialization with real credentials was performed. Existing isolated failure tests passed as part of the default/production suites; real infrastructure failures remain unverified.

## Remaining startup blocker and next verification

At the last filesystem check, `.env.development.local` was not present; only `.env.example` existed at the root. The user has said they will configure the local file securely. A genuine initialized portal at `http://localhost:5173` remains **unverified until that configuration is available**. Dependencies are now checked and reproducible; missing cloud credentials cannot be solved by adding more packages.

After the intended local values are configured, run `npm run dev`, wait for readiness, and verify the browser, public API, Supabase query, private Azure container and managed Redis/session flow. Use the existing project, provider and stable encryption key. Do not seed/reset the database, disable security, or use Vercel's sensitive-value placeholders as credentials. If another startup stage fails, investigate that actual diagnostic before claiming the app healthy.

No production deployment was created or retried. The existing failed deployment will not become successful from local changes alone; release of the corrected source still requires the established review and approval process.

References: [npm ci behavior](https://docs.npmjs.com/cli/v11/commands/npm-ci/), [node-postgres ESM support](https://node-postgres.com/features/esm).
