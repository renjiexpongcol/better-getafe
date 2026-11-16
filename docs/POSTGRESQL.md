# Supabase PostgreSQL

The CMS, resident portal, application settings, scheduled jobs, and integration worker share one Supabase PostgreSQL database over TLS. The Supabase REST endpoint is used separately for the optional public category integration. Keep the database URL in the backend environment or untracked local `.env` file.

Supabase PostgreSQL is the only application database. Set `CMS_SUPABASE_DATABASE_URL`; both CMS and resident services use this same connection. `SUPABASE_DATABASE_URL` remains accepted as a legacy fallback when the canonical variable is absent. Separate portal URLs and local host/user/password settings are not supported. URL-encode special characters in the password. The application never falls back to local PostgreSQL when Supabase is unreachable.

When `npm run dev` has no configured URL in an interactive local terminal, it asks for the PostgreSQL connection string from Supabase → Connect, masks the input, and runs a read-only connection check. After verification, choose whether to save it to the git-ignored backend `.env`. Saving updates only `CMS_SUPABASE_DATABASE_URL`. Choosing not to save uses the URL for that run. Production, CI, and non-interactive commands require `CMS_SUPABASE_DATABASE_URL` in the server environment and never prompt.

“Connection verified” means PostgreSQL accepted a short read-only `SELECT 1`. “Database ready” means the expected Better Getafe tables and migration journal are present. If readiness fails because schema migrations are missing, run `npm run migrate:postgres`, then `npm run dev` again. This command applies schema only. The legacy local PostgreSQL data volume is retained as a backup and is not used by the application.

```powershell
npm run migrate:postgres
npm run dev
```

For deployments, provide `CMS_SUPABASE_DATABASE_URL`, apply migrations, and restart the API and integration worker. Admin Settings shows the shared Supabase connection and separate pool health for CMS and resident services. The default Compose stack starts Redis only; it does not start PostgreSQL.
