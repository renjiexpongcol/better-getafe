# Database recovery verification — 27 November 2026

The replacement installation was reconstructed from a verified empty Supabase database and now serves the portal with healthy database, Redis and private Azure dependencies. The administrator is **Renjie Pongcol, rp34374@outlook.com**. One-time password/MFA setup details are in the ignored local `data/first-administrator-setup.json`; no credential values belong in this report or Git.

The previous production database and original Azure objects were preserved. Production was not promoted or assigned a domain. Deployment credentials were added only as overrides for the existing `fix/secret-free-cloud-setup` Preview branch. The native/shared Production configuration was not replaced.

## Actual reconstruction

| Item | Verified result |
| --- | --- |
| Target Supabase project | `dddezkhdlboujgivqvgg`; initially zero public tables |
| Durable installation identity | `8a05e4ad-d12d-4959-b35f-5597e315f6b5` |
| Migration files | All 60 completed; checksums recorded |
| Public application/control tables | 147 |
| Trusted baseline catalog objects | 2,194 |
| Current objects with restricted backend RLS policies | 2,341 |
| Missing objects, drift, pending migrations, missing essential records | Zero in final validation |
| Runtime database role | Dedicated role; no public-schema CREATE, superuser, role/database creation or RLS bypass |
| Redis | TLS PING and owned SET/GET/DEL verified; keys scoped by environment and database identity |
| Preview Azure storage | Separate private installation-owned container; owned upload/read/delete probe passed |
| Initial administrator | Strong generated password, MFA/recovery codes, audited creation and duplicate-setup lock |
| Original Azure inventory | 57 unmatched blobs retained; zero fabricated/imported media relationships |

The schema manifest includes 1,219 columns, 464 constraints, 300 indexes, 16 application functions, 32 triggers, one view, eight sequences and six extensions, plus tables and grant metadata. Baseline public browser grants are limited to the existing approved projection. Additional backend policies restrict access to the runtime role. Migration numbers are historical filenames, so the highest prefix is not the file count.

## Discovery and API coverage

The generated [system inventory](../database/system-inventory.json) currently discovers **613 registered method/path handlers**, 60 migrations and 146 declared application/control tables. `schema_migrations` is also present in the actual database. The final inventory includes 556 scanned source files and 1,147 SQL candidates; discovery regenerates during deployment verification. It connects frontend API references, transitive imports, backend SQL tables, configuration keys and workers. Computed SQL/object dispatch still requires runtime evidence.

The complete route sweep made **723 requests** covering every discovered handler, including **110 authenticated administrative reads** after actual password + MFA sign-in. Results: 139 normal responses, 578 authorization/validation/missing-fixture responses, five unavailable optional-provider responses and one route-specific rate limit. There were no HTTP 500 responses, unexpected anonymous protected access or network failures in the completed sweep.

This matrix tests real authorization and input/resource boundaries using empty bodies and nonexistent IDs. It is not a claim that every successful resident, billing, payment, document or administrative mutation has been exercised. The separate normal-rate run retained the real global limiter; its high-volume rate limits were not misclassified as application failures. The loopback-only matrix harness replaced only that global limiter and used its own Redis namespace, while keeping actual MFA, CSRF, policies and SQL.

The five unavailable responses were Google OAuth (legacy/v1), article feedback requiring configured verification, and payment webhooks (legacy/v1) without a configured provider. Their 503 responses were retained; they were not rewritten as success.

## Completed checks

| Check | Evidence/result |
| --- | --- |
| Default test suite | 131 passed |
| Production/recovery unit suite | 37 passed, including 15 recovery cases |
| Live database recovery regressions | 10 passed |
| Real maintenance authorization | Invalid MFA rejected; signed request queued, operator seed completed, duplicate execution refused |
| Encrypted backup | All 147 tables, 600 rows at capture; authenticated AES-GCM archive generated in ignored local storage |
| Backup safeguards | Tampering rejected before any database query; restore into its own source refused |
| Browser checks | Actual administrator page, desktop/mobile layout, connection/schema controls and report download passed |
| Real content workflow | Draft creation, anonymous draft denial, publication, immediate public read and owned-fixture deletion passed |
| Lint and deployment verification | Passed; production frontend and complete API imports checked on Windows and remote Linux |
| Preview readiness | `ready:true`, schema healthy, both DB resources/Redis/Azure healthy; email disabled |
| Preview public responses | Homepage, liveness, public configuration, news and categories returned 200; unauthenticated admin settings returned 401 |

Live database tests exercised missing-table reconstruction, missing nullable column/index repair, preservation of edited settings/AI preferences, restoration of approved defaults, concurrent migration exclusion, changed-checksum detection, failed-migration DDL rollback, runtime-role DDL/journal denial, and repeat bootstrap preserving the administrator/identity. Destructive fixture DDL ran only inside rolled-back transactions after verifying the fixture table was empty; no populated historical table was dropped.

