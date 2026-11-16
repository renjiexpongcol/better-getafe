# Getafe Portal API security audit and hardening

Audit date: 2026-10-06. Scope: the complete backend route surface and the public, resident, staff and CMS clients in this working tree. Changes remain local and reviewable; no deployment was performed. Existing unrelated work was preserved.

## Result and coverage

The backend now uses an exact **method + path** security registry, checked both when handlers register and by an independent source-inventory test. It contains **230 declarations: 222 under `/api` and eight outside it**. The classifications are 40 PUBLIC, 14 AUTH_FLOW, 55 RESIDENT, 25 STAFF, 93 CMS and three SESSION. This is 176 session-protected API operations, 32 intentionally public API operations and 14 authentication-flow operations. Authentication-flow transport being anonymous does not authorize an operation without its handler's credentials, challenge, OAuth state or session checks.

The full endpoint matrix is [API_SECURITY_MATRIX.md](API_SECURITY_MATRIX.md), with machine-readable records in [API_SECURITY_MATRIX.json](API_SECURITY_MATRIX.json). Independent source locations are in [API_ENDPOINTS.json](API_ENDPOINTS.json). These include aliases, generated registration loops, the local upload regex and health/feed/crawl endpoints. HEAD inherits GET. OPTIONS is handled by route-aware preflight validation. Static media, frontend assets, the HTML shell and fallback middleware are separately classified in the matrix.

The result is not a claim that middleware alone proves every business rule. Every classified private operation gets the common session/account/permission boundary. Resource-specific enforcement remains in the owning handler or service. Tests exercise the major role, ownership, financial, authentication and storage workflows; live production configuration and real external providers were not certified by these local tests.

## Vulnerabilities found and fixed

