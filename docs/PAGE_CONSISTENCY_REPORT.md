# UI and UX consistency update

7 October 2026

The restored landing-page layout is retained. This update strengthens the existing shared components used by public, resident, staff and admin pages, and aligns inner public-page presentation without changing backend APIs or permissions.

## Changes

- Shared buttons wrap long labels, have consistent icon touch targets, and expose busy/disabled state for linked actions. Unavailable links prevent navigation.
- Shared search fields respect supplied IDs, use readable mobile input text, and return keyboard focus to the input after clearing. Clear buttons have contextual accessible names and decorative icons are hidden from assistive technology.
- Shared forms use consistent input sizing, readable helper text and checkbox/radio accents; existing validation colors and associations remain intact.
- Page actions, section headings, pagination and metadata wrap within narrow widths. Numeric pagination uses tabular figures. Filter toolbars have valid group semantics.
- Inner public-page headings, subtitles, listing margins, control heights, feedback cards and mobile filters follow a shared styling layer scoped away from the homepage.
- News and Events reuse the same search, loading, error/retry and empty-state components. News adds a clear-filters recovery action. Existing API behavior is preserved.
- Events calendar styling is maintained separately from retired homepage styles, with consistent controls and mobile reflow.

## Validation

- `npm run lint`: passed.
- `npm run lint:undefined`: passed.
- `npm run build`: passed, 2,023 transformed modules.
- Route browser review: 59 public/auth/resident/staff/admin surfaces at each of 390px and 1440px, 118 route/viewport checks, no horizontal overflow or uncaught browser errors with stress fixtures. These are layout/runtime checks, not end-to-end business-process verification.
- Final News/Events review: four additional route/viewport checks after spacing refinements, with consent already acknowledged so the content can be visually inspected.
- `node scripts/test-page-consistency.mjs`: passed search clear/focus, supplied ID, associated form errors, unavailable-link navigation prevention, readable input size and 320px reflow checks.
- Test screenshots: `artifacts/page-consistency/` and `artifacts/page-consistency-final/`. Browser data is fixture-only and was not written to production.

## Files

Modified: `src/components/ui/Primitives.jsx`, `src/components/ui/Primitives.css`, `src/main.jsx`, `src/pages/news/News.jsx`, `src/pages/events/Events.jsx`, `scripts/test-ui-review.mjs`.

Created: `src/page-consistency.css`, `scripts/page-consistency-fixture.jsx`, `scripts/test-page-consistency.mjs`, this report.

Shared improvements propagate to existing consumers; this is not a claim that every legacy control was converted. Human screen-reader review and full workflow regression remain useful before release. No deployment was performed.
