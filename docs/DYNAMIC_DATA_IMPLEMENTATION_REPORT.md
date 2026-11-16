# Dynamic data implementation report

Date: 2026-10-12. Workspace: GETAFE_PORTAL.

## Status and scope

Implemented and tested a substantial database-backed content and synchronization refactor across the public portal, resident application, staff reads, and CMS. This is not an unconditional whole-application production-readiness certification. The content and synchronization limits below are material to rollout.

The starting workspace already contained extensive unrelated changes. This report describes this request's work; the entire working-tree diff must not be attributed to this request. No deployment, commit, push, or production release was performed.

## Discovered hardcoded dependencies and disposition

| Dependency | Original location | Implemented source / disposition |
| --- | --- | --- |
| Named mayor, vice-mayor, ABC president and default official records | officialsRepository, public Officials, CMS OfficialsSelectorEditor | Persisted site_pages and government directory only; new editor names blank; no invented officeholders on missing records. |
| Barangay names, populations, captains, details and location arrays | src/data/barangays.js; barangaysRepository; public pages; resident forms; citizenRoutes; eserviceEngine | site_pages barangays via public API. Server validation uses saved records. Test-only injected records are explicit. Static source removed from production directory. |
| Municipal demographic, household, income, age, historical population and geography statistics | src/data/getafe.js; AboutUs | Static statistical source isolated in legacy review artifacts. AboutUs is a managed published page. The former specialized statistical charts/table are not preserved by the generic page renderer; see limitations. |
| Static service names/categories and service-to-department associations | src/data/citizenServices.js; Directory; citizenRoutes; departmentRoutes/Validation | Persisted service catalog and category/department relationships. Validation rejects references outside the actual catalog. Static production module removed. |
| Directory fallback offices and guidance mapping | Directory; directorySearch | Only published department/service API records. Removed synthesized offices and the unused service-ID mapping. Search aliases remain technical normalization rules. |
| Default popular-service links on the home page | Hero | Published API records only. Empty source produces no popular-services navigation. |
| Manually maintained service category cards | ServicesSection | Distinct categories from published service records, with loading/error/retry/empty presentation. |
| Hotline directory, quick dial numbers, categories and emergency tips | EmergencyHotlines | managed_public_content key hotlines. Categories/counts derive from actual content. Existing palette preserved; empty lists do not leave unused quick-dial/tips sections. Ambiguous contact descriptions are not converted into synthesized telephone digits. |
| Preset related services in barangay profiles | BarangayRelatedSection | Real published news records filtered for the barangay. No related news produces an explicit empty state. |
| Sample related-news cards | Article | Actual related records only. |
| Authored service guidance and fixed requirements, offices and contact information | Health, Certificates, Education, BarangayClearance | CMS page records with structured service props, rendered through existing ServicePageLayout. Original copy preserved as drafts. BusinessTrade's existing catalog redirect is preserved. |
| Authored policy, history, accessibility and community content | AboutUs, History, Accessibility, PrivacyPolicy, TermsOfUse, Cookies, CivicTechCommunity | PublishedPage content keys. Legal pages also support existing DB-managed legal settings. No static authored fallback. Original source retained outside production imports for review. |
| Header dropdown lists and footer government, judiciary, explore and social links | Header, Footer | navigation record; original menus imported and published as database content. Technical core route links remain constants. |
| Public action shortcuts | CitizenActions | actions record; existing shortcuts migrated and published. |
| Home mayor identity/message and marketing copy | Home, Hero | Saved officials and home content record. Identity/message sections omitted if unavailable. Generic navigation labels remain UI copy. |
| Resident FAQ copy | Help | help record. Existing report/contact UI remains. |
| Contact email, phone, address, hours, inquiry categories | Contact, Footer, Help, PageTitleManager, config defaults | Explicit administrator-editable contact settings; secrets excluded from public projection. Contact categories validated against current configuration. |
| Settlement categories and payment channels duplicated on client/server | Payments, citizenRoutes | Saved contact.settlementTypes and contact.paymentChannels settings, used for options and backend validation. Unconfigured options block submission. |
| Concern category dropdown | Help | contact.concernCategories setting. The legacy report workflow identifier is a supported technical operation, not a fabricated catalog item. |
| Organization identity/location on auth pages and metadata | AuthBranding, PageTitleManager, homepageMetadata | Saved general settings and contact settings. Removed fixed office street address from metadata. Brand assets retain legitimate default local assets. |
| Fixed census attribution | BarangayModal, BarangayDetail, Barangays | Configured source label or neutral published-record label; no unverified claim that any population is a 2020 observation. |
| Null population coerced into zero | publicApiDtos | Missing population remains null. No invented zero population. |
| Fixed public dataset topic filters | Data, Datasets | Actual public-data topics endpoint. Missing topics show empty state; dataset status no longer defaults to a claimed Ready label. |
| Staff request access automatically added to explicit legacy grants | config/permissions | Removed augmentation. Explicit saved grants are respected. Required CMS modules fail closed when permissions are missing. |
| Stale public/browser caches after successful writes | securityFetch, requestCache, routeRequests, public hooks | Successful mutations invalidate public/private data generations; late reads cannot restore stale cache values. Same-browser cross-tab changes use BroadcastChannel. |
| Resident dashboard, staff queries and service screens missing write subscriptions | CitizenContext, StaffOperations, EserviceUI, public page effects, PublicConfig, AuthContext | Refresh on writes, visible-page polling and focus, while preserving draft editor state and backend permission checks. |