| Severity | Area | Vulnerability | Impact | Fix |
|---|---|---|---|---|
| HIGH | Route classification | Broad namespace policies could classify new handlers without an explicit operation review. | New functionality could inherit unsuitable authorization. | Replaced broad definitions with 230 exact declarations; startup guard covers application methods, `app.route`, aliases and approved regex; classified router mounts are frozen against later additions. Independent inventory rejects missing/stale declarations. |
| HIGH | CSRF | Cookie mutations relied on origin checks and could be exempted by an arbitrary Authorization header. Case-sensitive API detection could also miss case variants accepted by Express. | Unauthorized cookie-backed changes through a bypassed mutation boundary. | Signed, expiring, cookie-bound CSRF tokens plus Origin/Referer validation; a supplied Bearer header cannot exempt a cookie request; case-insensitive API detection; browser helper obtains tokens without replaying mutations. |
| HIGH | Account/session status | The common API boundary did not require a persisted current account and current role/timestamp on every private request. Durable revocation could be skipped by an early development Redis fallback. | Disabled, changed or revoked account sessions could survive an incomplete check. | Current persisted user, matching role and credential timestamp are mandatory; durable revocation is checked before development fallback; missing authorization/account dependencies fail closed. |
| HIGH | Upload authorization | Proxy retry handling could treat a grant lookup failure as a storage failure and retry an unauthorized write; local upload did not require an issued owner grant. | Arbitrary or cross-owner object writes and overwrite attempts. | Grant lookup outside provider retry handling; pending owner/MIME/size/expiry grant for both transports; issued media key format required; completion uses server-side pending metadata. |
| HIGH | Local/public file boundary | Local static serving relied on private-prefix exclusion alone; a pending or orphaned disk object could be directly requested. General private account uploads did not verify B2 bucket privacy. | Exposure of incomplete/private files, or private avatars in a public bucket. | Public local serving requires an active media-library record and JPEG/PNG/WebP type; private prefixes and writes denied. Private account upload checks bucket ACL before writing. Existing citizen/e-service private bucket checks retained. |
| HIGH | Legacy staff resource scope | Application details were spread after trusted fields when constructing the authorization resource. | Client details could override scope fields used by resource policies. | Trusted application fields now override details. |
| HIGH | Billing-party lookup | A NULL-business branch could admit unrelated residents into a staff billing-party lookup. | Unnecessary resident exposure outside authorized billing/department scope. | Removed the NULL-business global allowance; resident-linked billing accounts require the account's actual user and authorized department. |
| HIGH | Group assignments | Group-side membership changes did not consistently prove the actor held the permissions being assigned. | A delegated group manager could assign permissions beyond their own grants. | Check the group's permissions against actor grants before membership assignment; preserve self/super-administrator protections and audit behavior. |
| HIGH | Google onboarding | Initial password setup could be repeated and did not establish a new credential timestamp/session boundary. | An old session could attempt another password replacement; concurrent setup lacked a single-use guarantee. | Google setup state required; transactional row lock and single-use password flag; update credential timestamp and rotate session after success. Real PostgreSQL concurrent/replay regression added. |
| HIGH | Default RBAC provisioning | New IT-support accounts were bootstrapped into System_Administrators. | Routine support provisioning granted broad administrator permissions. | New IT-support default is Staff_Support. Existing explicit memberships are retained and require an operator review; they were not silently removed. |
| MEDIUM | Production origin policy | Same-Origin acceptance depended on the request Host, even in production. | An untrusted effective host could expand the production origin decision. | Production accepts configured origins only; development host matching remains separate; trusted proxy handling retained. |
| MEDIUM | Public configuration | Prefix-based public settings selection could expose future settings inadvertently. | Newly introduced values could enter public responses without review. | Fixed public-key allowlist; existing explicit public content DTOs preserved. |
| MEDIUM | Abuse protection | Authenticated/signed-service context could bypass stricter operation buckets. | Excess credential changes, uploads or expensive lookups. | Credential/MFA/verification operations use strict buckets; uploads/search checks precede higher signed-in allowances; signed services remain throttled; verified API-key identity takes precedence over user, service and trusted client IP. |
| MEDIUM | Input boundary | Common query/body/header/path constraints were incomplete. | Duplicate query values, malformed identifiers or privileged fields could reach handlers inconsistently. | Bounded structural validation, scalar queries, pagination ranges, safe paths/headers and explicit writable fields on resident/auth/financial mutations; retain handler-specific schemas and parameterized SQL. |
| MEDIUM | Media completion | Pending upload fields could arrive in snake_case while finalization expected camelCase. | Completion records could remain pending, undermining cleanup/state consistency. | Normalize pending storage/owner fields before finalization; retain transactional completion. |
| LOW | Public diagnostics | Public liveness/readiness responses included internal lifecycle details. | Unnecessary operational disclosure. | Minimal public status; detailed infrastructure endpoints require permission. |
| LOW | Frontend password settings | An unreachable fallback referenced an undefined `setPasswordOpen`. | Runtime failure if a password row lacked its callback. | Use the supplied optional callback; expanded strict undefined-variable lint to all authored server/client/scripts. |
| CRITICAL | Dependencies | Installed proxy-addr had a critical advisory. | Known dependency vulnerability remained in the installed tree. | Compatible lockfile update; final `npm audit` reports zero vulnerabilities. |
| HIGH | Dependencies | Installed source-map-js had a high advisory. | Known dependency vulnerability remained in the installed tree. | Compatible lockfile update; no dependency major-version rewrite. |

Severity reflects the authorization/data impact of the reachable code path or the dependency advisory. No exploit against a production system was attempted.

## Authorization matrix

