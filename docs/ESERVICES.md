# Getafe municipal e-services

## Implemented foundation

The existing public menu now routes into a shared, CMS-configurable municipal
service engine. Public service information is separate from private transactions.
The resident app supports persistent drafts, configurable forms, private document
uploads and replacements, declaration/submission, correction responses, activity,
business renewal, billing accounts and payment orders. The staff shell provides
department queues, server-side filtering/pagination, assignments, document review,
internal notes, applicant messages, information requests, configured workflow
transitions, assessments and Treasury payment verification. The CMS service
catalog provides configuration editors, duplication and publishing.

The initial seven structural services are deliberately unpublished. No legal
requirements, fees, applicants, balances, payments or official receipts were
invented. Configure and publish them before opening applications to residents.

## Data and identity architecture

PostgreSQL is authoritative. E-services tables use the existing portal connection
and pool. CMS authorization uses the existing CMS connection and policy engine.
Resident identity comes from the existing authenticated resident middleware;
staff identity comes from the existing CMS session middleware, including its
session revocation and account checks. Existing authentication/MFA, trusted proxy,
origin/CSRF, security headers, traffic protection and Redis rate limiting remain
on the route path.

Where CMS and portal use different databases, apply the project's full PostgreSQL
migration set to both. Departments remain CMS-owned. Saving service configuration
or granting department access synchronizes the canonical department ID/name into
the portal's existing departments table for relational foreign keys. Staff IDs
are references to the CMS identity store; no fictitious cross-database user FK is
created. This is explicit identity/cache synchronization, not a second identity
or permission engine.

Reused tables: `users`, `portal_users`, `departments`, `auth_groups`,
`auth_user_groups`, `auth_permissions`, `auth_group_permissions`, `auth_policies`,
`payments`, `notifications`, `notification_deliveries`, `audit_logs` and public
media infrastructure. The original `applications` API remains intact for legacy
services; new configurable transactions use normalized `service_requests`.
The app links both existing applications and new e-service requests. A legacy
application data migration is not performed automatically.

Migrations:

- `018_eservices.sql`: catalog/categories, versioned requirements/forms/fields,
  workflows/steps, fees, department membership, requests, form values, documents,
  assignments, status history, notes/actions, businesses/owners/applications,
  billing accounts/statements/items, orders/items, adaptations to existing
  payments, allocations, receipts, adjustments, idempotency and notification outbox.
- `019_eservices_snapshots.sql`: request financial/settings snapshots.
- `020_eservices_integrity.sql`: immutable financial/configuration/history records,
  audit protection and indexes.

Money uses `NUMERIC(15,2)` and integer minor units for application calculations.
UUIDs identify records; PostgreSQL sequences issue `GET-YYYY-NNNNNN` and
`PO-YYYY-NNNNNN` references. References are never authorization credentials.
Dates use `TIMESTAMPTZ`; UI dates use Asia/Manila.

## Configuration and access

Open `/admin?sysparm_object_id=service-catalog` (canonical `/admin/service-catalog`).
Configure the owning office, category, eligibility, requirements, form fields,
declaration, fees with an authorized source, workflow and publishing dates.
Application services cannot be published without a department, form, declaration
and valid workflow. New business forms require a mandatory `business_name` field;
supported reusable business keys are `trade_name`, `ownership_type` and the
address field `business_address`.

Each save creates a new configuration revision. Existing requests retain their
original form, requirements, workflow, fees, declaration and financial settings.
The workflow editor uses ordered statuses and explicit allowed next steps;
there is no BPMN engine. Conditional form visibility uses a field equality rule;
validation supports required values, length limits, typed values, enumerated
options and numeric ranges. Arbitrary server regular expressions are rejected.
File uploads are configured as document requirements rather than form-value fields.

Grant department membership in the service catalog and appropriate permissions in
the existing Access Management UI. Department membership alone does not grant a
permission; a permission alone does not grant department access. Existing staff
groups are not silently granted the new financial permissions. The protected
System Administrator group receives new catalog permissions through the existing
authorization seeding mechanism. Administrators can use the CMS; processing staff
use the staff shell with their configured groups and department membership.

New permissions:

`services.catalog.view/manage`, `requests.department.view/assign/process/approve`,
`assessments.view/create/adjust`, `payments.view/verify/reverse`,
`billing.business.view`, `billing.realty.view`, `billing.water.view`,
`billing.manage`, `eservices.admin`.

Resident ownership is enforced with the resident session and SQL ownership checks.
Public IDs, submitted user IDs, client totals and client payment statuses do not
grant access or change financial state. Existing resident middleware gates all
resident endpoints. Financial and workflow permission checks also evaluate the
existing policy engine against the resource.

Canonical routes and aliases:

- Service: `/services/e-services/:slug`.
- Resident: `/app/e-requests`, `/app/e-requests/:id`, `/app/e-billing/:kind`,
  `/app/e-payment/:id`; `/app?sysparm_object_id=my-requests` redirects correctly.
