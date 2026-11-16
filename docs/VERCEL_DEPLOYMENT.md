# Deploying Better Getafe with Vercel and Supabase

Better Getafe's frontend is a Vite static build (`npm run build`, output in
`dist/`). Its API is a persistent Express server (`server.js`) that initializes
PostgreSQL, Redis, session handling, storage, and background workers. Vercel's
current project configuration is the Vite frontend; it does not create or run
that Express server. Adding database environment variables to the Vite project
does not deploy the API or workers.

## Vercel frontend variables

Set these for Production and Preview builds:

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Public | Supabase project URL used only by the browser client |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable key; protect exposed data with RLS |

Only variables prefixed with `VITE_` are compiled into the browser. Never set
`CMS_SUPABASE_DATABASE_URL`, a database password, or a service-role/secret key
as a `VITE_*` variable.

## Backend and database variables

Deploy the Express backend as a persistent Node service (the repository's
Dockerfile can be used by a container host) and configure these server-side:

| Variable | Purpose |
| --- | --- |
| `CMS_SUPABASE_DATABASE_URL` | Canonical PostgreSQL URL for Supabase; required by the backend and workers |
| `AUTH_SESSION_SECRET` | Session signing key |
| `SETTINGS_ENCRYPTION_KEY` | Stable key used to decrypt admin-managed integration secrets |
| `PUBLIC_SITE_URL` | Public site origin used for redirects and generated links |
| `API_CORS_ORIGINS` | Exact Vercel frontend origin when frontend and backend use separate origins |

The backend also needs the configured Redis and Azure Blob Storage values for
the enabled features. Keep the frontend and API on the same public origin using
a reverse proxy when possible; API calls and session cookies are same-origin.
If separate origins are used, configure exact CORS origins and cookie/security
settings deliberately before enabling login.

`SUPABASE_DATABASE_URL` is still accepted as a legacy backend fallback, but
`CMS_SUPABASE_DATABASE_URL` takes precedence and is the only name used in new
deployments. CMS and resident database pools share this one Supabase database.

Apply the PostgreSQL migrations with `npm run migrate:postgres` before sending
traffic. The backend checks Better Getafe schema readiness and fails closed if
the Supabase connection or schema is unavailable. It never falls back to local
PostgreSQL.

After changing Vercel environment variables, redeploy the frontend. Deploy and
restart the persistent backend separately. Do not deploy the frontend as a
working portal until `/api` is routed to that backend and its readiness endpoint
reports ready.
