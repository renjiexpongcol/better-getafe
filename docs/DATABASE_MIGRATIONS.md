# Database migration procedure

Never reset, seed or automatically migrate the production database at startup. The repository's existing migration system is `database/migrations/postgresql/*.sql` plus `public.schema_migrations`. New migration stubs were created with the Supabase CLI, then moved into this established numbered layout. Do not introduce a competing migration directory.

Before applying a migration:

1. Verify the existing target project, database and role. Check the migration journal against the working tree.
2. Capture schema/grants and an appropriate managed backup or logical backup. Test restore separately for any data-changing/destructive operation.
3. Review locks, data changes, runtime compatibility and rollback. Test in an isolated branch/database first. An access-control-only change can additionally be tested within a transaction that is rolled back.
4. Obtain explicit approval before any destructive change. Do not infer approval for drops, truncation or overwriting records.
5. Use the exact direct or Session pooler connection in `DIRECT_DATABASE_URL`; migration locks require session semantics.
6. Run `npm run db:migrate` to inspect, then `npm run db:migrate -- --apply --confirm-ref YOUR_PROJECT_REFERENCE --allow-reviewed-migrations` intentionally from a trusted host for reviewed pending changes to an existing database. The runner acquires the shared application migration freeze lock exclusively, runs each unapplied SQL file in a transaction and journals the file only after success. `migrate:postgres` delegates to this same operator engine.
7. Verify schema readiness, privileges, data counts and an application request before release.

On 2026-11-27, migration 056 was tested with BEGIN/ROLLBACK, then applied through the connected Supabase migration tool. It enables RLS and revokes application-table, sequence, function and view grants from browser roles. It preserves the explicit `portal_api.categories` grant and does not delete records or existing policies. The prior table grants, RLS states and additional ACL/default metadata are in `artifacts/production-readiness/database-permissions-*.json`.

Migration 057 adds private scheduled-run and managed-worker-heartbeat tables and indexes, with RLS and no browser grants. It was applied without altering application records. Both filenames were recorded in the existing application journal, so running the repository migrator will not reapply them. Supabase also records its own tool migration history.

Do not automatically roll back 056: restoring broad anonymous grants would reopen the security exposure. If a legitimate public client needs data, create a reviewed, field-limited projection rather than restoring account access. The existing public categories view intentionally uses owner execution over a fixed three-column projection; broad public backing-table grants are unnecessary.

Default privileges are repaired for the executing migration owner (`postgres`). Other privileged database owners can still create new grants; enforce the same standard in future migrations and rerun the security advisors. The replacement installation now uses a tested restricted runtime role; see [DATABASE_RECOVERY_REPORT.md](DATABASE_RECOVERY_REPORT.md). Migration 058 adds durable installation identity, signed maintenance journals and first-admin setup control. The separate migration credential remains operator-only.