- Staff: `/app/staff/e-requests`, `/app/staff/e-requests/:id`;
  `/app/staff?sysparm_object_id=requests` redirects correctly.
- CMS: `/admin/service-catalog`;
  `/admin?sysparm_object_id=service-catalog` redirects correctly.

## APIs

Public: `GET /api/services`, `GET /api/services/:slug`.

Resident:

- `POST/GET /api/requests`, `GET /api/requests/:id`.
- `PATCH /api/requests/:id/draft`.
- `POST /api/requests/:id/submit`, `/respond`, `/documents`.
- `GET /api/requests/:id/documents/:documentId`.
- `GET /api/businesses`, `/api/billing/accounts`,
  `/api/billing/accounts/:id/statements`.
- `GET /api/payment-orders`, `/api/payment-orders/:id`.
- `POST /api/payment-orders/:id/checkout` safely reports unavailable online payment.

Staff endpoints use `/api/staff/eservices` to avoid collision with the existing
legacy staff application API:

- `GET /requests`, `/requests/:id`, `/options`, `/report`.
- `POST /requests/:id/assign`, `/status`, `/request-information`, `/notes`,
  `/documents`, `/assessment`, `/approve`.
- `GET /requests/:id/documents/:documentId`, `/payment-orders/:id`.
- `POST /payment-orders/:id/confirm`, `/payments/:id/reverse`.
- `POST /billing` for authorized municipal-source statement entry, including
  an account owner, department, source reference and line items. Financial totals
  are recomputed server-side. Business account ownership is checked.

CMS:

- `GET/POST /api/admin/services`, `GET/PUT /api/admin/services/:id`,
  `GET /api/admin/services/options`.
- `GET/POST /api/admin/service-categories`.
- `GET/POST /api/admin/eservices/department-members`,
  `POST /api/admin/eservices/department-members/revoke`.
- `GET /api/admin/eservices/audit?page=1` (requires both audit access and e-services
  administration). Configuration entities are saved together through the service
  editor, rather than through separate, conflicting requirement/fee APIs.

Mutating operations require an `Idempotency-Key` (8–100 safe characters) where
specified by the engine. Draft/status updates supply the current request version.
Private uploads supply `X-Requirement-Id`, `X-Request-Version`, URL-encoded
`X-Filename`, and `X-Replaces-Id` when replacing a current document. The body is
raw PDF/PNG/JPEG, limited to 10 MB; server validation checks signatures and SHA-256.
No browser-provided storage path is accepted. Random private object keys use the
existing citizen storage adapter, never public Media Library records. Downloads
require ownership/department permission and use attachment disposition.

E-service object writes also verify the Backblaze bucket ACL and reject public or
shared ACLs. Random keys do not replace bucket privacy; Backblaze ACLs operate at
bucket level ([provider documentation](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api)).
Run `node scripts/check-eservices-storage.mjs` to check the configured private
bucket without uploading any documents. A public media bucket must be replaced
with a private bucket, or the existing storage adapter extended with a separate
private bucket, before enabling confidential uploads. No bucket ACL is changed
automatically.

## Workflow and financial integrity

Transactions encompass state, history, audit, notifications, financial orders and
items. Row locks and optimistic versions prevent silent concurrent overwrites.
PostgreSQL advisory locks serialize matching operation keys; committed responses
are stored durably with a payload hash. Conflicting reuse returns a conflict.

Assessment uses fees from the request's original revision. It creates the order,
items and awaiting-payment transition atomically. Only verified provider events
or authorized Treasury staff can confirm payment. Partial payments are supported;
overpayment is rejected. Approval/release/completion require verified payment
when configured and acceptance of all current required documents.

`POST /api/staff/eservices/requests/:id/adjust-assessment` requires
`assessments.adjust`, a current request version and a reason. It may replace an
unpaid assessment using the current authorized CMS fee schedule, cancelling and
preserving the previous order and items. Recorded payments block replacement.
Amounts are calculated from CMS fees, never accepted from the caller. Replacement,
audit and resident notification are transactional.

Manual verification defaults to a different employee from the assessor; the
municipality may configure that rule in the service editor. Financial reversals
require separate permission and a different employee from the verifier. Confirmed
payments remain immutable; reversals create separate adjustment records. Reversing
a paid request requires its configured workflow to allow `PAID → AWAITING_PAYMENT`.
Reversals after approval/release/completion are blocked pending authorized resolution.
No automatic refund to a bank or payment provider is implemented.

Receipts are metadata records. The engine creates a payment confirmation record,
not an official receipt number or legally authoritative permit. Official receipt
integration must supply the municipality's authorized numbering and document process.

`PaymentProviderRegistry` is injectable and defaults to manual payment only.
Online adapters must implement verified webhook parsing of the exact received
bytes and configure a trusted CMS verifier account with payment permission and
department membership. `/api/eservices/payment-webhooks/:provider` rejects
unconfigured providers. The timestamped HMAC helper is for providers using that
particular documented protocol; each actual adapter must implement its provider's
real signature and reconciliation contract. A test-only adapter verifies the
callback/replay boundary. No real provider is connected.

