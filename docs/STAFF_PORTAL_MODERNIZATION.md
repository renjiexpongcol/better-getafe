# Staff portal modernization

## Audit and integration inventory

The portal has two authoritative request stores. `applications` backs the existing resident support forms; `service_requests` backs versioned department e-services. They must retain their identities, resident projections, document storage and individual workflows. No production fixtures are added.

| Module | Existing API / implementation | Consumer | Audit finding / action |
|---|---|---|---|
| Dashboard | `GET /api/staff/dashboard`, `staffRoutes.js` | `StaffSysparm` | Downloads and hydrates every legacy application; metrics exclude closed requests inconsistently; department-only staff redirected. Replace with scoped aggregates and bounded recent rows from both stores. |
| Legacy requests | `/api/staff/applications/:id`, PATCH and documents POST | `StaffRequestModal` | Real persisted workflow with history, optimistic status check, fulfillment requirements and resident notification. Add bounded list, assignment and protected downloads; retain detail/update contracts. |
| E-service requests | `/api/staff/eservices/requests`, detail and operation POSTs | `StaffEservices` | Real department membership checks, submitted-only queues, version locks, idempotency, workflow permissions, protected documents, payment verification. Reuse; validate pagination/sorting and align count policies with list scope. |
| Department assignments | `/api/staff/eservices/options`, `eservice_department_members` | `StaffRequestProcessing` | Existing department choices and staff identities. Reuse. |
| Processing | `EserviceEngine.process`, legacy PATCH | Both detail views | Preserve service steps and legally required assessment/approval/payment prerequisites. Record assignment events and private notes without resident leakage. |
| Notifications | `/api/staff/notifications`, `notificationService`, e-service outbox | `StaffUtilityPages` | Legacy notification table targets portal identities, while staff identities live in CMS. Needs staff-owned persisted inbox/read operation and assignment notifications. |
| Documents | e-service protected download; legacy upload | Request details | E-service authorization and object storage checks exist. Legacy staff cannot download supporting files from its detail view. Add equivalent authorized download. |
| Employee profile | `/api/admin/users/:id/profile`, `employeeProvisioning` | Admin employee profile | Admin contract cannot safely serve ordinary staff. Add self-only minimal profile with contact update; prohibit edits to role/EID/department. |
| Audit | Immutable request history/actions/assignments and admin e-service audit | Detail timeline / Admin | Preserve existing events; staff reads only authorized request history. |
| Search | E-service server-side query; legacy browser filtering | Both queues | Remove legacy browser filtering; validate filters and pagination, bound results, add approved sort options. |

## Architecture/security findings

- PostgreSQL migrations are versioned; startup does not create tables. CMS and portal connections can point to distinct stores. CMS staff identities must not be joined directly to portal identities.
- Permission decisions use editable groups plus resource policies. Counts and lists must apply those policies before aggregation/pagination, rather than authorizing only the page returned by SQL.
- E-service mutations lock the request, compare version and use a transaction/idempotency key. Legacy changes use a transaction and compare status but need an explicit version for same-status races.
- The route registration guard requires every new method/path to be declared in `apiEndpointPolicies.js`. Global boundary validation, origin/CSRF/session protection and rate limiting remain enabled.
- Existing durable e-service outbox separates in-app delivery from optional email/Redis availability. Preserve this pattern for staff event delivery.
- Shell routing already lazy-loads staff detail/e-service modules and suppresses public homepage APIs on authenticated pages. Staff screens should only request their active module's resources.
- The sidebar currently includes delegated system configuration under ordinary staff navigation. Keep administration in its existing authorized Admin surface; staff account/security controls must be self-service.

## Implementation and verification

Implementation is in the actual React/Express/PostgreSQL codebase. Database tests create a separate temporary PostgreSQL schema and remove it afterward. Browser screenshots show those isolated test records; the production views obtain their own authorized records from the backend.

### 1. Architectural issues addressed

The old dashboard performed an unbounded legacy read plus per-record resident/history/document hydration. It then searched and paginated the downloaded records in the browser. Department-only users were redirected away from the dashboard. Staff notifications queried resident notification identities; profile controls only existed on an administrator API. Legacy status checks could not detect simultaneous same-status notes, and legacy supporting files lacked a staff download operation.

The two existing request systems remain authoritative. Their records and workflow rules are not duplicated or migrated into a new request engine. Counts are aggregated across the authorized scope; operational queues retain their system-specific workflows and filters.

### 2. UI/UX completed

`StaffOperations.jsx` supplies a compact navy/cream dashboard, ten workload metrics, separate service/e-service queue shortcuts, and eight recent records with references, applicant, department, assignee, status, updated time and direct detail links. Department-only staff can use the dashboard. The legacy queue has URL-backed search, status, assignment, service, department, inclusive submitted-date and sort filters, clear/refresh controls, real server pagination and loading/error/empty states.

The sidebar includes permitted operational queues, correspondence, notifications, profile and security. Approval shortcuts require an approval grant. Ordinary staff do not see administrative settings navigation. Existing privileged settings compatibility is still permission-gated. Correspondence opens requests waiting for information and their existing message/note panels; it is not a separate email inbox.

