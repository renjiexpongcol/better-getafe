# E-Getafe application audit

Audit date: 3 October 2026. Primary scope: resident `/app/*`, staff `/app/staff/*`, and shared public/admin components affected by changes.

This report describes this audit's changes. The checkout already contained substantial changes from other work; those were preserved. The earlier announcement redesign and ghost icon-button work were also preserved and retested.

## Findings and fixes

| Finding / root cause | Implemented fix |
| --- | --- |
| Dashboard task dialogs announced success without a server write. Concern failures also announced success. | Tasks now navigate to the service catalog, appointment scheduler, payments page, or working concern form. Removed the fabricated submission/confirmation flow. |
| Dashboard's custom barangay control omitted the form field name and native validation. | Removed that duplicated form; concerns use the shared Help form's native barangay selection. |
| Appointments, concerns and staff dialogs lacked consistent focus containment, Escape, background isolation and restoration. | Added a shared native `ModalDialog`, with explicit Tab wrapping, nested-dialog support, scroll locking and focus restoration. Migrated these dialogs and the account/profile/settings/password modal shell. Busy dialogs guard dismissal. |
| The calendar wrapped two-digit dates at 320px, overlapped the close icon, and displayed the selected day in its month heading. | Fixed button padding and wrapping, reserved heading space for Close, and formatted the heading as month/year. Date selection keys use explicit year/month/day rather than browser locale formatting. |
| Appointment availability errors left an apparent loading state without a retry action. | Added retry, cleared stale errors on reload, and retained entered details. |
| Staff notification button did nothing. Notifications, help and settings routes rendered the request dashboard. | Added functional route content, a notification link, staff guidance and a read-only settings view. Added an authenticated staff notifications endpoint scoped to the current account and permission. |
| Staff search had no effect. The request-management page showed only eight records. | Implemented resident/service/reference search, meaningful no-match feedback and ten-row pagination. The dashboard keeps its eight-record preview. |
| Staff mobile navigation lacked Escape, focus containment, restoration and background isolation. The 768px shell overflowed horizontally. | Added drawer keyboard handling, inert background and scrim. Updated the drawer breakpoint and mobile header/search layout. |
| Staff account popover stayed open on outside click/Escape. Resident menu semantics lacked arrow-key navigation. | Added staff dismissal/restoration and resident Arrow Up/Down, Home/End and Escape behavior. |
| Staff automatic upload could not be explicitly retried after failure. Refreshing the request erased an unsaved note/status and the success notice. | Added an explicit upload/retry action; refreshing server documents preserves unsaved inputs and displays confirmed success. Upload and save operations cannot overlap. |
| Back navigation could leave request dialogs open, and a late upload could reopen a request after leaving it. | Route-owned request state now resets on navigation, cancels stale detail reads, and ignores mutation results for a different current record. Verified a delayed upload followed by Back. |
| Staff history existed in markup but was hidden by CSS. | Restored history, kept the Close header visible when scrolling, and removed the duplicate footer Close control. |
| Failed logout removed the local account before the server had invalidated its session; the error was not visible outside a notification popover. | Keep the account until the server confirms logout and show failure in the resident workspace. |
| A cold session check could remain unavailable until a later focus/visibility event. | Added a visible-tab recovery check every ten seconds. Existing normal-session caching and definitive expiry handling remain in place. |
| Published service details required an AuthProvider even though public pages intentionally do not bootstrap a session. | Added optional auth consumption for this shared component. Public detail pages remain anonymous and route sign-in back to protected service details. |
| PostgreSQL returned legacy request details as an object, while the frontend always called `JSON.parse`. | Accept both structured JSON and legacy serialized JSON. |
| `needs_information` requests did not appear in dashboard attention counts. Date helpers assumed every value was a string. | Added the status to attention handling and human-readable display; support Date objects, offset timestamps, date-only values and invalid dates safely. |
| Successful resident uploads left the file input populated, preventing reselecting the same file. Raw upload/download errors could expose technical details. | Clear the actual input after success, preserve it after failure, validate MIME/size before sending, and use normalized public errors and request timeouts. |
| Forms could accept overlapping submissions or edits while a write was pending. | Added synchronous submission guards to concerns, appointments, settlements and uploads; disable applicable fields while saving. Fulfillment date defaults use Philippine time. |
| Concern attachments were only stored when support email existed. Storage failure could occur after committing an application. | Store validated attachments independently of email, register them in the application document library, and require successful storage before committing the application. Remove the object if the transaction fails. |
| Legacy confidential uploads relied on a private-looking object path without verifying the bucket ACL. | All nonlocal `writeCitizenFile` calls now verify the bucket is private before writing bytes. Public and unverifiable buckets fail closed. |
| Malformed CMS news responses could replace the articles array with `undefined` and crash the admin shell. | Validate the collection shape and display a load error instead. |
| `NODE_ENV=development` in local backend configuration caused the frontend build to ship React's development runtime. | `npm run build` now sets production mode before Vite resolves configuration. The backend's development settings remain unchanged. |

