# Supabase PostgreSQL

Production project: `LGU GETAFE`, ref `wrgbfwexraarwxpoqzpv`, region `ap-southeast-2`. The connected management API reported healthy PostgreSQL 17.11. The schema initially had 142 public tables, 13 with RLS, and broad anonymous grants including users, resident accounts, auth state, roles and system settings. Migration 056 enabled RLS and revoked browser access to backing records without changing their contents. The explicit public categories view remains available.

The API continues to implement authentication and permissions with its own accounts and Redis sessions. Creating generic `auth.uid()` policies would not represent those identities. RLS with no browser policies is intentional for these tables. The existing server database role must have the intended direct SQL privileges; use a dedicated least-privileged role in a tested follow-up before replacing the current owner credential. Neither Supabase API secret keys nor PostgreSQL URLs belong in browser variables.

Runtime URL precedence: `DATABASE_URL`, `MY_PREFIX_POSTGRES_URL_NON_POOLING`, `CMS_SUPABASE_DATABASE_URL`, `SUPABASE_DATABASE_URL`. The exact chosen variable is exposed in restricted diagnostics without its secret value. Vercel requires the Supabase Session pooler on port 5432 and a matching `SUPABASE_PROJECT_REF`. Session advisory locks currently rule out transaction pooling. Node-postgres uses parameterized, unnamed queries; named prepared statements are not introduced.

The shared per-instance pool has max 2, a 5-second connection wait, 10-second query timeout and 10-second idle expiry. Resource leases prevent a settings refresh from closing pools in use by other categories. Optional legacy B2 media-write gates can use two additional connections. No individual query creates a new pool. Vercel connections verify TLS certificates; supply a valid Supabase root CA through the existing supported `getafe_root_ca` URL parameter when required. Do not disable verification to solve certificate failures.

Migration connections use `DIRECT_DATABASE_URL`, otherwise the selected existing server URL, and must support session locks. Run migrations intentionally through `npm run migrate:postgres`. See [migrations](DATABASE_MIGRATIONS.md).

Management-API queries confirmed read access, temporary-table writes and rollback. They do not prove that the deployed Node driver has connected successfully. A successful application TCP connection, pool saturation test, role audit, backup restore and isolated end-to-end feature tests remain required.

Observed account/content counts before and after 056: 2 staff accounts, 8 resident accounts, 45 media records, 5 news records. Database size was about 23 MB; server `max_connections` was 60. Do not reset or seed this database. The migration journal was aligned with all repository migrations through 055 before this work; 056 and 057 were subsequently applied through the connected migration tool and recorded in the application's journal.