Dense tables scroll inside labeled keyboard-accessible regions. Filters stack on narrow screens; metrics become two columns. The existing mobile drawer/focus trap, modal focus management and keyboard focus rules remain. Legacy assignment now blocks overlapping note/upload actions and discards a response belonging to a previously opened request.

### 3. Existing APIs reused

Reused legacy request detail/PATCH/issued-document upload; e-service list/detail/options and assignment/status/information/note/document/assessment/approval operations; the service workflow engine, payment verification, history, audit and resident outbox; CMS password change; authenticated session listing/revocation; employee contact update repository; TOTP encryption, challenge storage and recovery helpers; existing route-request deduplication and global session/CSRF/origin/input protection.

### 4. New API contracts

| Method / path | Contract / authorization |
|---|---|
| GET `/api/staff/applications` | `page`, `limit`, `search`, `status`, `assigned=me/unassigned`, `service`, `department_id`, `from`, `to`, `sort`; returns bounded `items`, independent `total`, `page`, `limit`, authorized filter `options`. Requires `requests.view` plus department/support and resource policy scope. |
| GET `/api/staff/applications/:id/assignees` | Minimal active staff choices authorized for that request. Requires `requests.assign`; unrouted support records permit the current authorized staff member and existing assignee. |
| POST `/api/staff/applications/:id/assign` | `assigned_user_id`, integer `version`; row lock, actor/assignee authorization and department checks; immutable assignment/history, version increment and staff inbox event committed together. Stale/closed/repeated assignment returns 409. |
| GET `/api/staff/applications/:id/documents/:documentId` | Checks both request and document permissions, department scope and document-to-request ownership; returns private attachment bytes with no-store/nosniff headers. |
| GET / PATCH `/api/staff/me` | Session-owned employee profile; PATCH accepts only `phone`. No role, EID, department or other-account edits. |
| PATCH `/api/staff/notifications/:id/read` | Session-owned notification only; idempotent read timestamp, 404 for another user's event. |
| GET `/api/account/mfa` | Current CMS account authenticator status only. |
| POST `/api/account/mfa/setup` | Current password proof, throttled enrollment, encrypted secret, account/version-bound ten-minute challenge and QR. |
| POST `/api/account/mfa/activate` | Enrollment ID + TOTP; five failed-code limit, single-use enrollment, conditional account update, hashed recovery codes displayed once and current session rotation. |
| POST `/api/account/mfa/disable` | Current password plus authenticator/recovery proof; clears enrollment and rotates current session. |

Existing dashboard response now includes `counts`, per-system `sources`, bounded `recent`, compatibility `applications`, scope wording and generation timestamp. CMS password sign-in uses the existing MFA verification endpoint with an explicit CMS challenge kind; resident and older resident challenges retain their original realm.

### 5. Database migrations

Applied `026_staff_operations.sql` and `027_cms_mfa.sql` through the versioned migration runner. The already-present `025_authoritative_auth_state.sql` was also pending and applied first.

026 adds trusted legacy department/assignee/version/due fields, backfills department only from an unambiguous configured service name, adds queue/assignee/update/due indexes, immutable legacy assignment history, and a staff-owned inbox with event-key deduplication and email retry state. Staff IDs intentionally have no resident-user foreign key. Existing support scope is preserved by an explicit `requests.unrouted.view` grant for the existing support group; editable assignment/approval permissions are not automatically expanded.

027 adds encrypted CMS authenticator secret, hashed recovery-code storage and verified timestamp. CMS recovery consumption locks the account and removes the code once. MFA changes advance the account security timestamp so other sessions become stale.

### 6. Request workflows

Legacy processing retains transition and fulfillment requirements, completion/closure permissions, immutable history and resident notifications. PATCH now increments/compares version, checks the caller's previous status, explicitly separates internal/public notes, and requires `documents.approve` for approval. Expected completion/follow-up dates persist to `due_at` at the end of the chosen Manila calendar day; invalid dates are rejected. Supporting files have protected download links.

E-services retain configured stage permissions, required information/documents, assessment/payment prerequisites, approval/release/completion and idempotency. Assignment checks an active permitted department member and records a staff notification transactionally. Resident responses create a notification for the assigned processor. Both portals read the same stored records, so processing changes do not require a second synchronization store.

### 7. Permissions and security

Legacy requests require membership in the configured servicing department, or an explicit unrouted-support grant, in addition to operation/resource permissions. E-service membership and resource policies apply before SQL pagination/aggregation. SQL policy expressions use a controlled server field map and bound values; malformed/unsupported scope policies fail closed. Detail and mutations retain their per-record authorization. Unsupported date/object-based resource policies require administrator review; normal submitted-date filters are supported independently.

New endpoints are explicitly declared in `apiEndpointPolicies.js`. Strict mutation fields reject ownership/role/department mass assignment. Pagination, status/sort/service/date filters are validated. Staff inbox reads cannot cross accounts; downloads cannot cross requests. CMS enrollment is bound to current account security state, recovery consumption is atomic, and secrets/recovery hashes are not returned from account/session DTOs.