## Application map and behavior covered

Routes are owned by `App.jsx`, generated page registrations, `routeRegistry.js`, and `applicationModuleRegistry.js`. Protected route decisions distinguish sign-in, setup, role denial, missing modules and unavailable sessions. Canonical and legacy route mappings were checked through the routing suite.

Resident pages use `CitizenLayout`, private dashboard data through `CitizenContext`, resident preferences, shared account/settings overlays, and either legacy citizen APIs or CMS-defined e-service workflows. Staff uses a separate shell, permission-filtered navigation, legacy request processing, and department e-service/billing workflows. Backend guards remain authoritative for identity, ownership, departments and operations.

The production preview was navigated at **320, 375, 390, 430, 768, 1024, 1280, 1440, 1920 and 2560px**. The matrix covers these 27 routes, including representative dynamic records:

- `/app`, `/app/profile`, `/app/settings`, `/app/help`, `/app/notifications`
- `/app/services`, `/app/services/:slug`
- `/app/requests`, `/app/requests/:id`, `/app/e-requests`, `/app/e-requests/:id`
- `/app/appointments`, `/app/documents`, `/app/payments`, `/app/e-payment/:id`
- `/app/e-billing/all`, `/app/e-billing/business`, `/app/e-billing/real_property`, `/app/e-billing/water`, `/app/e-billing/payment_order`
- `/app/staff`, `/app/staff/requests`, `/app/staff/e-requests`, `/app/staff/e-requests/:id`, `/app/staff/notifications`, `/app/staff/settings`, `/app/staff/help`

These matrix visits use deterministic browser API fixtures to exercise layout, empty/populated content, navigation and failures without changing municipal records. They are supplemented by real Express/PostgreSQL integration checks and a complete billing browser journey against domain HTTP routes in a disposable schema.

## Verification results

| Check | Result / scope |
| --- | --- |
| Build and lint | Passed `npm run build` and full `npm run lint`. |
| Initial domain/auth/routing baseline | 77 tests passed across e-services, appointments, preferences, settings navigation, error handling, runtime resilience, users, employee provisioning, OAuth, auth and routing. Counts from later runs overlap these tests. |
| Final production route matrix | 270 page visits: 27 routes × ten widths, with no horizontal page overflow or browser exceptions in the covered states. |
| Interaction regressions | Concern failure retains inputs and never claims success; retry yields a reference. Staff search, pagination/reset, upload failure/retry, retained notes/status, nested Escape, drawer focus, Back and late-upload navigation passed. |
| Production recovery checks | Automatic session recovery, failed logout, account menu keys, account modal focus/restoration, appointment retry, document retry/reselection and anonymous published service detail passed. |
| Full billing suite on production preview | 26 tests passed. Includes resident profile/business binding, draft creation/replay, validation, uploads, submission, tracking/history, department access, assignment, concurrent updates, assessment, exact amounts, payment verification, separation of duties, receipt issuance, renewal, reversal, outbox deduplication and completion. Browser journey passed at 1440px and 390px with reload persistence. |
| Updated full-backend HTTP fixture | Passed resident/staff/admin session isolation, HttpOnly cookies, one-time reset grants, staff notification permission boundaries, concern storage failure rollback and attachment/document persistence. Unique fixture users and related records were cleaned up; external storage was mocked. |
| Private upload boundary | Two tests passed: no write to public/unverifiable buckets, and correct content/MIME for a verified private bucket. |
| Citizen display regression | Three tests passed for attention status, timestamp variants/invalid values and upcoming appointment filtering/order. |
| Focus | Public navigation and announcement keyboard/mouse checks passed at desktop/mobile. All 25 stylesheets passed focus, disabled, validation, high-contrast and forced-colors checks. |
| Ghost icons/shared regressions | 83 named controls passed source audit and shared default/hover/active/focus/disabled/dark checks. Thirty public/auth/resident/staff/admin browser visits passed on the production preview. Intentional full button surfaces remain intact. |
| Employee UI | Profile editing and employee creation passed at 1440px and 390px. Updated obsolete fixtures for the current private news endpoint. |
| Service/draft UI | Service-detail variations, business selection, existing requests, loading/failure states, keyboard/start flow, draft sections, staff links and CMS editor passed at desktop/tablet/mobile. |
| Runtime/error/security | Final 18-test run passed auth/OAuth, policy coverage and outage recovery, including real Vite reset/refusal → controlled 503 → recovery. Policy audit covered 73 entries and 204 handlers. Direct HTTP security checks passed against the running backend on port 8080. |
| Request cache | Final 13 tests passed for deduplication, invalidation, account isolation, stale responses, cancellation, bounded read retries, rate limits and no mutation retry. |