| Endpoint/group | Anonymous | Resident | Staff/CMS operator | Admin | Required permission / resource rule |
|---|---|---|---|---|---|
| Published content, service catalog, public datasets/config | Allowed public DTO | Same public DTO | Same public DTO | Same public DTO | Published/public selection; public responses independent of session |
| Contact, article feedback, client error ingestion | Validated/rate limited | Same | Same | Same | Handler validation; no privileged data read |
| Liveness/readiness, RSS, sitemap, robots | Minimal public response | Same | Same | Same | No diagnostic dependency details |
| Login/register/OTP/reset/OAuth | Flow-specific credentials/challenge/state | Flow checks | Flow checks | Flow checks | Strict abuse limits; single-use state; generic auth responses |
| Current auth state / logout / CSRF issuance | No authenticated principal without valid session | Own session | Own session | Own session | Cookie/credential binding; mutation CSRF where cookie is present |
| Session management | Denied | Own sessions | Own sessions | Own sessions | Valid current account, durable revocation, session ownership |
| Resident profile/preferences/MFA/onboarding | Denied | Own resident | Denied | Denied | Portal resident role; server-derived user; credential/challenge validation |
| Resident applications/documents/appointments/notifications | Denied | Own resources | Denied on resident APIs | Denied on resident APIs | Scoped queries; no supplied owner/state escalation; horizon/capacity checked server-side |
| Businesses, billing, payment orders | Denied | Own resources | Denied on resident APIs | Denied on resident APIs | Applicant/business/account ownership; authoritative totals/status; idempotency |
| Staff legacy queue/process/documents/notifications | Denied | Denied | Listed permission + resource policy | Listed permission + resource policy | requests.view/update, documents.process, notifications.view; resource policy cannot be overwritten by details |
| Staff e-services | Denied | Denied | Listed permission + active department scope | Listed permission + active department scope | requests.department.*, documents.*, assessments.*, billing.manage, payments.*, reports.view |
| CMS content/catalog/directory/media | Denied | Denied | Only with listed grant | Only with listed grant | content.*, directory.manage, services.catalog.*, departments.manage; upload grants/reference protection |
| Users/groups/policies/employee management | Denied | Denied | Only with listed grant and assignment guards | Same safeguards | users.*, groups.manage, permissions.manage, policies.manage; self/super-admin constraints; no grant beyond actor |
| System/errors/infrastructure | Denied | Denied | Only with listed grant | Only with listed grant | system.infrastructure.view, system.errors.*, system.settings.manage |
| Settings | Denied | Denied | Both granular RBAC and settings delegation | Same, with existing super-admin rules | settings.*; candidate/category/secret validation and audit |
| Provider payment webhook | Invalid signature denied | Same | Same | Same | Configured provider HMAC, authoritative order/amount/currency, durable event idempotency |
| Unknown route / unsupported method | 404 / 405 | 404 / 405 | 404 / 405 | 404 / 405 | No inferred endpoint policy |

An administrator role alone does not bypass granular/resource checks. CMS is a permission-bearing context, so a delegated staff operator may use a particular CMS API when explicitly granted; the role does not grant the whole CMS.

## Resource, financial and storage review

Resident identities come from the authenticated session. Legacy applications, files, notifications and appointments use user-scoped lookups; unified e-services use applicant/account/business ownership and department-scoped staff queries. Tests use two residents and privileged/unprivileged staff to exercise cross-owner access before returning or mutating data. Notification recipient/state is produced by trusted workflows. Staff audit/history/internal notes stay outside resident responses.

Financial tests prove that assessment totals come from configured/authorized fee items, client amount changes cannot alter assessed totals, overpayment and unauthorized confirmation are rejected, duplicate confirmation/webhook/checkout is idempotent, payment records survive reload, and reversal/history is immutable. Legacy resident settlement amounts are declarations queued for verification, not authoritative paid balances; the endpoint cannot mark a settlement paid. Approval/payment/verification fields are server-controlled. Separation of duties and actual Treasury/department permissions remain enforced.

SQL value inputs remain parameterized. Dynamic media sort columns are selected from a fixed map; dynamic conditions are fixed fragments with bound parameters; dynamic limits are bounded integers. Tests exercise transactional assessment rollback, concurrent stale writers, booking serialization, settlement deduplication and durable outbox behavior. This was a source review and behavioral regression pass, not a database penetration test.

Uploads retain MIME/extension/magic-byte/size validation and server-generated keys. Resident/e-service documents live outside the public local root and require scoped download authorization; B2 confidential writes fail closed unless bucket ACL is verified private. Media grants bind uploader, path, MIME, size and expiry. Deletion retains reference checks. No valid private document is intentionally served by `/uploads`. Existing signed B2 public-media URLs remain part of the media workflow.

## Authentication and session review

Session parsing requires a correctly formed Bearer token or signed cookie, bounded token length, valid id/session id, finite timestamps, expiration and non-future issue time. Cookie settings preserve HttpOnly, API scope, SameSite and production Secure behavior. HTTPS/trusted proxy decisions remain explicit. Current role/credential timestamp and durable revocation are checked before private handlers. Password changes update timestamps, rotate the current session and invalidate other sessions; initial Google password setup now does the same credential transition.

