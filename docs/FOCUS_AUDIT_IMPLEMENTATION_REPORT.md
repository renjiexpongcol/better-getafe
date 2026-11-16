# Application-wide focus audit and fix

7 October 2026

## Root cause

`src/focus.css` previously applied its blue ring to every `:focus-visible` element and reset every `:focus` outline globally. Browser heuristics can treat programmatic focus as focus-visible, especially during initial load or after keyboard navigation. ErrorPage deliberately focused its `h1[tabindex=-1]`, so the shared rule drew a rectangle around “Page not found”. Authentication challenge headings, application-step headings, skip destinations and dialog containers could encounter the same class of artifact.

## Shared correction

- Replaced the universal focus/reset selectors with selectors for native interactive controls, custom buttons/tabs/menu items and intentionally tabbable regions. Keyboard focus uses the existing 2px design-token outline and offset. Validation borders, selected states and elevation are preserved.
- Added `installFocusModality`, initialized before React mounts. Pointer/touch input removes an unsolicited keyboard ring from controls; keyboard input restores the shared indicator with native focus-visible eligibility. Keyboard shortcuts also select keyboard modality.
- Added `focusContentTarget`. It marks a static announcement target before focusing, preserves `tabindex=-1` and prevents scrolling. Only this marked content target receives the scoped ring suppression. It stays outside the normal tab sequence.
- Transparent switch inputs still indicate keyboard focus on their visible proxy. High-contrast and forced-color treatment remain intact.
- Removed the extra shared-search focus-within blue border so it does not compete with the keyboard outline.

## Route, error and authentication behavior

Route/error heading announcements remain focused and retain correct semantics. No screen-reader announcement was deleted. The helper now covers ErrorPage, application-step headings, authentication MFA/verification/password-renewal headings, the public skip link, the accessibility menu's skip action and setup review containers. All shared status/resource/module/maintenance errors inherit the correction. The sign-in and registration tabs retain their arrow/Home/End behavior. Verification-code and explicitly opened search autofocus remain intentional; ordinary authentication branding is not focused automatically.

The audit found legitimate `tabindex=0` uses for scrollable tables/event regions, weather pause controls, tooltips and custom clickable cards. These were preserved. No unnecessary heading/image `tabindex=0` was identified, and useful `tabindex=-1` targets were not blindly removed.

## Modal and skip-link verification

Native cookie preferences: pointer/touch opening, keyboard Tab/Shift+Tab containment, Escape dismissal, focus restoration and subsequent pointer removal of the ring passed. Existing officials, barangay, media, gallery, delete-content and weather dialogs passed containment and restoration checks. Public skip links remain visible and outlined when reached by keyboard; Enter moves focus to the main landmark without outlining the whole content area. Global accessibility controls are retained.

## Tests

- Shared-control focus suite with `FOCUS_SHARED_ONLY=1`: passed across **30 stylesheets**, including custom switches, disabled states, validation-border preservation, no layout shifts, high contrast and forced colors.
- App-wide route review with `UI_REVIEW_FOCUS=1`: **59 routes at each of 390px and 1440px**. Public, resident, staff, admin and authentication surfaces passed keyboard-ring and static-target checks, with no horizontal overflow or uncaught browser errors. Includes the requested dashboards, services, profile/settings, staff queues, CMS content/settings and public content pages.
- `node scripts/test-focus-lifecycle.mjs`: **36 passed** at 320px and 1440px. Covers status headings for 400/401/403/404/408/409/429/500/502/503/offline/application; pointer/touch and keyboard state; modal containment/restoration; skip links; sign-in/registration tab switching; password recovery; MFA; browser Back/Forward. Focus-event samples confirm marked static targets have no outline during initialization/focus events.
- Overlay regression suite at 390px and 1440px: passed officials validation/save, barangay staging, media/gallery return focus, delete dialog, weather dialogs, skip links, MFA and verification-error behavior. Fixtures now supply the current CSRF-token contract and acknowledge cookies for these unrelated overlay checks.
- `node scripts/test-error-pages-ui.mjs`: **63 passed** at 320, 768 and 1440px, including resident/staff/admin invalid routes and unauthorized access; private error headings have no outline.
- `npm run lint`, `npm run lint:undefined`, `npm run build`: passed.

These browser tests use fixtures only. They do not claim a full assistive-technology certification or every possible business-workflow state. Backend/API behavior and route contracts are unchanged.

## Files changed

Shared/global: `src/focus.css`, new `src/services/focusManagement.js`, `src/main.jsx`, `src/components/ui/Primitives.css`.

Focus consumers: `src/App.jsx`, `src/components/RouteStatusPages.jsx`, `src/components/DynamicApplication.jsx`, `src/components/BackToTop.jsx`, `src/pages/auth/Login.jsx`, `src/pages/app/Setup.jsx`.

Verification: `scripts/test-focus-ui.mjs`, `scripts/test-ui-review.mjs`, `scripts/test-ui-review-overlays.mjs`, `scripts/test-error-pages-ui.mjs`, new `scripts/test-focus-lifecycle.mjs`, this report.

Artifacts: `artifacts/focus-app-wide/`, `artifacts/focus-overlays/`, `artifacts/focus/`.

## Accessibility boundary

No universal `outline: none` hack was introduced. The old global reset was removed. Remaining important declarations are confined to interactive controls or visible switch proxies to override existing legacy resets. Static-focus suppression is restricted to explicitly marked content targets and the native dialog container, not all headings or all focused elements. Keyboard outlines remain available on interactive controls and intentionally navigable regions. A human screen-reader review remains recommended before release. No deployment was performed.