Technical constants retained intentionally: HTTP/protocol/status identifiers, supported workflow kinds, route/module IDs, icon registries, accessibility text, UI prompts, localization dictionaries, supported file/security constraints, initial empty form fields, request retry jitter, and legitimate identity/formatting defaults. Password dummy hashes are timing protections, not dummy users.

Existing governmentOfficialsRepository compatibility projections originate from persisted CMS records; they are not a fabricated directory. Public-data/weather aggregation uses actual upstream observations and returns failure rather than made-up observations. Resident dashboard totals derive from account records, and staff aggregates are constrained by real permission policies; PostgreSQL tests verify that drafts and other departments are excluded.

Historical migrations 009/010/016/018/023/024 contain initial authored destination, department, category, or service records. These are maintained database records once imported, not runtime fallback datasets. The historical migrations were not rewritten. Their initial content accuracy and suitability for a fresh production installation remain a review obligation; this request does not certify those legacy seed descriptions.

## Modified/introduced files

Backend:

- database/migrations/postgresql/029_managed_public_content.sql
- server/src/repositories/managedContentRepository.js
- server/src/repositories/barangaysRepository.js
- server/src/repositories/officialsRepository.js
- server/src/services/managedContentRoutes.js
- server/src/services/apiEndpointPolicies.js
- server/src/services/publicApiDtos.js
- server/src/services/departmentRoutes.js
- server/src/services/departmentValidation.js
- server/src/services/citizenRoutes.js
- server/src/services/eserviceEngine.js
- server/src/services/contactRoutes.js
- server/src/services/homepageMetadata.js
- server/src/config/defaults.js
- server/src/config/permissions.js
- server/index.js

Shared client and CMS:

- src/hooks/usePublicResource.js
- src/services/dataChanges.js
- src/services/securityFetch.js
- src/services/securitySurfaces.js
- src/services/requestCache.js
- src/services/routeRequests.js
- src/services/publicDataApi.js
- src/services/directorySearch.js
- src/services/homepagePresentation.js
- src/context/PublicConfig.jsx
- src/context/CitizenContext.jsx
- src/context/AuthContext.jsx
- src/applicationModuleRegistry.js
- src/routeRegistry.js
- src/pages/admin/Admin.jsx
- src/components/AdminPublicContent.jsx
- src/components/PublishedPage.jsx
- src/components/ResourceOptionsStatus.jsx
- src/components/Header.jsx, Footer.jsx, AuthBranding.jsx, PageTitleManager.jsx
- src/components/Hero.jsx, CitizenActions.jsx, ServicesSection.jsx
- src/components/BarangayRelatedSection.jsx, BarangayModal.jsx, ResidentBusinesses.jsx
- src/components/StaffOperations.jsx, EserviceUI.jsx
- src/components/DiscoverGetafe.jsx, EventsSection.jsx, EventCalendar.jsx, ImportantAnnouncement.jsx, EmergencyAlert.jsx

Public/resident pages:

