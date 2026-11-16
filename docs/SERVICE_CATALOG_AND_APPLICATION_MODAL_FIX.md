# Service catalog and application modal repairs

Implemented locally on 9 October 2026. No service records, backend contracts, publishing rules or application workflows were changed.

## Service catalog root causes

- `/services` placed the catalog directly in a shared `.es-workspace` that has full-width, zero-padding application defaults. It omitted the centered public content container.
- `EserviceUI.css` styled the catalog as uncontained divider rows. Its classes did not define the requested card surfaces or a structured disclosure.
- The inner-page consistency stylesheet applies a 16px vertical margin to every `.ui-search`, separating the search control from its labels and filters. The catalog now overrides that rule within its own page only.
- The page's Popular Services section rendered a static category list. It now reads the existing CMS endpoint instead.

The hero retains its original Services & Departments image and overlay. A 1280px centered container aligns the heading, search, counts, cards and popular links. Cards use existing navy typography/actions and warm cream surfaces, subtle borders and no hover animation. Category and department filters are offered only when multiple values exist in the authoritative payload. Search includes name, office, category and description; trimming avoids accidental whitespace-only filtering. Filtering operates on the already-loaded catalog and does not issue additional reads.

The accordion uses an actual button with `aria-expanded` and `aria-controls`; keyboard Enter/Space works. It displays configured eligibility, documents, processing time and fees, including credits, or explicitly says that information is not listed. Expanding one card does not stretch neighboring cards into unnecessary blank space.

Popular links come from `/api/popular-services?limit=6`; duplicate destinations are deduplicated, with loading, error/retry and empty states. The backend supplies labels and destinations, so the UI does not invent requirements or metadata for these links. Existing detail URLs remain `/services/e-services/:slug` publicly and `/app/services/:slug` for residents. Public pages retain their existing session-free behavior: Apply opens the sign-in boundary with the intended resident service destination, and a signed-in resident returns to that destination.

### Database and actual API verification

A read-only audit used the real public service handlers and PostgreSQL data. At verification time:

| Stored services | Published | Currently public API entries | Operational catalog entries |
|---:|---:|---:|---:|
| 12 | 2 | 2 | 1 |

One published entry is `DIRECTORY`, which the existing operational catalog intentionally excludes. Thus **1 service available is correct**; no extra services were hidden by this change. Both public detail routes resolved and an unpublished service returned 404. Categories/departments use the existing server joins; requirements and fees use the configured service revision. Active CMS popular links were Certificates & IDs, Business Permit and Barangay Clearance, using their existing routes.

Actual React → HTTP service handlers → PostgreSQL rendering passed at 1440 and 390px. That audit never writes to the database. Public configuration/session/other provider boundaries are isolated in the browser audit; catalog and popular data are real.

## Application modal root causes

The complete `.staff-request-modal` was an `overflow:auto` scroll region, while the outer native dialog also allowed scrolling. Its sticky heading remained inside that content flow, and Save Update was at the end of a long form. Competing viewport/padding rules and hidden root scrollbars made the scrolling behavior harder to see.

`ModalFrame` now supplies an opt-in flex-column layout within the existing native `ModalDialog`. Its header and footer cannot shrink or scroll; only its body uses `min-height:0`, `overflow-y:auto` and contained overscroll. The outer dialog and frame do not scroll. The frame is centered within the current viewport, respects safe-area padding, and updates its available height from `visualViewport` resize events. It has no fixed content height, negative margin or absolute-positioned application content.

The header keeps the service title, reference, current status and close control visible. Cancel and Save Update remain in the footer. Staff status, visibility and remarks have explicit labels. Upload controls stack on narrow screens; histories have aligned status/date/visibility and full-width notes. The same frame is reused by the fulfillment confirmation dialog, preserving required status-specific inputs and the existing save handlers. Background locking, modal stacking, Escape handling, focus trapping/restoration and busy-close protection remain owned by `ModalDialog`.

Application-detail audit: the Resident legacy application view and Admin e-service request views are full pages rather than comparable application-detail dialogs. They retain their existing page layout. Unrelated Admin, Resident profile and editor dialogs do not opt into the new frame.

## Modified implementation files

| File | Change |
|---|---|
| `src/pages/services/Services.jsx` | Public container and real popular-links composition |
| `src/components/ServiceCatalog.jsx` | Integrated header/search/count, filters, cards and accessible accordion |
| `src/components/ServiceCatalog.css` | Scoped responsive public/catalog styling and search-margin correction |
| `src/components/PopularServiceLinks.jsx` | CMS-powered popular links with deduplication and states |
| `src/components/ModalFrame.jsx` | Reusable header/body/footer frame and visible-viewport sizing |
| `src/components/ModalFrame.css` | Single body scroll region and responsive constraints |
| `src/pages/app/StaffRequestModal.jsx` | Framed details form, persistent actions/status, explicit labels |
| `src/pages/app/StaffRequestModal.css` | Removed competing root scrolling; refined history/upload/action styling |
| `src/pages/app/FulfillmentNoteModal.jsx` | Reused the frame for the existing confirmation workflow |

## Tests and results

- `test-service-catalog-ui.mjs`: passed 1440, 1366, 1024, 768, 390 and 320px. Initial styles/hero/container, counts, directory exclusion, search, category/department filters, clearing/no matches, configured/empty accordion information, keyboard controls, popular-link deduplication, public return URL, authenticated application navigation, loading/error/retry/empty states and no browser exceptions. Catalog filtering triggers no additional service reads or private module calls; the shared visible public header retains its existing requests.
- `check-service-catalog-data.mjs`: actual public service HTTP handlers, publishing/count/detail/404 rules, CMS popular records, and real database browser rendering at 1440/390px passed. All SQL is restricted to SELECT.
- `test-application-modal-ui.mjs`: passed 1440×900, 1024×768, 768×1024, 390×844, 320×640, 844×390 and 720×450. Fifty history entries/twelve documents and short content; fixed header/footer; single body scroll; retained unsaved remark before/after upload; protected document link and upload operation; same-status save; status/fulfillment confirmation; focus wrapping, Escape and restored background scrolling. Enlarged text and a 720×450 viewport equivalent to 200% desktop zoom were also checked.
- `TEST_STAFF_ONLY=1 TEST_STAFF_BROWSER=1` e-service suite: **12 passed**. Actual HTTP/PostgreSQL scope, policy/count/filter/date boundaries, concurrent assignment, internal notes, status/approval constraints, notification durability, error recovery, recovery-code concurrency; browser flows at 320/390/768/1440 including assignment/private-note persistence. Temporary schemas are removed afterward.
- Existing service detail regression: passed 1440/768/390px, including business selection, request creation navigation, existing requests, loading/failure behavior and keyboard access. The fixture now supplies the existing CSRF endpoint's token.
- Existing Resident/Admin e-service UI regression: passed 1440/390/768px. Its fee assertion now verifies the description and amount in the same structured fee row.
- Existing staff processing regression: passed 390/1440px, including assignment, permission-filtered transitions, failure/draft preservation, assessment handoff and closed states.
- Production build, ESLint and undefined-name checks: passed.

Screenshots: `artifacts/service-catalog/live-data/` uses current read-only published records; other catalog/modal screenshots use explicitly isolated test data in their test harnesses.

## Remaining limits

Software keyboard behavior was not exercised on physical mobile hardware. Available-height resize handling, landscape, enlarged text and constrained viewports were verified in Chromium. No publishing/deployment was performed. The catalog count will correctly change when administrators publish, schedule or unpublish services. Existing CMS popular links may point to informational category pages, so they are presented as configured quick links rather than fabricated application records.