The previously repaired durable authentication-state table/tombstones remain authoritative. Atomic challenge consumption, MFA/recovery state and reset grants are retained. Reset-grant cookies cover `/api/auth` so token issuance can bind CSRF to the grant; legacy reset-cookie paths are expired during issuance. Responses do not return reset credentials. OTP/MFA/reset/password-change rate limits remain active even if ordinary rate limiting is disabled, and production auth operations fail closed when Redis protection is unavailable.

Security headers remain in place: CSP in production, nosniff, frame/referrer/permissions protections and HSTS on secure production traffic. Private errors use controlled JSON with request/correlation identifiers; client transport suppresses raw infrastructure errors. Audit events record policy templates instead of raw token-bearing URLs. Secret-bearing diagnostic fields remain redacted by the existing logging layer.

## Six previously identified regressions

| Regression | Evidence |
|---|---|
| Consumed authentication state cannot return from durable fallback | Real PostgreSQL authoritative consumption/tombstone tests, Redis-outage/stale-cache cases and one-time reset HTTP flow pass. |
| Resident/staff password change uses asynchronous verifier | Both real HTTP password-change flows pass; weak/wrong credentials rejected; new password works; old password and stale sessions fail. |
| Service requirements renderer has no undefined `f` | Desktop/mobile multiple/zero requirements, field bindings, add/edit/remove, validation, save/reopen pass; broad no-undef lint passes. |
| Failed uploads leave no broken state | Injected failed resident/staff/avatar uploads, rollback/cleanup and valid retry pass; authorization outage cannot trigger write retry. |
| Appointments cannot exceed configured horizon | Scheduling boundaries, nonpositive horizons and concurrent final-slot serialization pass; availability is recomputed server-side. |
| Concurrent settlement retries cannot duplicate writes | Real PostgreSQL transaction/concurrency/idempotency tests pass; commit precedes notification and outbox deduplicates delivery. |

## Tests and verification

The final expanded backend suite reports **124 passed, zero failed, zero skipped**. It includes the existing auth, six-issue, appointment, user/employee, private-file, origin, error, media, OAuth, transport, e-services, preference, settings-navigation, runtime/configuration, routing and official-status suites, plus the new security tests. The separate complete business-billing browser run reports **27 passed, zero failed, zero skipped**; many backend cases overlap, so these counts must not be added as unique tests.

New automated security coverage:

- Exact route/policy discovery in both directions; valid existing permission identifiers; new-handler rejection inside formerly broad namespaces, direct `app.route`, regex and router mounts.
- Every private policy: anonymous denial, role isolation, missing permission, disabled/revoked context and fail-closed dependency behavior. These are boundary tests with callbacks; they complement the real handler/DB tests rather than replacing them.
- Cookie-bound CSRF: missing/forged/expired/cross-session tokens, reset-cookie binding, browser token acquisition and no automatic mutation replay.
- Mass assignment, duplicate/malformed query/path/header/body input and strict operation rate classification.
- Real HTTP media handlers: missing/foreign/expired/unavailable grant causes no write or retry; issued grant works; arbitrary storage keys fail. Active/public local media gating and unsafe/pending/private/orphaned denial.
- Real PostgreSQL initial Google password setup: concurrent attempts yield one success, subsequent reuse rejected, password and credential timestamp committed together.
- Expanded full-server adversarial requests: resident/staff/admin boundaries, resident-A versus resident-B application/document, foreign media deletion, disabled account, forged/expired tokens, uppercase-path CSRF bypass attempt, hidden ownership fields and malformed pagination.