- src/pages/home/Home.jsx
- src/pages/info/AboutUs.jsx, History.jsx, Accessibility.jsx, Contact.jsx, Officials.jsx, OfficialProfile.jsx
- src/pages/legal/PrivacyPolicy.jsx, TermsOfUse.jsx, Cookies.jsx
- src/pages/community/CivicTechCommunity.jsx
- src/pages/services/EmergencyHotlines.jsx, Directory.jsx, Barangays.jsx, BarangayDetail.jsx, BarangayOfficial.jsx, BarangayOfficials.jsx, BarangayOfficialProfile.jsx, Health.jsx, Certificates.jsx, Education.jsx, BarangayClearance.jsx, BusinessTrade.jsx
- src/pages/departments/Department.jsx, Departments.jsx
- src/pages/discover/Discover.jsx, Destination.jsx
- src/pages/news/News.jsx, Article.jsx
- src/pages/events/Events.jsx
- src/pages/data/Data.jsx, Datasets.jsx, Barangays.jsx, BarangayStatistics.jsx
- src/pages/app/Setup.jsx, Help.jsx, Appointments.jsx, Payments.jsx
- src/pages/dashboard/Profile.jsx

Removed production data modules: src/data/barangays.js, citizenServices.js, getafe.js. Original content retained in artifacts/dynamic-data/legacy-source; these files are not imported by the production application.

Verification/import files:

- scripts/test-managed-public-content.mjs
- scripts/test-dynamic-content-ui.mjs
- scripts/test-request-cache.mjs
- scripts/test-routing.mjs
- scripts/test-homepage.mjs
- scripts/test-eservices.mjs
- scripts/test-six-issue-regressions.mjs
- scripts/test-departments.mjs
- scripts/test-public-pages-polish.mjs
- scripts/import-reviewed-public-content.mjs
- scripts/prepare-legacy-page-review.mjs
- artifacts/dynamic-data/legacy-content-review.json

## Storage and APIs

New tables:

- managed_public_content: stable key, title, kind, JSONB content, published state, optimistic version, editor and timestamp.
- managed_public_content_audit: content key, actor, operation, version, prior record and timestamp. Audit history survives unpublishing.

New routes:

- GET /api/public/content/:key — published record or item:null, no-store.
- GET /api/admin/public-content — CMS record list.
- GET /api/admin/public-content/:key — editable record including draft content.
- PUT /api/admin/public-content/:key — versioned create/update/publish/unpublish. Requires authenticated CMS editor plus content.news.manage. Writes and audit entries commit together; concurrent first creates serialize using a per-key advisory transaction lock.

Schemas validate content list/field types, known key-to-kind assignments, links, sizes and nesting, and sanitize authored rich HTML. Editors see conflicts rather than overwriting later changes. Removing content from public view uses unpublishing; a permanent-delete operation is not implemented.

Existing sources reused: site_pages; government_people/positions/assignments; departments/department_services; services/service_categories and their forms/workflows/fees; news/categories; destinations; resident records, applications, appointments, documents, payments, settlements and notifications; RBAC group/policy tables; administrator configuration settings; configured upstream public-data and weather APIs. No fixture response is installed in the application.

New public settings include contact.email/phone/address/hours/categories/populationSource/settlementTypes/paymentChannels/concernCategories and general.locationLabel. contact.concernServiceId is reserved configuration; it does not yet replace the legacy built-in concern workflow. Public configuration uses an explicit whitelist and excludes credentials. Inquiry/settlement/category settings are multiline where necessary.

## Migrations and data handling

Ran npm run migrate:postgres and verified 029_managed_public_content.sql is recorded in schema_migrations and the new tables exist. An unrelated mobile-verification migration in the shared workspace is outside this report.

Executed the one-time legacy extraction/import against the local development database. It creates only missing content keys, writes audit entries, and never overwrites edited records. Ten records were preserved: navigation and actions published to maintain existing menus; hotlines plus four service-guidance pages and three policy pages remain unpublished drafts. The optional navigation-preservation step checks the original import actor, version 1, and exact content equality before publication. Running either import again is safe and preserves existing records.

No old statistics were automatically published. No database user accounts, resident transactions, existing office records or operational settings were bulk replaced. Isolated QA keys/rows are deleted by their tests.