API status coverage includes unauthorized/forbidden access, missing records, validation failures, rate limits and dependency failures. Deliberate ECONNRESET/S3/SMTP/database failures in test output are injected test conditions, not unresolved runtime crashes.

## UI, accessibility and performance

The navy municipal design and established tokens remain in use. Changes concentrate on working task destinations, clear errors/retry actions, compact staff navigation, useful empty states, readable calendar dates and consistent dialogs. Ghost utility controls retain their 44px invisible hit areas, token-based hover feedback and keyboard focus rings.

The main JavaScript bundle fell from approximately **464.76 KB / 140.18 KB gzip** to **295.09 KB / 95.35 KB gzip**: approximately 36.5% less raw JavaScript and 32% less compressed transfer for that bundle. React's development JSX runtime was replaced with the release runtime. These are build-size measurements, not a claimed Lighthouse or network-speed score. Staff request pagination also bounds rendered rows to ten.

Screenshot evidence is in `artifacts/app-audit/` (appointment and staff dialogs at all ten widths), with additional service, billing, focus, employee and ghost-control evidence in their corresponding artifact directories.

## Files changed by this audit

- Shared components: `src/components/ModalDialog.jsx`, `ModalDialog.css`, `ProfileModal.jsx`, `StaffUtilityPages.jsx`, `ServiceDetails.jsx`, `CitizenLayout.jsx`, `CitizenWidgets.jsx`.
- Auth/data helpers: `src/context/AuthContext.jsx`, `src/services/citizenData.js`.
- Pages: `src/pages/dashboard/Dashboard.jsx`; `src/pages/app/Application.jsx`, `Appointments.jsx`, `Documents.jsx`, `Help.jsx`, `Payments.jsx`, `StaffSysparm.jsx`, `StaffSysparm.css`, `StaffRequestModal.jsx`, `StaffRequestModal.css`, `FulfillmentNoteModal.jsx`; `src/pages/admin/Admin.jsx`.
- Backend: `server/src/services/citizenRoutes.js`, `staffRoutes.js`, `storage.js`.
- Build: `package.json`, `scripts/build-frontend.mjs`.
- Tests: `scripts/test-app-audit-ui.mjs`, `test-app-recovery-ui.mjs`, `test-private-upload-boundary.mjs`, `test-citizen-display.mjs`, `auth-isolation-fixture.mjs`, `test-auth-isolation-http.mjs`, `business-billing-browser.mjs`, `test-employee-profile-ui.mjs`.

## Remaining limits and follow-up scope

No failures remain in the checks listed above. This audit is not a guarantee that every possible account, configuration, third-party outage or data combination is covered.

- Physical-device Safari/Firefox, assistive-technology testing and every possible delegated permission combination were not exercised. Browser automation used Chromium with desktop/mobile viewports and keyboard/forced-colors checks.
- Actual SMS/email delivery, Google consent screens and a live payment provider transaction were not sent. Provider/auth/callback contracts and failure behavior were exercised through integration tests and fixtures.
- Onboarding/password/MFA logic was checked by existing auth/onboarding-related tests; the complete onboarding journey with a real external verification provider is outside the browser route matrix.
- The legacy staff dashboard API still performs broad reads and per-record authorization/detail work. UI pagination reduces rendering cost; server pagination/query optimization remains a scalability improvement for large datasets.
- Existing concern attachments that were lost before this fix cannot be reconstructed from the frontend. Newly submitted attachments are now persisted and registered independently of support email.
- The new staff notification view reads notifications addressed to that account. It does not introduce a new department-wide notification producer.
- No deployment was performed. Production-built assets and the source were tested locally. Existing unrelated workspace changes were preserved.

## Reproduce the audit

Run the normal development launcher or serve the production build, then set `UI_TEST_URL` to its URL. The browser scripts default to port 5173.

```powershell
npm run lint
npm run build
$env:UI_TEST_URL = 'http://127.0.0.1:5173'
node scripts/test-app-audit-ui.mjs
node scripts/test-app-recovery-ui.mjs
node scripts/test-icon-buttons-ui.mjs
node scripts/test-focus-ui.mjs
node scripts/test-auth-isolation-http.mjs
node --test scripts/test-private-upload-boundary.mjs scripts/test-citizen-display.mjs
node --test scripts/test-business-billing-ui.mjs
node scripts/test-api-security-http.mjs
node scripts/test-request-cache.mjs
```

The domain/HTTP suites require the configured local PostgreSQL/Redis services. Browser fixtures isolate routine UI checks from actual resident records.