| Verification | Result | Local evidence |
|---|---|---|
| Expanded backend regression suite | 124 pass / 0 fail / 0 skip | artifacts/api-complete-regressions.log |
| Exact declaration checks | 230 policies match 230 independently discovered declarations | artifacts/api-inventory.log; test-security-boundaries.mjs |
| Full-server direct security requests | Pass | artifacts/api-http-final.log; artifacts/api-auth-isolation.log |
| Resident and staff password/session flows | Pass | artifacts/api-password-tests.log |
| Adaptive rate limits / controlled 429 / signed-service throttling | Pass | artifacts/api-traffic-tests.log |
| B2/local storage service tests | Pass with provider adapters | artifacts/api-storage-tests.log |
| Business-billing desktop/mobile real workflow | 27 pass / 0 fail / 0 skip | artifacts/api-billing-browser-final.log |
| Service editor desktop/mobile regression | Pass | artifacts/api-editor-final.log |
| E-services resident/CMS workflow, three viewport sizes | Pass | artifacts/api-eservices-browser.log |
| Staff assessment and processing, desktop/mobile | Pass | artifacts/api-assessment-browser.log; artifacts/api-processing-browser.log |
| Employee creation/profile, desktop/mobile | Pass | artifacts/api-employees-browser.log |
| Anonymous/public and identity-isolation browser checks | Pass for anonymous/resident/staff/admin | artifacts/api-public-auth-browser.log |
| Anonymous municipal page/API smoke | Pass: home/news/events/services/departments/barangays/officials/info/contact; public APIs; invalid contact input | artifacts/api-public-smoke.log |
| Normal lint | Pass | artifacts/api-lint.log |
| Strict no-undefined lint, all authored server/client/scripts | Pass | artifacts/api-undefined.log |
| Production frontend build | Pass | artifacts/api-build.log |
| Dependency audit | Zero vulnerabilities | artifacts/api-dependency-audit.json |
| Recognized secret scan, working tree + reachable Git history | No recognized credential findings | artifacts/api-secret-scan.json |

Early checks found obsolete expectations for a broad policy id, the existing bounded read retry behavior, and new CSRF fixtures. Those expectations/fixtures were updated to exercise the current contract. The final middleware-mount guard also initially omitted existing scoped middleware mounts; startup verification caught this and the reviewed allowlist was completed. Staff UI checks were rerun against the running preview rather than their unavailable default port. No security assertion was removed to make the final runs pass. Detailed logs can contain intentional injected-failure diagnostics; final suite exit status and summaries are the results above.

## Secret review

The repeatable scanner examines tracked/non-ignored text and reachable Git history for recognized AWS/GitHub/Google/Stripe/private-key formats and credential-bearing database URLs. It emits only type/file/location, never matched values. The audit scanned 42 reachable commits through their text objects; the JSON records exact file/object counts for each run. No recognized real credential was found. This does not certify arbitrary strings as non-secret.

Contextual review identified development database credentials in docker-compose/setup configuration and the local session fallback, plus environment placeholders. These are development defaults, not evidence of a production credential leak. Production rejects known placeholder/default signing secrets. Do not reuse development defaults in deployment. No `.env` values were copied into the report. If a development default was reused on a reachable deployment, rotate that deployment credential and update its secret configuration. Production B2/SMTP/OAuth/session credentials and historical arbitrary tokens cannot be validated solely from a format scanner.

## Files changed by this pass

The table describes this pass's edits, including additions to files that already contained unrelated work. It does not attribute the entire existing worktree diff to this audit. A complete final status snapshot is recorded in artifacts/API_WORKTREE_STATUS.txt.

