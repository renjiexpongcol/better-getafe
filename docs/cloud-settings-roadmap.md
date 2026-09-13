# Cloud administration rollout

## Implemented increment

The existing MySQL Cloud SQL integration is retained. General application
preferences can be edited from the existing Settings screen and are persisted
alongside an audit entry. The API accepts an explicit allowlist of non-secret
keys, validates values, requires an administrator, and rejects untrusted origins.
Unknown keys, including credentials, are rejected.

Apply `database/settings.sql` to the CMS MySQL database before enabling cloud
settings writes. Apply migrations through the deployment process, not with a
runtime account that has schema administration permissions. Local development
uses the existing JSON database. SQL settings and audit inserts share a
transaction. Failed reads return environment/default values with
`available: false`; writes fail rather than claiming success.

Bootstrap variables for the new preferences: `APP_NAME`, `COMPANY_NAME`,
`PUBLIC_SITE_URL`, `APP_TIMEZONE`, `APP_LOCALE`, and `APP_CURRENCY`.
These preferences are persisted centrally; existing public page content has not
yet been converted to consume them. Infrastructure remains read-only.

## Current implementation

The Settings control plane now includes General, Database, Portal database,
Google Cloud, Storage, Authentication, Email, Security, Notifications,
Integrations, Feature Flags, Maintenance, Advanced, System Status, and Audit
History sections. Runtime configuration resolves dashboard overrides before
environment values and defaults, with a 30-second cache and immediate
in-process invalidation. Public requests receive a branded HTTP 503 maintenance
page while administrator sessions can continue to use the dashboard.

Infrastructure settings are editable by authorized administrators. Passwords,
SMTP credentials, API keys, and OAuth secrets are masked in responses and audit
logs. Production secrets use Google Secret Manager when
`SETTINGS_SECRET_PROJECT` is configured; local development uses AES-256-GCM
encrypted settings with a bootstrap `SETTINGS_ENCRYPTION_KEY`.

Database and Storage settings are validated against temporary resources before
activation. Existing pools remain active when a candidate fails, and in-flight
transactions are drained before old pools are retired. `npm run migrate` applies
the idempotent settings migrations under a database advisory lock.

## Remaining work

- PostgreSQL adapter and data migration.
- PostgreSQL adapter and data migration.
- Central configuration adoption by less frequently used modules.
- Secret Manager key rotation and operational rotation workflows.
- Cloud integration tests against staging resources.
- Granular user and role management beyond administrator permission grants.
- Notification templates and delivery queues.
- System monitoring, redacted application logs and Cloud SQL backups.
- Settings rollback with point-in-time restore.
- Comprehensive CSRF tokens for non-cookie clients and HTML sanitization.

Do not treat this increment as completion of the enterprise administration
specification. No cloud resources have been provisioned or production schema
changes applied.

## Connection lifecycle increment

Cloud SQL initialization is shared across concurrent callers, with retries after
failed initialization. CMS and portal pools support independent environment
limits: `CMS_DB_CONNECTION_LIMIT` / `PORTAL_DB_CONNECTION_LIMIT` (default 5),
`CMS_DB_QUEUE_LIMIT` / `PORTAL_DB_QUEUE_LIMIT` (default 100; 0 means unlimited),
and `CMS_DB_CONNECT_TIMEOUT_MS` / `PORTAL_DB_CONNECT_TIMEOUT_MS` (default 10000).
Invalid limits reject initialization. Limits are per process and require a
restart or redeployment; account for replica count when budgeting connections.

SIGTERM and SIGINT stop new HTTP connections, drain requests, then close pools
and connectors. Shutdown has a 25-second deadline and exits unsuccessfully if
cleanup fails or the deadline expires. PostgreSQL is not yet supported.

Validation: `node --test scripts/test-pool-lifecycle.mjs` covers concurrent
initialization, failure/retry, shutdown during startup, cleanup failure, local
mode, and limit validation using injected connection doubles. Live Cloud SQL
verification remains a deployment check.
