# Enterprise Integration Hub — first implementation increment

## Delivered

The portal now includes **Administration → System → Integrations**, at `/admin/system/integrations`. The backend module is `server/src/integrationHub`; it registers explicit endpoint policies and eight granular CMS permissions. The main server never starts a hub worker automatically. Missing vault keys or an unavailable worker do not prevent the portal from starting. Missing schema/database produces a sanitized hub error; it does not silently create an in-memory replacement queue.

Three code-owned connector definitions are available:

Google Calendar is an optional outbound adapter, not an existing verified municipal dependency. Approve a concrete read-only calendar use case before authorizing it; it does not synchronize portal appointments.

| Connector | Operations and boundary |
|---|---|
| Approved external API | HTTPS bearer-key health GET only, deployment-approved hostname, public pinned IPv4, no redirects, 10 s total deadline, 1 MB streamed response bound |
| Google Calendar | Separate outbound authorization code + S256 PKCE grant; minimal calendar-list readonly scope; server token exchange/refresh/revocation; health GET requests only the `kind` field |
| Municipal events | Timestamped HMAC SHA-256 of exact request bytes; strict version 1 status event schema; durable deduplication and asynchronous canonical event processing |

Configuration uses JSON Schema 2020-12 and Ajv. Credentials are stored in a separate JSONB envelope encrypted using AES-256-GCM, a fresh 96-bit nonce, a 128-bit tag, key version, and installation/version AAD. Keys stay outside PostgreSQL and must be injected by the deployment secret store. No credential values, provider response bodies, OAuth codes, or tokens are returned in administrative reads or written to hub audit/execution records.

Configuration changes invalidate custody and cancel queued work. Google grants are revoked before replacing configuration, replacing credentials, or disconnecting. Provider revocation failure retains custody for recovery; an already-invalid token reported by Google's revoke endpoint can be removed locally. Disabling retains custody, stops new execution and cancels pending jobs. Use credential replacement or reauthorization to enable a disabled installation again.

## Deployment

1. Back up the CMS database and the current deployment secret versions. Review pending migrations in this working tree before deploying; other unfinished project changes are outside this increment.
2. Run `npm ci` and `npm run migrate:postgres` for full deployment migration. If the database is already at migration `027`, `npm run migrate:integrations` applies only `028` using the effective runtime CMS database settings, with a transaction and migration lock. Migration `028_integration_hub.sql` creates hub tables and does not migrate, copy, or activate existing provider credentials. It was tested in an isolated real PostgreSQL schema and applied to the active development CMS database after the missing-schema page failure. Run `npm run check:integrations` to verify overview availability without displaying credentials.
3. Inject `INTEGRATION_VAULT_KEYS` as a JSON object such as `{"v1":"<base64 32 random bytes>"}` and set `INTEGRATION_VAULT_VERSION=v1`. Generate keys with a cryptographically secure secret-management tool; do not reuse session or settings encryption keys. The example file intentionally contains an unusable empty keyring. Production should use orchestrator-mounted secrets or a managed secret-store injector; do not commit a populated `.env`.
4. Set `INTEGRATION_ALLOWED_HOSTS` to the exact DNS names approved for municipal partner APIs. Wildcards, literal IP addresses, non-HTTPS URLs, credentials embedded in URLs and non-443 ports are rejected. This restriction also applies to the existing legacy integration helper: an old connection now needs an explicit hostname allowlist. Standard Google endpoints are code-owned and do not require adding them to this generic list.
5. Register the dedicated Google redirect in the provider console and set `INTEGRATION_GOOGLE_REDIRECT_URI` to exactly `https://<portal-host>/api/admin/integration-hub/oauth/callback`. This grant is distinct from resident sign-in. The callback requires the same authorized CMS account that initiated it. If the account session expires, sign in and start authorization again. No OIDC identity token is consumed by this connector, so an OIDC nonce is not required; existing Google identity login remains separate.
6. Build the frontend with `npm run build`. In production, launch the server normally and launch `npm run worker:integrations` under a process supervisor. In local development, `npm run dev` now starts the worker independently and restarts it after failure without stopping the frontend/API. Frontend-only mode omits the worker. Each worker processes one job at a time; use multiple worker processes for independent connectors. Per-installation concurrency is one. The worker initializes CMS configuration/database only; it does not verify SMTP, initialize B2 storage, open the portal database, or start email delivery.
7. An optional Docker overlay is supplied: `docker compose -f docker-compose.yml -f docker-compose.integrations.yml up -d --build integration-worker`. Ensure `.env` contains `CMS_SUPABASE_DATABASE_URL` and the deployment-approved secret injection configuration. The worker uses the same Supabase connection resolver as the API.
8. The protected System Administrator group gains the new permissions on authorization initialization. Delegate only the required permissions through existing access management. Connector administration is municipality-wide; department assignment does not independently grant access. No resident identity can administer connectors.
9. Configure a connector, store credentials, authorize Google if applicable, and queue **Test connection**. Refresh after completion. Saving settings or obtaining an OAuth token shows **configured**, never **connected**. A successful health execution or verified processed municipal event is required for connected status. A signed webhook connector cannot be tested by issuing a fabricated local success result.

The worker writes a database heartbeat on polling. The Admin screen reports availability if the heartbeat is newer than 30 seconds. Watch this signal as well as the main portal's existing readiness probes. There is no public worker HTTP port. SIGINT/SIGTERM abort outstanding transport and drain the transaction before closing resources. A process supervisor should allow at least 40 seconds to shut down and restart failed workers.

