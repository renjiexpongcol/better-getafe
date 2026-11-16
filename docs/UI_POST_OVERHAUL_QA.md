# Getafe Portal — post-overhaul QA and refinement

Reviewed 5 October 2026. This pass refines the implemented design; it does not replace its shells, tokens, navigation contracts, or domain workflows.

## Fixed

| Priority | Confirmed finding | Change |
| --- | --- | --- |
| BLOCKER | Cancelling the barangay editor could restore a cleared reference as a null entry and break the list. | Capture the original entry before scheduling the state update. Escape/cancel and reopening are exercised in the browser. |
| MAJOR | Media, gallery, content deletion, privacy, diagnostics, officials, barangay and weather overlays lacked consistent modal keyboard behavior. | Use the existing native dialog with background isolation, Tab/Shift+Tab containment, Escape, focus return, and viewport scrolling. Officials/barangay dialogs remain inside their owning forms to preserve validation. |
| MAJOR | Disabling a focused Save control could leave focus on the body. | The top dialog recovers keyboard focus after busy controls change; nested dialogs retain their own focus boundary. |
| MAJOR | Admin mobile navigation allowed focus into the background. | Isolate the content while the drawer is open, contain focus, and restore the menu trigger on dismissal. |
| MAJOR | Privacy review lacked pending feedback, duplicate-submit protection, and local failure recovery. | Guard the operation, disable controls while saving, retain the note on failure, show errors inside the dialog, and provide load retry. |
| MAJOR | Diagnostics save feedback/errors appeared behind the dialog or gave no saved confirmation. | Local error/success feedback, operation guard, and disabled busy controls. |
| MAJOR | A large balance was clipped inside its mobile summary panel despite zero page overflow. | Preserve wrapping and give the appointment/balance summaries full width on narrow screens. Keep the financial value legible. |
| MAJOR | Error Center filters exceeded the available width with the desktop sidebar at 1024px. | Flexible field tracks, two rows at intermediate widths, and constrained input sizing. |
| MAJOR | Several valid service, payment and admin routes reported “Page not found” in the browser title. | Add the missing route titles and polite route announcements. Authentication challenges have their own title and heading focus. |
| MAJOR | High-contrast privacy Save text had a measured 1:1 contrast ratio. | Correct the primary-action foreground; use semantic colors for modal copy, privacy fields and gallery selection. |
| MAJOR | CMS content columns lacked table semantics and a keyboard scroll target. | Expose named table/row/header/cell relationships and a focusable scrolling region. Retain every operational column. |
| MINOR | Service, reference and status were repeated without a clear next action. | Remove the repeated service name; identify the reference; explain what to do for drafts, corrections, payment and completion. |
| MINOR | Catalog requirement lists inherited the outer service-row styling. | Scope row styling to direct children; restore compact requirement lists and give service search a useful width. |
| MINOR | Public service detail had no main landmark; public navigation lacked an immediate skip link. | Add the landmark and an instantly visible keyboard skip link. |
| MINOR | Admin notification button had no handler or destination. | Remove the inactive control. |
| MINOR | Gallery filenames hid their distinguishing suffix; challenge headings/buttons retained oversized or bright-blue styling. | Wrap full filenames; use existing title sizing/navy action tokens; retain the current editor layout. |
| MINOR | Barangay “Save changes” only staged changes locally. | Call it “Apply changes” and explain the separate “Save barangays” publication step. Officials save now validates the owning form and announces completion. |
| POLISH | Diagnostic metadata used a card per value; catalog controls and reference headings were uneven. | Use divided metadata, aligned controls and the established type scale. |

## Remaining issues

- **MAJOR — backend summary scope:** Dashboard records come from the document-application workflow, not all configurable service requests and payment orders. The dashboard now explicitly states its scope and links to service requests and billing. A unified, permission-safe summary remains separate backend work.
- **MINOR — unavailable integration:** eGovPH sign-in remains unavailable because no adapter is implemented. The existing unavailable presentation is retained.
- **Verification gap:** Real-account coverage of every department/group combination, real CMS content, production gateway callbacks, screen readers, Windows forced-color settings, and every third-party weather/data response remains unestablished. This is not accessibility certification or exhaustive live-data coverage.