## Verification evidence

Final passing checks (counts describe each suite independently):

| Check | Result |
| --- | --- |
| Production frontend build | Passed, 2,042 modules transformed. |
| Source no-undefined-symbol check over src and server/src | Passed. |
| Managed content tests | 3 passed: missing/corrupt directories, schema/sanitization, real PostgreSQL publication/conflicts/audit/auth boundary. |
| Full e-service PostgreSQL/HTTP workflow suite | 34 passed: ownership, IDOR, real permissions, concurrent writers, fees, verified payments, billing, notifications, staff aggregates and pagination. |
| Six backend regressions with --experimental-vm-modules | 9 passed: authoritative token consumption, password/session rotation, file/row consistency, avatar cleanup, settlement idempotency. |
| Request cache tests | 14 passed, including mutation invalidation and late-generation protection. |
| Routing tests | 12 passed, including required module permission denial when permissions are absent. |
| Homepage tests | 9 passed. |
| Configuration tests | 9 passed. |
| Error presentation tests | 3 passed. |
| Appointment scheduling tests | 5 passed. |
| API policy audit | Passed: 259 policy entries and 223 declared handlers audited. |
| Department integration | Passed against PostgreSQL: eight office routes, CMS publication/update/unpublication, ownership rollback and permission boundaries. |
| Dynamic browser checks | Passed: hotline records/categories/counts, cross-tab save refresh, empty/error/retry, preserved structured service layout, mobile overflow and zero browser exceptions. |
| Public page browser checks | Passed for news, events, directory, services and contact at 320/390/768/1440px, including 100-page pagination, calendar toggle and search. |

Browser API responses are explicitly isolated test fixtures. They prove rendering and transport synchronization; separate real PostgreSQL/HTTP tests prove persistence and authorization. CMS route tests use an isolated authenticated-editor middleware harness; they are not a full live login/browser deployment test.

Screenshots: artifacts/dynamic-data/verified/hotlines-desktop.png and hotlines-mobile.png. Additional page screenshots are under artifacts/pages-polish/verified. The latest mobile screenshot was inspected visually.

Initial test failures were resolved: an e-service test required explicit saved barangay fixtures; department tests needed both database scopes initialized after the catalog switch; public directory tests needed explicit office fixtures after fallback removal; the six-regression harness needs Node's VM modules flag and explicit upload/settlement configuration. Final outcomes above are passing.

## Remaining limits and acceptance gaps

1. Eight migrated records are drafts. Public hotline/service/policy pages can therefore show empty states until an authorized editor reviews and publishes them. This is a visible rollout change, not a claim that content publication is finished.
2. home, help, page-about, page-history, page-community and page-accessibility still need authored/published CMS records. Their old source is retained for review where available. The current generic About renderer does not preserve its old specialized chart/table interactions. No substitute statistical values are displayed.
3. Same-browser tab changes propagate immediately through BroadcastChannel. Changes made by another device, application instance, or direct SQL are discovered through visible-page polling/focus, typically within 60 seconds. There is no database event stream or cross-device real-time push; the strict requirement for immediate propagation to every device is not fully met.
4. Contact inquiry, concern, settlement and payment options must be configured in CMS settings; no predefined operational options are installed. Existing configured organization/contact settings are used wherever available.
5. Historical initial-content migrations still require a production content review. No independent factual verification of hotline contacts, medical-service guidance, legacy demographic observations or tourism descriptions was performed. Do not interpret code/database tests as factual certification.
6. Full multi-device CMS/resident/staff login-to-change browser testing and production deployment/load testing remain unperformed. The report distinguishes isolated browser rendering from real database/API evidence.
7. Technical supported-operation enums, module route registries and legacy configuration role templates remain. Legacy settings grants are database-managed and no longer silently gain request access; the central resource policy engine continues enforcing actual backend access. Navigation around supported technical operations remains source-defined.
8. New content records use an existing content.news.manage permission; a separate public-content-specific permission and permanent delete are not introduced. Publishing/unpublishing covers public visibility changes and retains audit history.

The implementation is concrete and testable, but these acceptance gaps prevent claiming that the entire application is fully production-ready or that every original layout and instant cross-device update requirement is satisfied.