| File | Change |
|---|---|
| server/index.js | Common account/RBAC/CSRF boundary; exact registration guard; minimal probes; public config allowlist; session parsing/revocation; reset-cookie migration; Google session rotation; issued upload grants; safe local public media. |
| server/src/services/apiRoutePolicy.js | Exact matching and fail-closed account/permission validation; registration checks including router mounts; CSRF CORS header. |
| server/src/services/apiEndpointPolicies.js | Reviewed 230 exact declarations with permission, ownership, validation and CSRF metadata. |
| server/src/services/apiInputValidation.js | Bounded common request validation and explicit writable fields. |
| server/src/services/csrf.js | Expiring HMAC tokens bound to session/reset cookies. |
| server/src/services/publicMediaAccess.js | Active-record/public-image-only local storage boundary. |
| server/src/services/requestOrigin.js | Explicit configured production origin allowlist. |
| server/src/services/trafficProtection.js | Strict credential/upload/search buckets, signed-service throttling and identity precedence. |
| server/src/services/authorizationService.js | Reuse existing settings permission identifiers in central RBAC; safer new IT-support bootstrap. |
| server/src/services/accessManagementRoutes.js | Prevent group membership granting permissions the actor lacks. |
| server/src/services/staffRoutes.js | Trusted resource scope overrides client application details. |
| server/src/services/eserviceRoutes.js | Billing-party/account owner and department filtering. |
| server/src/services/citizenRoutes.js | Single-use initial Google password service and session rotation hook. |
| server/src/services/googleOnboarding.js | Transactional initial password consumption, credential timestamp and concurrent/replay protection. |
| server/src/services/storage.js | Verify private B2 ACL before general private account upload. |
| server/src/services/publicApiDtos.js | Explicit public configuration key list. |
| server/src/repositories/mediaRepository.js | Normalize pending-upload field names during finalization. |
| src/services/securityFetch.js | Shared browser token acquisition, credential modes and mutation no-replay behavior. |
| src/pages/app/Settings.jsx | Adopt secure transport; fix undefined password callback fallback. |
| package.json | Security/inventory commands and broad strict undefined-variable lint. |
| package-lock.json | Compatible transitive advisory fixes. |
| scripts/route-inventory.mjs | Independent AST inventory of handlers/aliases/generated loops/regex. |
| scripts/audit-api-matrix.mjs | Reproducible Markdown/JSON security matrix, including middleware surfaces. |
| scripts/audit-repository-secrets.mjs | Redacted recognized-credential scan across working tree and Git history. |
| scripts/test-security-boundaries.mjs | Per-policy boundary, coverage, CSRF, validation, transport and rate regressions. |
| scripts/test-media-security.mjs | Actual upload-handler HTTP regressions and public media gate tests. |
| scripts/test-google-onboarding-security.mjs | Real PostgreSQL single-use/concurrent initial password tests. |
| scripts/test-api-security.mjs | Exact method contract and explicit account/authorization callback fixtures. |
| scripts/auth-isolation-fixture.mjs | Persisted credential timestamp, valid private ACL test adapter and expired-session test issuance. |
| scripts/test-auth-isolation-http.mjs | Token-aware requests, reset-cookie migration and adversarial full-server cases. |
| scripts/test-password-change-http.mjs | CSRF requests and strict rate-limit-aware password/session verification. |
| scripts/test-api-transport.mjs | Preserve existing bounded read-retry contract. |
| scripts/test-traffic-protection.mjs | Assert credential buckets and signed-service throttling. |
| scripts/test-request-origin.mjs | Production untrusted-host origin regression. |
| scripts/test-resident-preferences.mjs | Exact method/path policy-id expectation. |
| scripts/test-private-upload-boundary.mjs | General private account upload also rejects public/unverifiable ACL. |
| scripts/business-billing-browser.mjs | CSRF fixture for billing workflow. |
| scripts/test-service-editor-regression.mjs | CSRF fixture for editor mutations. |
| scripts/test-eservices-ui.mjs | CSRF fixture for resident/CMS UI mutations. |
| scripts/test-employee-profile-ui.mjs | CSRF fixture for employee mutations. |
| scripts/test-staff-assessment-ui.mjs | CSRF fixture for assessment mutations. |
| scripts/test-staff-processing-ui.mjs | CSRF fixture for staff processing mutations. |
| docs/API_ENDPOINTS.json | Complete current independent inventory with source locations. |
| docs/API_SECURITY_MATRIX.md | Full readable per-operation security matrix. |
| docs/API_SECURITY_MATRIX.json | Machine-readable security matrix and evaluated rate limits. |
| docs/API_SECURITY_AUDIT.md | Findings, controls, evidence and remaining risks. |

The following existing client files each adopt the same securityFetch transport for cookie-backed mutations/public credential isolation (their other preexisting changes remain untouched):

