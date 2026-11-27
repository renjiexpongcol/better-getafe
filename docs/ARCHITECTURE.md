# Runtime architecture

The public, resident and administrative interfaces share the existing React 19 + Vite application. Route modules are already lazy loaded. Production assets are built into `dist/`; Vercel serves assets and the SPA. API rewrites precede the frontend fallback in `vercel.json`.

`api/index.js` is the Node function entry point. It responds to liveness without importing infrastructure, coalesces application loading, and returns redacted 503 responses for invalid configuration. It imports the Express application exported by `server/index.js`. `ensureApplicationReady()` coalesces initial service activation and refreshes cached dependency state during requests, without a timer. A failed initial activation has a 15-second cooldown. Runtime settings refresh at most once every 30 seconds.

`server.js` remains the local bootstrap and schema preflight. It explicitly calls `startServer()`. `npm run dev` uses the existing bounded development runner, exposes the unified application at http://localhost:5173, and starts local workers only after readiness. Production never invokes that runner.

Supabase PostgreSQL is authoritative for accounts, roles, content, metadata, settings, audit records and persistent jobs. Existing authentication is retained; no migration to Supabase Auth was made. Anonymous Supabase roles have no access to application backing tables. The explicit `portal_api.categories` projection remains public. Redis is authoritative for production session validation, renewal and revocation; security-sensitive requests fail closed on outages. Short-lived verification state remains transactionally authoritative in PostgreSQL with a Redis mirror, preserving existing consume-once behavior.

Azure private Blob Storage contains media bytes; Supabase retains stable IDs, captions, alternative text and references. A previously accepted cutover journal forces Azure selection and prevents silent B2 fallback. Upload grants create a random key, return an HTTPS create-only SAS, and finalize after authenticated ownership, metadata, image signature and checksum checks. The browser sends bytes directly to Azure.

Settings, CMS and resident database resources share a bounded pool within each Vercel instance. The application uses session advisory locks, so runtime connections currently require Supabase's session pooler on 5432. Transaction pooling is deliberately rejected. The main shared pool allows two connections; legacy B2 write gates can additionally allocate a separate two-connection pool. Capacity testing against the observed database maximum of 60 connections remains a release prerequisite.

Vercel Cron executes authenticated, bounded PSGC and orphan-cleanup jobs. An external persistent Node worker executes email, outboxes, integration jobs and AI rebuilds. See [background jobs](BACKGROUND_JOBS.md). No application interval or listener runs when the Express module is imported in function mode.

Optional Redis, storage and SMTP failures degrade affected features while public database-backed routes can remain available. Database/configuration failures stop readiness. Liveness remains independent. Detailed service checks require existing administrator permissions.

Region `syd1` is selected because the verified Supabase project is in `ap-southeast-2`. Azure's requested Malaysia West region and actual account configuration still require Azure-side verification.

