# Dependencies and installation

This is one private npm workspace repository with one authoritative root `package-lock.json`. The active backend lives in `server/` and is owned by the root `package.json`; `services/api` is a documented future extraction boundary, not a separate installable backend. Do not install a second driver tree there. The three app workspaces build shared root source; shared packages declare exports and peer dependencies.

Use Node.js 24.x and npm 11.x. `.nvmrc`, `.node-version`, root engines, CI and Vercel project settings agree on Node 24; `packageManager` records npm 11.21.0. `.npmrc` rejects unsupported engines. Current local verification uses Node 24.14.1. The dashboard was corrected from 26.x to 24.x on 2026-11-27. See [the build repair report](VERCEL_BUILD_REPAIR.md) for the successful uncached Linux Preview build.

## Development

From the repository root:

```powershell
npm ci
npm ls pg
npm run audit:dependencies
npm run check:runtime
Copy-Item .env.example .env.development.local
# Populate the local file securely with the intended cloud configuration.
npm run dev
```

Copy the example only when the local file does not already exist. Preserve existing secrets and settings-encryption keys. `pg` is already a production dependency; do not repeatedly run `npm install pg` to recover a damaged installed tree. `npm ci` verifies the lockfile and recreates the full intended tree. Stop installs/build installers before starting tests or development: npm removes `node_modules` during a clean install.

The development runner checks runtime and build-tool resolution using only Node built-ins before importing Supabase setup. A missing driver or incomplete installation produces one `[Dependencies]` corrective message and exits before workers or restart scheduling. `server.js` has the corresponding production preflight. A root postinstall check catches missing production entry points after installation. No check silently installs packages or changes infrastructure.

When packages resolve but startup reports missing Supabase configuration, dependency installation is no longer the blocker. Supply the intended existing Supabase connection, managed Redis URL, Azure credentials and existing settings encryption key in the local environment. Vercel sensitive variables pull as placeholders and are not usable local credentials. See [environment variables](ENVIRONMENT_VARIABLES.md). Do not substitute local PostgreSQL/Redis or bypass authentication/readiness.

## Production dependency verification

```powershell
npm run verify:production-install
```

This copies a source snapshot without environment files into an OS temporary directory outside the repository, runs `npm ci --omit=dev`, validates the dependency tree, and imports the real production API without network requests or credentials. It then removes only its own temporary directory. The working `node_modules` is untouched. The smoke checks actual named ESM `pg` exports plus Azure, Redis, Express, OpenAI and SMTP factories; it throws if a permanent timer starts during function import.

Production-only installation intentionally omits Vite, lint and test tooling. It supports the Node API/worker runtime, not `npm run dev` or a new frontend build. Vercel must install build dependencies first and build before runtime packaging. CI performs the production-only check last, after every test and build that needs development packages.

## Adding dependencies

Declare a package in the manifest owning the importing file. Code under root `src`, `server`, `api` and scripts is root-owned. Declare browser/API runtime dependencies under `dependencies`; build/test-only tools belong in `devDependencies`; reusable UI host libraries may be peers with a root runtime provider. Workspace references use their existing `0.0.0` version. Do not rely on npm's automatic workspace links or another package's transitive dependencies as an implicit declaration.

Update the manifest and root lockfile together using npm. There are no independent app lockfiles. Run:

```powershell
npm run audit:dependencies
npm run check:runtime
npm test
npm run test:production
npm run lint
npm run build
npm run build:apps
npm audit --omit=dev
```

The import audit parses JS/JSX, literal dynamic imports/re-exports, CommonJS requires and CSS imports. It checks ownership, installed resolution, relative paths, Linux path casing, Node import extensions, production closure classifications, manifest/lock agreement and source files accidentally excluded by deployment rules. It reports existing cycles, multiple locked versions and deprecation metadata separately. Arbitrary code-generated imports and runtime network behavior still need focused tests.

Vercel's ignore rules must exclude `/data/`, not every directory named `data`: `src/data` contains required application modules. CI checks this because a normal local build does not simulate upload exclusions. `.env*`, root runtime uploads/data and local build/cache directories remain excluded.

Multiple versions are retained where parents require incompatible APIs, for example application Ajv 8 versus ESLint's Ajv 6, and Express cookie 0.7 versus React Router cookie 1. Do not force-dedupe major versions to reduce the count. Review the saved dependency tree and security audit before targeted upgrades.

See [the repair report](DEPENDENCY_STARTUP_REPAIR.md) for evidence, changed files, tests and remaining live-verification blockers.