### 8. Performance and notification delivery

Dashboard uses scoped SQL aggregates and bounded recent queries, without downloading histories/documents for unopened requests. Legacy lists use server pagination with a separate count query, including empty pages. E-service totals are also independent of the returned page, and approved server sort orders are supported. Date boundaries explicitly cast to local timestamps before applying Manila time zone.

Search is debounced 350 ms. Reads are canceled when obsolete and deduplicated; operational dashboard/legacy queries have a five-second per-user cache that staff mutations invalidate. Background refresh runs only when visible: 60 seconds for dashboard/legacy queue and 30 seconds for the existing incoming e-service queue. Secondary profile/security/detail modules remain lazy. Browser request inventories verified no news/weather/barangay/event/admin-settings calls on the staff dashboard and no unopened queue read for department-only staff.

Staff inbox events commit with assignments/responses/updates and deduplicate by event key. Optional email is drained afterward with `FOR UPDATE SKIP LOCKED`, retry/backoff, QUEUED/SENT/SUPPRESSED/FAILED state and redacted failure logs. Email failures do not undo request processing. The worker rechecks current notification settings, active CMS account and recipient address before delivery.

### 9. Verification evidence

| Check | Result |
|---|---|
| Production build and ESLint / undefined-name check | Passed |
| PostgreSQL + HTTP e-service suite, with `TEST_STAFF_BROWSER=1` | Final full run: 35 checks passed, including existing resident/business/payment/admin cases, new staff cases, inclusive Manila date boundaries and stored follow-up dates. |
| Final targeted staff regression | 11 checks passed, including suppression of queued email when the recipient address no longer matches the current authorized account. |
| New staff database cases | Authoritative counts; drafts/cross-department exclusion; first/last-minute Manila date boundaries; search/filter/pagination including empty pages; resource policies; concurrent assignment; one inbox event; notification read ownership; private notes; invalid transitions/approval denial; follow-up persistence; queue failure durability; database outage handling; concurrent CMS recovery-code consumption. |
| Real database staff browser | 320, 390, 768, 1440 px: dashboard, network scope, filters, pagination, detail, profile save/reload persistence, assignment and private-note mutation through real HTTP/SQL. Test session and external provider boundaries are isolated. |
| `test-staff-mfa-http.mjs` | Real server/database plus mobile browser: password proof, QR setup/activation, MFA login challenge, invalid/reused codes, recovery once, old-session rejection, secret privacy, UI disable and re-enrollment persistence. |
| `test-auth-isolation-http.mjs` | Resident/Staff/Admin sessions and public/private isolation, concern attachment rollback/persistence, private staff download bytes/headers, resident denial and file IDOR, malformed/mass-assignment requests, CSRF, disabled account, cookie migration and one-use reset. Storage provider is controlled in this regression. |
| Existing e-service browser regression | 1440, 390, 768 px: resident service/draft/billing states, CMS editor and staff links passed. |
| Staff processing and assessment UI | 390/1440 px: permission-filtered transitions, assignment, reasons, private draft isolation, stale errors, assessment handoff/creation and closed state passed. |
| Department-only queue UI | 390/1440 px: dashboard access without legacy permission, deferred queue retrieval, timed refresh, incoming/all filters, appointment detail and return navigation passed. |
| Routing/settings navigation tests | 15 passed; new profile/security routes and query ownership preserve canonical/sysparm behavior. |
| API security declarations | Passed; new routes remain under the common security boundary. |

Screenshots are in `artifacts/staff-operations/`. No test residents, requests, bills or notifications are seeded into the production UI. Temporary database test schemas are deleted after the run; HTTP security test accounts are cleaned up.

### 10. Remaining dependencies and limits

- Servicing departments, memberships and permission grants remain administrator-maintained. Legacy services with no unambiguous configured owner stay in explicitly delegated support scope; the implementation does not guess a municipal office. Legacy assignment needs `requests.assign`, and approvals need their existing approval grants.
- Overdue counts use persisted due dates. Requests without a configured/entered deadline do not acquire an invented SLA. Awaiting-documents counts use recorded rejected/replacement states on information-required requests.
- Correspondence uses existing per-request messages and notes. A new general municipal mail system, report export tool or separate unified request engine is outside this implementation.
- Optional delivery requires configured Redis/SMTP and enabled notification settings. Failure/retry persistence and authorization were verified; actual external SMTP delivery and real third-party storage availability were not exercised. Email delivery remains at-least-once across provider/worker crashes; in-app event creation is deduplicated transactionally.
- Existing unsupported resource-policy field/type combinations fail closed and require administrator correction before affected queues can be used. Supported department/assignee/status/primitive/numeric policy predicates are applied consistently to lists and counts.
- Responsive, labels, focus-preserving dialogs and keyboard table regions were exercised, but this is not a third-party WCAG certification or an external penetration/load test.
- Changes and migrations are implemented locally. No deployment, Git push or production release was performed.
