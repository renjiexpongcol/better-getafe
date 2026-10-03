# Business billing and employee identity

## Audit and reuse

The initial business billing page rendered catalog text and linked to a list of
payment orders. It could not create a business billing request. The existing
PostgreSQL/Express service engine already provided requests, revisioned forms,
document review, office membership, assessment orders, exact-decimal amounts,
verified payments, append-only history, notifications and group permissions.

This change connects those components. `request_business_billing` associates an
existing `service_requests` row with an existing `businesses` row and optionally
an existing statement's payment order. No second business, assessment, resident,
staff, permission, payment or receipt system is introduced.

Employee provisioning in migration 022 was already present in the working tree.
Its atomic provisioning service, EID backfill, UUID relationships, profile UI and
identity protections were preserved and verified. See `EMPLOYEE_PROFILES.md`.
New staff audit metadata includes the EID alongside the existing actor identity.

## Migration and configuration

Apply migration 023 to each configured portal/CMS database through the existing
migration runner. It adds business request links, payment submissions, durable
gateway checkout intents, human payment references, assessment periods and
charge types. Migration 021 must also be present for the existing request detail
appointment query. Existing employee/account IDs and relationships are retained.

For existing BUSINESS services without workflow steps, migration 023 creates a
new configuration revision with the billing workflow, copies existing form
fields, requirements and fees, and preserves publication, department and online
availability. It does not invent businesses, tax balances or staff access.

In Service Catalog, choose the responsible office, configure authorized charges,
payment instructions and permitted methods. Business assessments explicitly
select applicable charge codes; all amounts and credit deductions come from the
server's saved fee revision. No universal processing fee is charged on entry.
Authorized adjustments use the existing replacement-assessment flow and preserve
previous orders. Pending payments/checkouts must be reconciled first.

The Payments tab selects the service workflow and an available provider adapter.
Manual methods are Treasury, bank, e-wallet and over-the-counter payment. Staff
still verify each payment against the actual municipal/payment-provider record.
Notification templates may use `{reference}` and `{status}`. Existing configured
workflow steps and permissions express approval requirements.

## Resident and staff flow

1. Start from the catalog and select an owned business by name, owner or account.
2. A durable BILL reference is created. Review billing, complete configured
   fields/documents, and submit the transaction.
3. Retrieve an eligible unpaid statement or let authorized staff review and
   prepare an assessment in the same request. Each individual assessment is paid
   in its own transaction; duplicate attachment is prohibited by a unique key.
4. Confirm assessment review. Select an enabled payment method. Manual payment
   submissions receive a PAY reference and remain pending verification.
5. Treasury verifies the exact submitted amount/reference, or returns it with a
   correction reason. Verified payment changes the request to Paid. Record each
   Treasury-issued OR number before completing the request.
6. My Business Transactions, request activity, payment history and receipt details
   read PostgreSQL state. Reloading or changing portals does not discard it.

Existing internal statuses are retained: IN_REVIEW displays Under review,
NEEDS_INFORMATION displays Action required and AWAITING_PAYMENT displays Ready
for payment. Pending verification derives from the durable payment submission,
not an optimistic browser flag. Existing requirements must be accepted before
completion. A paid request cannot be completed without its official receipt.

The receipt viewer displays and prints the recorded receipt details. It does not
create an official municipal receipt number or render a legally prescribed
receipt document; Treasury records an already issued number.

## Payment adapter contract

No live gateway is connected by this change. Registered online adapters provide
`id`, `name`, `online`, `verifierUserId`, `checkoutHosts`, `checkout` and
`verifyWebhook`. Only connected adapters appear in the CMS provider selector.
Credentials remain in the server's integration configuration, never the catalog.

`checkout({orderId, amount, currency, idempotencyKey})` must return the same
provider checkout for retries of that durable key, with an HTTPS `url` on an
allowlisted checkout host and a unique provider `reference`. Intents are committed
before the provider call, so network failure can be retried safely. The browser
redirect never marks an assessment paid. The existing raw-body webhook verifier
validates the provider event; the engine also matches the provider and exact
checkout amount. Callback references are unique and replay is idempotent.

A pending gateway checkout blocks manual payment and assessment replacement.
Provider cancellation, expiry and settlement reconciliation must be implemented
by the selected real adapter before rollout; this change does not infer failure
or clear a pending checkout merely because a resident closed the payment page.

## Verification

`npm run test:eservices` runs database/HTTP tests in a disposable PostgreSQL
schema, including employee provisioning, billing ownership, drafts, assessment,
configured credits, review consent, duplicate submissions, separation of duties,
manual correction/verification, OR issuance, completion, existing-statement
attachment, reversal, signed gateway callbacks and replay. Gateway checkout uses
a test-only adapter; no real money is moved.

With Vite at localhost:5173, `npm run test:business-billing-ui` runs that suite
plus the real Express/PostgreSQL billing flow in Chromium at 1440 and 390 pixels.
It switches resident/processor/cashier identities, reloads saved transactions,
verifies payment, records a receipt and completes the request. Only the session
boundary and unrelated application-shell data are fixtures; billing domain API
responses come from the test database. This is not a live login/MFA/provider test.
Screenshots are saved in `artifacts/business-billing`.

Additional checks: `npm run test:employees`, `npm run test:employee-ui`,
`npm run test:auth`, `npm run test:api-security`, `npm run lint`, `npm run build`.