| File | Change |
|---|---|
| src/services/apiTransport.js | Use shared secure fetch. |
| src/services/publicDataApi.js | Use shared secure fetch. |
| src/services/publicError.js | Use shared secure fetch. |
| src/hooks/useOpenStats.js | Use shared secure fetch. |
| src/components/AdminAccessManagement.jsx | Use shared secure fetch. |
| src/components/AdminErrorLogs.jsx | Use shared secure fetch. |
| src/components/AdminPrivacyRequests.jsx | Use shared secure fetch. |
| src/components/AdminSettings.jsx | Use shared secure fetch. |
| src/components/CommentsModeration.jsx | Use shared secure fetch. |
| src/components/EmployeeProfile.jsx | Use shared secure fetch. |
| src/components/EmployeeSelect.jsx | Use shared secure fetch. |
| src/components/HeaderWeather.jsx | Use shared secure fetch. |
| src/components/PasswordChangeModal.jsx | Use shared secure fetch. |
| src/components/SettingsPermissions.jsx | Use shared secure fetch. |
| src/pages/auth/Login.jsx | Use shared secure fetch. |
| src/pages/auth/ForgotPassword.jsx | Use shared secure fetch. |
| src/pages/dashboard/Profile.jsx | Use shared secure fetch. |
| src/pages/weather/Weather.jsx | Use shared secure fetch. |
| src/pages/info/Contact.jsx | Use shared secure fetch. |
| src/pages/news/Article.jsx | Use shared secure fetch. |
| src/pages/app/Setup.jsx | Use shared secure fetch. |

Generated evidence includes api-*.log/JSON under artifacts, business-billing and auth-isolation screenshots, and service-editor desktop/mobile captures. They are verification outputs, not production code. Existing six-issue implementation files/migration were already present; this pass retained and tested them.

## Remaining risks and verification limits

1. **Production infrastructure was not exercised.** Configure general.url/PUBLIC_SITE_URL/API_CORS_ORIGINS to the intended HTTPS origins and explicitly trusted proxy CIDRs. Verify Secure cookies, HSTS/CSP, Redis fail-closed behavior and deployment secret configuration on that environment. Development same-origin exceptions are deliberately unavailable in production.
2. **External provider checks used test adapters.** B2 upload/ACL/retry tests establish application decisions, not the actual bucket ACL/key permissions or production signed-URL lifetime. Existing objects previously uploaded to a public bucket may already have been exposed; changing future writes cannot undo that. Inspect the real bucket and remediate any historical confidential objects. SMTP delivery, CAPTCHA, Google OAuth consent/redirect settings and live payment-provider callbacks require staging checks; no test email/payment was sent to a real recipient/provider.
3. **Existing explicit administrative memberships need operator review.** New IT-support defaults are fixed; existing System_Administrators membership was preserved. Review deployed groups, settings delegation, department membership and super-administrator accounts for excessive grants. Explicit grants are still permissions and are enforced as such.
4. **Boundary coverage is exhaustive; business-case coverage is representative.** All 230 declarations are checked and all private policies get negative boundary tests. Major resource/payment/auth/file workflows run against PostgreSQL/HTTP. Every combination of catalog form schema, permission condition, CMS field and resource state was not exhaustively mutated in a live server. Field validation still combines common constraints with existing handler/service schemas; it is not a new universal schema system.
5. **Secret scanning has format limitations.** Recognized formats were checked through reachable history; arbitrary high-entropy/literal strings, inaccessible refs and deployed secret stores were not certified. Development defaults must not be reused in production.
6. **Public media is intentionally public after activation.** Published/public media assets can be requested without authentication. Private resident documents must stay in the separate private workflows; activation of a media-library asset is not a substitute for private-document authorization. Legacy unindexed/non-active local media now returns 404 and must be reconciled through the authorized media workflow.
7. **Complete unrelated UI/performance suites were not treated as an acceptance substitute.** Security-relevant browser flows and backend regressions were run. This report does not claim every unrelated screenshot, performance, backup, infrastructure-recovery or external-network utility in scripts was executed.

## Maintaining the boundary

For a new operation, add an explicit method/path policy using an existing permission identifier, implement its handler validation and ownership/scope rules, and add appropriate positive/negative workflow tests. Do not populate policy declarations from route discovery and do not widen a namespace wildcard to silence a coverage failure.

Run `npm run test:security-boundaries`, `npm run test:api-security`, `npm run audit:api-routes`, `node scripts/audit-api-matrix.mjs`, `npm run lint`, `npm run lint:undefined`, `npm run build` and the relevant HTTP/DB workflow tests. The scanner is `node scripts/audit-repository-secrets.mjs`. The numeric rate settings in the JSON matrix are evaluated in the audit environment and may differ from deployment overrides.

Design references: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) and [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