## Notifications, Redis and auditing

State changes write a PostgreSQL outbox in the same transaction. A single-flight
worker runs every 30 seconds, uses `FOR UPDATE SKIP LOCKED`, creates deduplicated
existing resident notifications and queues optional email through the existing
Redis job infrastructure and preference checks. Failed outbox events retry with
bounded exponential delay, up to an hourly interval. The request never waits for
email delivery. The existing failed-delivery retry path can atomically reclaim a
failed queue attempt for outbox delivery.

Redis continues serving sessions, OTP/security state, traffic limiting, upload
throttling and asynchronous email jobs. Authoritative workflow, billing,
idempotency and audit records remain in PostgreSQL. Correlation IDs propagate to
audit records and operational logs; bodies, tokens and document contents are not
logged. Append-only database triggers protect request history, assignment
history, review actions, financial allocations/adjustments, configuration revisions
and e-service audit entries. Internal notes are excluded from resident APIs.

## Backups and deployment

`npm run backups:up` starts the supplied local PostgreSQL backup sidecar without
recreating the existing database container. It connects through
`BACKUP_DB_HOST` (default `host.docker.internal`), takes an immediate custom-format
dump, verifies the archive listing, repeats every `BACKUP_INTERVAL_SECONDS`
(default 86400) and retains `BACKUP_RETENTION_DAYS` (default 30). Archives are stored
in the named `getafe-backups` Docker volume with restrictive file permissions.
The health check requires a recent successful archive. Adjust its freshness
threshold when changing the interval. Configure separate backup connections/jobs
for separate CMS/portal databases. Database connection pools are reused.

The sidecar was started locally, produced a verified archive, and the supplied
`scripts/eservices-restore-check.sh` successfully restored it into a newly created,
disposable database. The check refuses to replace an existing database of that
name and cleans up only the database it created.

Production deployment still needs encrypted off-site backup copies, monitored
alerts, an approved retention policy, separate private object-storage backup and
a recovery drill covering database plus objects. A Docker volume on the same
computer is not disaster recovery.

Before deployment take a backup and verify restoration. Migrations are additive
and transactional. Prefer a compatible application rollback or forward repair;
do not drop transactional tables to roll back a release. Restore a verified dump
into a new database, inspect constraints/counts, validate application behavior,
then switch the configured database connection during an authorized maintenance
window. Never restore over a running production database without an approved plan.
The PostgreSQL request/order sequences are part of the dump.

Restart/redeploy the API after code changes. The initial catalog is unpublished;
therefore a public catalog returning an empty list is expected until configuration.

## Verification and explicit boundaries

`npm run test:eservices` creates an isolated PostgreSQL schema, applies the complete
migration set, uses the real permission engine, runs database/HTTP lifecycle tests,
and removes only that schema. Coverage includes private upload/download, ownership,
idempotency, simultaneous processing, document replacement/corrections, notes,
assessment rollback, server totals, partial/full payment, separation of duties,
approval/completion, renewal, notification delivery, authorized source billing,
signed callbacks/replay and immutable reversal. Object bytes use a test-only
storage adapter; no fake documents are uploaded into municipal object storage.

`npm run test:eservices-ui` uses browser-only API/session fixtures at 1440 and 390
pixels. It exercises service → draft, sections, unavailable billing, CMS editor,
staff queue/direct links, and checks page errors/overflow. Set `UI_TEST_URL` to the
running frontend origin. These browser checks do not claim to be a full live
multi-user login/MFA/gateway integration test. Existing authentication/security
tests are run separately. Screenshots are under `artifacts/eservices`.

Completed local checks: migrations, lifecycle tests, browser checks, routing,
authentication hardening, API policy/HTTP security, Redis, lint, production build,
dependency audit, backend startup, private-storage bucket health, and backup restore.
The dependency audit found a pre-existing high-severity transitive issue; the
compatible dependency update produced zero reported vulnerabilities.

External/operational work that remains before a public rollout:

- Municipal configuration and publication of actual eligibility, requirements,
  declarations, workflow, fee schedules and appropriate staff access.
- Authorized online payment provider, merchant credentials, settlement/refund
  handling and provider reconciliation.
- Authoritative real-property and water records/import synchronization. The source
  entry API exists; no external municipal source is connected and no balances are
  fabricated.
- Official receipt/permit generation, authorized numbering and issuance processes.
- Malware scanner connection (an injectable hook exists; uploads otherwise report
  `UNSCANNED`). Private attachment downloads do not execute active content inline.
- Appointment integration for services requiring appointments; publication is
  blocked when that unsupported requirement is enabled.
- Off-site/object backups, production alert destinations and an operator-led live
  end-to-end acceptance test using approved identities and municipal data.

This is an implemented and tested transactional foundation, not a claim that those
external integrations or municipal authorization decisions have been completed.
