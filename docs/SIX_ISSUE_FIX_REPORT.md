# Six verified defect fixes

Implemented and validated on October 6, 2026. Changes were applied on top of the existing working tree. No dependency versions, routes, permission rules, MFA checks, password policy, CSRF/origin checks, rate limits, or UI styling were changed.

## Root causes, fixes, and regression evidence

| Issue | Root cause | Fix | Targeted regression evidence |
| --- | --- | --- | --- |
| 1. Authentication token replay | Redis consumption left a live durable fallback, and cache hydration could restore it. Redis and the database could independently authorize transitions. | All reads and transitions now use the durable authority. A database transaction locks the state row and commits a null tombstone before best-effort Redis mirroring. Database failure fails closed; an uncertain commit never retries against a different store. | Isolated PostgreSQL tests cover create/consume/second consume, Redis outage and restart, module/process-restart simulation, deliberately stale Redis values, expiration, two independent module instances consuming concurrently, database unavailability, and lost commit acknowledgement. Exactly one concurrent consume succeeds. |
| 2. Resident/staff password changes | Both handlers called undefined `matches()`. | Await the existing `verifyPassword()` and the existing dummy-hash promise; retain `replacePassword()`, hashing, policy, throttling, and timestamp/session rotation. Missing resident password input gets 422. Logs contain error class rather than raw exception messages. | Both production handlers tested with PostgreSQL-backed password updates. Separate full HTTP tests exercise both account types: session authentication, correct/incorrect/missing current password, missing/weak/same new password, successful update, new-password login, old-password rejection, rotated current session, and invalidated older sessions. Injected persistence failure returns a controlled 503. |
| 3. Service editor crash | Three application-field controls were inside the document requirements loop and referenced undefined `f`. They also wrote to the wrong collection for that renderer. | Move the controls to the existing application-fields loop, preserving field metadata and separating it from document requirements. | Real browser test at 1440px and 390px renders multiple requirements and fields; adds, edits and removes requirements; changes section/profile source/read-only fields; verifies validation-error handling; saves and reopens; and saves/reopens zero requirements. No component errors. Existing requirement ordering is preserved; no requirement-reordering control previously existed. |
| 4. Broken upload records | Notification errors shared the cleanup catch with an already committed document insert, deleting the referenced object. | Shared upload persistence uses a database transaction and a per-document advisory lock. Exact retries use a deterministic existing primary key. Notifications run after commit and cannot fail the upload. Pre-commit cleanup is protected by the same lock; uncertain commit acknowledgements preserve storage. | Both real HTTP upload routes with real PostgreSQL and injected storage/notification boundaries: storage failure, database insert failure, notification failure, success, cleanup failure followed by recovery, concurrent duplicate requests, and lost commit acknowledgement followed by retry. Document rows always reference retained files; normal rollback/retry paths leave no orphans. |
| 5. Booking horizon | Slot starts were filtered only at the lower boundary; day iteration began at UTC midnight. | Enforce inclusive `earliest <= slotStart <= latest`, and begin date iteration at Manila midnight. The configuration specifies a horizon in days for booking starts; duration continues to be constrained by business closing time. | Fixed-clock tests cover both inclusive boundaries and adjacent excluded slots, midday horizon endings, midnight, UTC/Manila equivalents, year/day changes, and 15/30/60-minute durations. |
| 6. Settlement failure after saving | The insert committed before a notification error escaped, while retries generated new random IDs. | Explicit transaction/commit point; serialize duplicates using an advisory lock; use an existing unique primary key derived from resident plus normalized request or optional idempotency key; return the original submission on retry. Notifications are caught post-commit. | Real HTTP and PostgreSQL tests cover normal delivery, failed notification with successful response, retry returning the same ID/tracking number, eight concurrent duplicates producing one row, explicit-key replay/conflict, invalid keys, pre-commit database failure, and lost commit acknowledgement followed by a duplicate-safe retry. |

Baseline checks reproduced the original failures. `REGRESSION_BASELINE=1` serves/loads the original tracked production component/modules without changing workspace files. The old editor throws `ReferenceError: f is not defined`; the old backend reproduces replay and notification-induced upload/settlement failures, and both password handlers return 503. The scheduling regression also failed before the boundary fix was applied.

The immediately related resident avatar route had the same cleanup hazard: deleting the previous avatar could throw after persistence and cause deletion of the new avatar. New uploads now use distinct object keys, and previous-object cleanup is a separate logged side effect. Its regression verifies that failed old-avatar cleanup preserves the new committed avatar and success response. Application/concern and privacy-request creation already place their related rows and in-app notifications inside database transactions; those normal notification failures roll back instead of leaving a committed submission with an error response. The existing concern-upload HTTP regression still passes.

The remaining `matches()` calls are declared callback parameters in MFA recovery-code repository operations. No undefined password `matches()` call remains in the affected production paths. Redis auth-state reads and hydration can no longer authorize consumed state.

## Files changed by this task

Production/configuration:

- `server/index.js`
- `server/src/services/authState.js`
- `server/src/services/citizenRoutes.js`
- `server/src/services/staffRoutes.js`
- `server/src/services/appointmentScheduling.js`
- `server/src/services/submissionPersistence.js` (new)
- `src/components/AdminEservices.jsx`
- `package.json` (only added validation commands)
- `database/migrations/postgresql/025_authoritative_auth_state.sql` (new)

Tests/report:

- `scripts/regression-module.mjs` (new fault-injection loader)
- `scripts/test-six-issue-regressions.mjs` (new)
- `scripts/test-service-editor-regression.mjs` (new)
- `scripts/test-password-change-http.mjs` (new)
- `scripts/test-appointment-scheduling.mjs` (added boundary regression; retained existing tests)
- `scripts/auth-isolation-fixture.mjs` (optional session timestamp and verified-account fixture support)
- `docs/SIX_ISSUE_FIX_REPORT.md` (this report)
- `artifacts/six-issue-regressions/requirements-1440.png` and `requirements-390.png` (editor verification screenshots)

Other existing working-tree changes are outside this implementation.

## Validation results

| Check | Result |
| --- | --- |
| `npm run test:six-issues` | 14/14 pass, including nested backend cases and appointment tests. |
| `npm run test:password-change-http` | Resident and staff HTTP/login/session scenarios pass. |
| `npm run test:service-editor` | Desktop and mobile component/workflow scenarios pass. |
| `npm run test:eservices` | 26/26 pass against isolated PostgreSQL, covering permissions, upload privacy, concurrency, financial integrity and durable outbox. |
| Additional selected automated suites | 87/87 pass: auth hardening, Google OAuth, scheduling, private uploads, resident preferences, errors, configuration, routing, cache, admin users, employee provisioning, media paths, settings navigation, officials, request origins and runtime resilience. |
| `npm run test:auth-isolation` | HTTP auth isolation, concern attachments, scoped cookies and single-use password reset pass. |
| `npm run test:redis` | Redis/security-state/OTP/throttle tests pass. |
| `npm run test:api-security` | Pass: 73 policy entries and 205 handlers audited. |
| `npm run lint` | Pass. |
| `npm run lint:undefined` | Pass: zero undefined-variable errors in affected production code. |
| `npm run build` | Pass: production frontend built. |
| `npm audit --json` | Zero known vulnerabilities across 381 dependencies. Lockfile/dependency versions unchanged. |

Three broader checks did not pass and were not weakened or changed:

- `scripts/test-api-transport.mjs`: expects one failed GET attempt, while the unchanged transport retries reads three times. Reproduces standalone; both the test and transport have no task diff.
- `npm run test:eservices-ui`: times out waiting for the existing “Manage business information” link.
- `npm run test:business-billing-ui`: its browser scenario times out waiting for the existing “Registered business” control with the frontend running. Its database/HTTP scenarios pass. An initial attempt also lacked a running frontend; the rerun resolved that setup failure and exposed the selector failure.

These browser failures occur before the service-editor or fixed upload/settlement paths. Their UI/fixture alignment is outside the requested six-fix scope. The overall repository test status is therefore not fully green.

## Migration, API behavior, and operational limits

Migration 025 changes no schema. It invalidates outstanding legacy `challenge`, `passwordReset`, `google-oauth-state`, `mfa-login`, and `mfa-enrollment` records because the old implementation cannot establish whether their durable copies were already consumed. It preserves verification, password age, revocations and lockouts. It was exercised only in isolated test schemas, not applied to the live database. During rollout, stop old application replicas, apply the migration using the normal migration runner, then start the corrected replicas. Users with an outstanding grant must request a new code/reset or restart OAuth/MFA enrollment. Mixed old/new replicas cannot provide the new durable-authority guarantee.

Existing response shapes and routes remain. Wrong current passwords return 401; missing/invalid new password input returns 422; successful changes retain `{ ok: true }`. Uploads and settlements return 201 even when non-critical notification creation fails. Exact upload retries reuse the original document ID/status. Identical normalized settlement requests reuse the original ID/tracking number; callers can optionally provide `Idempotency-Key` for a distinct submission intent. Reusing an explicit key with different data returns 409; invalid keys return 422. Server-side primary-key constraints enforce uniqueness. Without an explicit key, identical settlement content is intentionally treated as a retry even across process restarts; a truly distinct identical submission needs a distinct key.

Database/object storage cannot form one distributed atomic transaction. Permanent storage cleanup failure may retain an unreferenced object; an ambiguous commit may retain an object until a retry or reconciliation determines whether it committed. Those cases log opaque record IDs without file names, contents, credentials or tokens. Successful committed records never have their object deleted by notification failure or uncertain commit cleanup. Tests demonstrate reconciliation through deterministic retries. Notification failures are logged, but this change does not add an automatic notification-redelivery worker. Auth tombstones increase durable state retention; expired-state maintenance must never treat Redis as an authorization source. The existing local-file auth fallback is development-only and provides single-process serialization; production requires shared durable storage.