Detailed redacted results are in `artifacts/recovery/`, including `api-verification-isolated.json`, `live-database-tests.json`, `operations-live.json`, `ui-verification.json`, `infrastructure.json` and `preview-verification.json`. Private setup files, backup keys/archives, raw storage reconciliation and administrator screenshots remain under ignored `data/`. The Preview report records the exact tested URL and cloud browser assertions that completed; incomplete attempts are not counted as passes.

Early regression runs exposed a PostgreSQL CHECK-expression deparse difference, a bounded storage-retry expectation and contention from unbounded test subprocesses. The fixes preserve semantic drift checking and retry cooldowns; test concurrency is bounded to four. Later runs passed. No assertion or authentication guard was removed to obtain those results.

## Cloud startup diagnosis

The initial new Preview compiled but still returned 503. Redacted runtime diagnostics identified `ERR_REQUIRE_ESM`; a local run with Node's ESM require support disabled reproduced `sanitize-html` requiring the ESM-only `htmlparser2`. The documented Vercel `NODE_OPTIONS=--experimental-require-module` setting resolved startup while retaining the current sanitizer security fixes. See [Vercel's official configuration reference](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration).

A separate Redis configuration conflict was resolved with matching TLS primary/legacy URLs only on the isolated Preview branch. Native shared Production variables were retained. JSON vault keys also now round-trip literally through the ignored environment file rather than acquiring escaped quotes.

A successful content mutation test found that the negative article cache survived publication. Publishing now invalidates both the public article cache and its missing-article cache. The real draft-to-publication regression passed afterward.

The cloud browser check also detected a legacy development `NODE_ENV` override. Preview now explicitly uses production semantics, and the Vercel entry point forces production mode before loading authentication code. Secure API-scoped HttpOnly session cookies are checked in the deployed browser verification rather than inferred from local sign-in success.

## Remaining external dependencies and limits

| Dependency | Actual state / required evidence |
| --- | --- |
| Historical source database/backups | No verified source connection or native backup was supplied for transfer. Existing residents, staff history, content, applications, financial records and audit history cannot be claimed recovered. The fresh installation works independently. |
| Original encryption keys | Historical encrypted settings, MFA and integration credentials require their original keys. The recovery tool refuses unauthenticated ciphertext and unknown secret-store references. |
| Azure file ownership/relationships | 57 original blobs have no matching records in the new database. Historical metadata and authorized ownership classification are needed before importing them. No private object was published. |
| Persistent worker hosting | Worker implementation exists and the local integration worker starts with the configured vault, but an external supervised managed-worker host/heartbeat has not been provisioned for Vercel. Long-running email/integration/AI delivery is not declared operational. |
| Google OAuth | Requires valid provider configuration and exact authorized redirect origins. Password + MFA administrator sign-in is independent. |
| Email / resident verification | Email is disabled. Real SMTP/provider verification and authorized disposable delivery are needed before claiming email-dependent resident recovery/verification flows work. |
| CAPTCHA / feedback | Verification-dependent submission remains unavailable until the configured provider can verify requests. |
| Payment/billing providers | Provider authorization, callback secrets and sandbox transaction evidence remain required for real payment workflows. No financial transaction was invented or sent. |
| AI | Features remain disabled/unconfigured by default. Approved sources can queue derived rebuilds; real embeddings require an enabled provider and worker. No embeddings were fabricated. |
| PSGC refresh | Requested external Q3 2026 response contained zero valid Getafe barangays; synchronization safely retained the authoritative checked-in 24-barangay snapshot. |
| Full business-flow acceptance | The route-boundary matrix is comprehensive for registrations; it does not replace successful fixture-based acceptance of every resident/financial/document workflow. Those needing external providers remain blocked by the dependencies above. |
| Production release | Not promoted. The reported production URL has not been declared repaired merely because Preview is healthy. A separately authorized release must use the verified source and appropriate Production credentials/backups. |

Historical restore is implemented with source/target verification, dependency grouping, conflict handling, exact duplicate checks, sequence synchronization and durable progress. An actual transfer between two distinct databases has **not** been verified because the historical source is unavailable. Cross-database restoration must be rehearsed against a verified isolated source before using real historical records. Restored background work stays paused until the operator reviews and approves deliveries.

## Source and recovery operation

Implementation and generated schema/inventory artifacts belong together on the review branch. CLI Preview deployments upload the working tree, including source changes that are not yet a clean Git checkout; do not infer source completeness from a deployment's older base-commit metadata. Preserve the matching review commit, keys, backups and configuration inventory before release. No environment secrets, one-time administrator credentials or backup keys should be tracked, including in a private repository; the connected repository metadata reported public visibility during this investigation.

Use [DATABASE_RECOVERY.md](DATABASE_RECOVERY.md) for the operator commands, first-admin setup, encrypted backup/restore, signed maintenance execution, safe retries, queue approval and rollback procedure. The old production project and original media remain the rollback source; switching an application deployment does not restore historical rows or Azure relationships.