The active development environment now has a locally generated vault key in its ignored `.env` and a running background worker. The local key is not a production secret-store deployment. Keep it secure and backed up alongside the development database; never commit it. The manually started worker PID and logs are under ignored `data/integration-worker.*`. Future normal local launches supervise a worker automatically.

## Queue, resilience and cost controls

Jobs and installation changes use PostgreSQL transactions. Unique installation/idempotency keys prevent duplicate enqueues. Claims use a short advisory lock, installation row locks with `SKIP LOCKED`, and fenced 60-second leases. Installation row locks serialize execution, credential refresh, rotation and disconnect; another installation remains claimable by another worker. Expired leases recover after worker loss. A stale worker cannot commit a replaced lease.

Only code-owned, idempotent read checks and immutable event processing are enqueued. Attempts are bounded at four; retryable network/timeouts/429/5xx failures receive exponential delay and jitter. Authentication, schema and ordinary 4xx failures go directly to dead-letter status. After three failures, a circuit opens for 60 seconds. Connector execution spaces requests at least one second apart. Retry actions require a separate permission and only accept transient dead letters at the current configuration revision. No non-idempotent payment or message-send operation is automatically added to this queue.

`dailyRequestLimit` defaults to 1,000 execution attempts per rolling 24 hours. Reaching the limit postpones work one hour without consuming another attempt. `failureAlertPercent` defaults to 50%; the overview warns when at least five attempts cross the threshold, when measured executions approach 80% of the local budget, and when the connector is degraded/failed. Alerts are visible on refresh; no external notification destination is assumed. Measurements include successful/failed executions, latency, retries, timeouts, rate-limit responses, response bytes and last success. These are execution measurements, not provider billing or provider-reported quota. OAuth control-plane requests and preexisting clients are not included in hub attempt totals yet.

## Webhook partner contract

Send `POST /api/integrations/webhooks/municipal-events` with `Content-Type: application/json`, `X-Integration-Timestamp` (10-digit Unix seconds), and `X-Integration-Signature` (hex HMAC-SHA256 over `<timestamp>.<exact body bytes>`). The shared signing secret must be at least 32 characters. The timestamp must be within five minutes. The JSON body is limited to 64 KB before parsing, and contains exactly:

```json
{
  "id": "opaque-external-event-id",
  "type": "record.status.changed",
  "version": 1,
  "timestamp": "2026-10-09T01:00:00Z",
  "externalRecordId": "opaque-record-reference",
  "status": "completed"
}
```

Allowed statuses are `pending`, `completed`, and `failed`. Valid requests receive 202 after the event and job commit. Exact duplicates are accepted without another job; a reused event ID with different bytes returns conflict. Renew the delivery timestamp/signature for retries without changing event-body bytes. Browser CSRF is not webhook authentication. The strict canonical envelope converts dates to UTC and contains no resident profile fields. Processing records each event independently, so out-of-order delivery cannot overwrite an application record. A future domain adapter must define record ownership, ordering and transition rules before mutating resident/request/payment records. This first adapter validates and records partner events; it does not claim to synchronize municipal records.

## Recovery and rotation

* Provider authentication failure: disable or leave failed, correct/reauthorize custody, then test. Authentication failures are not repeatedly retried. Review the execution/audit history without exporting secrets.
* Provider outage: main portal stays available; queued retries and circuit state persist. Other workers can process unrelated installations. Restore the provider and wait for due work or explicitly retry an eligible dead letter.
* Worker outage: restart supervised workers. Lease fencing handles abandoned jobs. Do not edit lease ownership by hand in production.
* Vault rotation: inject old and new keys into the keyring; make the new version active everywhere; run `npm run integrations:rotate-vault`. This atomically re-encrypts installation custody and pending authorization verifiers and writes metadata-only audit events. Keep old keys for the full backup retention/recovery period. Do not delete an old key while any retained backup needs it.
* Backup/restore: back up hub tables with CMS PostgreSQL and retain the corresponding keyring in the secure secret-store backup process. Restore the database and keys together, stop workers during restore, verify readiness, and test one connector before resuming workers. Restored terminal job history prevents re-enqueueing the same idempotency keys.
* Retention: worker maintenance runs hourly. `INTEGRATION_HISTORY_RETENTION_DAYS` defaults to 90, bounded to 1–3650 days. It deletes old execution records and successful/cancelled jobs, expires processed canonical payloads, and removes expired OAuth states and stale worker heartbeats. Event IDs/digests remain for deduplication. Dead letters and administrative audits remain until the municipality approves a records-retention policy. Preserve or export operational evidence before changing that policy.

## Verification and current limits

Automated commands: `npm run test:integrations`, `npm run test:integrations-http`, `npm run test:integrations-ui`. The database/HTTP suite uses a uniquely named temporary schema and cleans it afterward; it never modifies live provider configuration. Provider transport is injected, so successful tests do not imply live Google or partner credentials. UI screenshots under `artifacts/integration-hub` use explicitly simulated fixture state.

The implementation is an incremental foundation, not completion of every phase in the master brief. Existing Google identity/OIDC, SMTP/Redis email delivery, B2, weather, public statistics, election enrichment and manual billing contracts remain in their current modules. Their credentials and traffic are not silently imported into hub governance. Service-account/JWT connectors, provider-specific quota/billing feeds, periodic sync cursors, ETag/incremental sync, external usage alerts, and business-domain webhook mutation require actual provider requirements and further adapters. There is no generic arbitrary URL/path executor, custom code installation, unapproved connector package execution, or paid iPaaS connection.

References: [JSON Schema 2020-12](https://json-schema.org/draft/2020-12), [Google server authorization and revocation](https://developers.google.com/identity/protocols/oauth2/web-server), [PostgreSQL locking](https://www.postgresql.org/docs/current/sql-select.html).
