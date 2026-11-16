# Integration Hub implementation report

Delivered 9 October 2026 as an incremental change to the existing portal. Existing workspace changes were preserved. Provider credentials were not modified. The follow-up page failure was traced to the unapplied migration `028`; it has now been applied transactionally to the active development CMS database. The overview check returns available with three catalog entries and no configured connectors.

## Changes

* Integration audit and provider inventory, including existing Redis email delivery and public statistics/election APIs.
* A backend integration module with a code-owned registry, JSON Schema 2020-12 validation, approved HTTPS transport and isolated provider operations.
* Versioned AES-256-GCM credential envelopes, write-only credential endpoints, custody rotation, server-side OAuth/PKCE, persisted single-use actor-bound state, refresh and revoke support.
* PostgreSQL jobs with transactional enqueue, unique idempotency keys, fenced leases, worker recovery, serialized installation execution, transient retries, circuit state, daily budgets and dead-letter history.
* Signed and size-bounded webhook intake with transactional event/job insertion, replay window, deduplication and versioned canonical status events.
* Admin catalog/configuration, authorization, test, disable/disconnect, history and eligible retry workflows. Status and execution metrics come from the backend; no connector is activated by installation or environment-variable detection.
* Granular backend policies/permissions, existing browser CSRF protection, role boundary, no redirects, pinned public DNS, TLS validation, streamed response limits, and safe errors.
* Additive migration `028_integration_hub.sql`, independent worker command, Docker overlay, secret environment examples, retention/key rotation and backup/recovery instructions.
* Build-versus-buy evaluation recommending the native implementation for the observed integration set, with procurement unknowns recorded.

## Verified results

| Validation | Result |
|---|---|
| Hub unit/security suite | 8 tests passed: vault metadata/tamper/rotation, private-address rejection, strict schemas, pinned transport/redirect/rate-limit/size handling, webhook signatures/replay/schema, OAuth PKCE/scopes/expiration, operation restrictions, declared permissions |
| Hub PostgreSQL/HTTP suite | Passed against real PostgreSQL with isolated schema: CMS/resident denials, browser CSRF, encrypted custody/no disclosure, atomic deduplication, lease recovery/fencing, retry exhaustion/circuit gate, permanent authentication failure, webhook rejection/deduplication/size, actor-bound/expired/consumed OAuth state, revocation, budgets, key rotation and retention |
| Hub browser workflows | Passed at 1440, 768, 390 and 320 px: configure, store secrets, test enqueue, history, hidden saved credentials, save failure/recovery, search and responsive overflow. Screenshots inspected at desktop/mobile. Fixture data is simulated. |
| Authentication, Google sign-in, routing, weather caching, runtime resilience | 30 existing regression tests passed |
| E-services, staff/department boundaries, financial/privacy workflows | 34 tests passed; existing migrations plus hub migration applied successfully in temporary schema |
| Existing six-issue/appointment regressions | 14 tests passed |
| API policy audit | Passed; 253 policy declarations inspected |
| Undefined-variable lint | Passed |
| Production frontend build | Passed |
| Production dependency security audit | No reported vulnerabilities |

The 9 hub test cases plus the 78 selected existing regressions give 87 automated test cases; the browser workflow checks and API policy audit are additional checks. Provider token/API responses are injected in tests. No successful test or screenshot is represented as proof of a connected live provider. No claim of complete app-wide regression or WCAG conformance is made.

## Activation requirements and remaining scope

The active development CMS schema is migrated, a development vault keyring is configured in the ignored environment file, and the independent worker heartbeat is available. Provider activation still requires approved API hosts, credentials and a Google callback if needed. Other environments must deploy the migration, inject their own secure keys and supervise workers. `npm run dev` now supervises the optional worker without coupling worker failure to portal shutdown. `npm run migrate:integrations` applies only the hub migration using the effective runtime CMS connection and is safe to repeat; `npm run check:integrations` checks the overview without displaying credentials. Regression coverage verifies first/repeated migration and worker restart isolation. See [operations](INTEGRATION_HUB_OPERATIONS.md) for exact steps.

This first increment does not complete every master-prompt phase. Existing identity/OIDC, weather, storage, SMTP/SMS, statistical and electoral clients have not been migrated into hub custody/traffic accounting. Google Calendar is an optional read-only adapter requiring an approved use case; it does not synchronize appointments. Municipal webhooks validate and retain events without mutating domain records. Service-account/JWT adapters, actual provider quotas/billing, external alert delivery, sync cursors, incremental/conditional synchronization and municipality-specific data transformations remain to be implemented against real provider contracts. No payment connector or paid iPaaS was enabled.

References: [audit](INTEGRATION_ARCHITECTURE_AUDIT.md), [operations and limitations](INTEGRATION_HUB_OPERATIONS.md), [build-versus-buy](INTEGRATION_BUILD_VS_BUY.md).
