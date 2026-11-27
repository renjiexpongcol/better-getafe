# Vercel deployment runbook

Target the existing team `lgu-getafe`, project `better-getafe` (`prj_0gnvJzzefBfHs8lA5ZHW5TfiaR55`). Root directory is the repository root. The inspected project uses the Vite preset. Do not create a replacement project. Production promotion and domain changes require explicit approval.

## Prepare

1. Connect the GitHub repository to this existing Vercel project. Enable Preview builds for reviewed branches. Protect the production branch and require passing CI/review before release. Check the Git connection in the dashboard; automatic deployment behavior was not changed by this work.
2. Configure the existing Supabase project `wrgbfwexraarwxpoqzpv` for Production. It is in Sydney and currently has a 60-connection server limit. Use the exact Session pooler URL from Connect, not a guessed hostname. Supply `SUPABASE_PROJECT_REF`. Runtime code validates this against the pooler username.
3. Keep the existing Marketplace Redis integration. It generates `MY_REDIS_REDIS_URL`. Require a TLS `rediss://` endpoint; remove a conflicting `REDIS_URL` alias. Verify memory capacity and eviction policy with the provider; a variable's presence is not a successful connection test.
4. Configure `APP_URL`, the existing `AUTH_SESSION_SECRET` or `CMS_SESSION_SECRET`, and the existing `SETTINGS_ENCRYPTION_KEY`. Do not generate a new encryption key for saved encrypted settings. Configure Azure credentials for `lgumedia/portal-media` and a random `CRON_SECRET` of at least 32 characters.
5. Preview must use an isolated Supabase project/branch, a separate Azure container and its own Redis namespace. The production project ref is rejected in Preview. Set `PREVIEW_DATA_ISOLATED=true` only after verifying all three. Existing integration environment metadata initially assigned the same variables to Preview and Production; isolation was not verified.
6. Register the exact `https://<approved-origin>/auth/callback` in Google Cloud. Set `GOOGLE_REDIRECT_URI`, client ID and client secret together for that environment. The browser callback sends its code to the API. Redirect origins must match `APP_URL`.
7. Apply only reviewed migrations, once, from a direct or session-mode connection. See [migration guidance](DATABASE_MIGRATIONS.md). Never run migrations in the Vite build or a function startup.
8. Configure Azure CORS for the approved frontend origins, PUT/GET/HEAD/OPTIONS and Content-Type/x-ms-blob-type headers. Keep the container private.
9. Provision the external worker described in [background jobs](BACKGROUND_JOBS.md). Verify its heartbeat and a disposable email/indexing job before enabling features that depend on it.

## Build and verify

`vercel.json` runs `node scripts/vercel-npm.mjs install` (which executes `npm ci`) and `node scripts/vercel-npm.mjs build` (which executes `npm run verify:deployment`, including the production Vite build). These wrappers translate the platform's unsupported npm cache-dir environment key to npm's supported cache key. Output is `dist`, with a 60-second Node function, Sydney region, static cache headers and API-first routing. Root engines, local version files, CI and Vercel project settings now use Node 24.x. Vercel's separate function-packaging install still emits its platform-injected cache-dir warning; it is recorded rather than suppressed.

Run:

```powershell
npm ci
npm test
npm run test:production
npm run test:redis
npm run test:session-timeout-ui
npm run lint
npm run verify:deployment
npm run build
vercel project inspect better-getafe --scope lgu-getafe --non-interactive
vercel build
```

CLI 65.16.0 encountered a Windows builder symlink permission failure in this environment. The JavaScript CLI fallback used for local diagnostics is recorded in the readiness report. Do not interpret a frontend build alone as deployment verification. Sensitive Vercel variables pull as placeholders and cannot supply local runtime credentials. Inject local test credentials through a secure channel outside Git.

The build repair produced an uncached Preview with a passing Linux build, but its API remains unavailable pending isolated runtime configuration. See [the build repair report](VERCEL_BUILD_REPAIR.md). Do not promote it. After isolation and required values are configured, check:

- Direct refresh of `/services`, a news detail route, `/admin` and a resident route.
- `/api/health/live` returns JSON 200 even during a dependency outage; `/api/ready` reflects required dependencies. Unknown API paths return API 404, never SPA HTML.
- Separate requests/instances can validate, renew and revoke the same disposable session; MFA and permission denial still work.
- Direct Azure upload, finalization, preview, download, expired URL recovery and orphan cleanup.
- Redis failure returns 503 for authentication while public routes remain usable.
- Cron requests without a valid bearer secret fail; repeated authorized delivery is idempotent.

## Release and rollback

For an approved release, stage a production deployment without assigning domains, verify it using production configuration and controlled disposable records, then obtain the explicit promotion approval. A Preview promoted into Production can rebuild with different values; it is not evidence that the tested artifact is unchanged. Retain the prior deployment and follow [rollback](ROLLBACK.md). Do not change production domains or automatically promote as part of verification.

Current official references: [Express functions](https://vercel.com/docs/frameworks/backend/express), [function limits](https://vercel.com/docs/functions/limitations), [cron plan constraints](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres).