## UX decisions

- Preserve the separate document-application and configurable service-request routes, payment flows, and canonical API status values. Resident filter labels distinguish review, fee assessment and approval without altering their query values.
- Keep dense administrative tables scrollable with their operational columns. Resident request tables retain their stacked mobile records.
- Keep long editors spacious and scrollable; preserve staged barangay edits, native form validation, uploads, article autosave, service configuration and revision behavior.
- Keep office verification distinct from a resident submitting payment. Completion copy directs residents to issued documents or collection instructions.
- Use the existing visual hierarchy and tokens. Simplify diagnostic metadata and duplicate headers instead of introducing another visual system.

## Accessibility

Native-dialog focus and background isolation, busy-state focus recovery, focus return to gallery/media triggers, drawer containment, public skip navigation, CMS table semantics, route announcements, challenge heading focus, and reduced-motion scrolling were checked. Sampled privacy labels, fields, headings and Save actions meet 4.5:1 contrast in light, dark and high-contrast modes. Existing dashboard/button contrast regression checks also passed. These samples do not establish whole-site conformance.

## Verification

- Production build, lint and whitespace checks passed.
- **52 automated checks passed:** 25 routing/preferences/settings/auth checks and 27 controlled PostgreSQL/HTTP lifecycle checks, including ownership, document privacy, appointment rules, request concurrency, assessments, verification, receipts, reversals and business-billing completion.
- **59 surfaces × 6 widths** rendered using intercepted development fixtures: 320, 390, 768, 1024, 1280 and 1440px. The matrix covers the major public/auth/resident/staff/admin routes, including weather, articles, request details, CMS editors, access tools, service catalog, privacy and diagnostics. No runtime errors or page overflow remained in that matrix. Affected summary, auth, weather and admin list layouts were rechecked after subsequent refinements.
- **27 resident/staff routes × 6 widths** plus concern failure/retry, appointments, search, uploads, nested dialogs, Back behavior, notification navigation, pagination and access-denied states passed. A navigation timeout under concurrent browser load was rerun successfully for the remaining widths.
- Six-width overlay checks passed for official validation/save, barangay cancellation/staging, media/gallery focus return, content deletion cancellation, weather dialogs, public skip navigation, MFA and verification error states.
- Six-width privacy/diagnostics checks passed for error/retry, busy dismissal guards, save feedback, drawer focus, large balance display, route announcements and nested catalog lists. Theme samples and screenshots cover light/dark/high contrast.
- Existing service-detail checks passed at 1440/768/390; configurable service/draft/CMS journeys passed at 1440/390/768; staff assessment/processing checks passed at 390/1440; auth/category/theme regressions passed at 320/390/768/1440.
- Screenshots were inspected for representative populated mobile/desktop/dashboard/catalog/request/editor/dialog states. Automated page-overflow assertions were supplemented by panel-level balance checks and actual visual review. Not every generated screenshot was individually visually inspected.

Evidence is under `artifacts/ui-review/`. The 354-route-render report is `verified-screens/report.json`; final affected layouts are in `affected-final/`; final modal screenshots are in `overlays-verified/`; measured theme states are in `themes-final/`. Build, lint, unit and lifecycle logs are included. Screenshot destination overrides avoid Windows file locks on old artifacts; the lifecycle suite was rerun and passed after an initial screenshot-write failure.

## Backend/domain findings

The dashboard aggregation limitation is confirmed by `server/src/services/citizenRoutes.js`: its dashboard endpoint reads `applications`, `application_documents`, `payments` and `appointments`; it does not aggregate the separate configurable service-request/payment-order workflow. No backend change was made. No new financial or privacy-domain defect was established in this pass. Existing backend edits already present in the checkout were preserved.

Browser fixtures intercept API responses and writes. The lifecycle harness uses its disposable test schema. No production records were changed, and no deployment was performed.
