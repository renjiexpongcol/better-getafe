# Error-page audit and implementation

7 October 2026

## Audit

The existing shared implementation was `src/components/RouteStatusPages.jsx`, used by status previews, route exceptions, resource fallbacks and private module/access errors. It supplied icons, a fixed public home action and blind `navigate(-1)`. App's protection boundary additionally selected its own dashboard destination. Maintenance had a separate icon/card presentation. The shared inline danger alert also carried a decorative status icon. Settings/Home section boundaries already use local text and recovery controls; they remain local to preserve drafts and unrelated content.

## Changes and files

- **`src/components/RouteStatusPages.jsx`**: removes all status/resource/action icons and decoration elements. Keeps one plain centered presentation with code, heading, description, actions and contextual help. Adds session-aware destinations, validated caller-provided destinations, explicit safe Go Back links, duplicate-action suppression and restrained retry rules. Resource errors now show 404 first. Compact rendering uses a section rather than a nested main landmark.
- **`src/services/errorNavigation.js`** (new): centralizes public/resident/staff/admin navigation. Uses existing `getProtectedRouteState`, `resolveModuleAccess`, module registry and route constants. Rejects external, protocol-relative, query-bearing, unknown or unauthorized previous destinations. Setup/incomplete/unavailable sessions fail closed.
- **`src/context/ErrorNavigation.jsx`** (new): records successful in-app route visits in memory and marks error visits invalid. Does not trust referrers, browser-history length or history.back. Direct entries have no previous route. Routes and destinations are checked again against the current session before offering Go Back.
- **`src/main.jsx`**: mounts the navigation tracker within the router, outside session providers, so it persists across surfaces without bootstrapping authentication.
- **`src/App.jsx`**: removes duplicated dashboard-selection logic from access-denied rendering. Existing redirects, session isolation, configuration failure and maintenance enforcement remain intact.
- **`src/components/MaintenancePage.jsx`**: reuses the shared 503 presentation; removes its icon and standalone decorative card. Retains configured message and valid expected-completion information in Philippine time.
- **`src/components/ui/Primitives.jsx`**: removes the decorative icon from shared danger alerts. Informational/status controls are not changed into error pages.
- **`src/page-consistency.css`**: centered icon-free spacing, responsive code sizing, consistent 44px actions, wrapping/stacking and readable help. Global accessibility control remains in place.
- **`scripts/test-error-navigation.mjs`** (new): six navigation/security/history tests.
- **`scripts/test-error-pages-ui.mjs`** (new): browser status, session isolation, authorization, cooldown, direct-entry and internal-back checks at three widths.
- **`scripts/test-routing.mjs`**: updates the obsolete hard-coded home/back source assertions to check centralized navigation integration.
- **This report**: `docs/ERROR_PAGE_IMPLEMENTATION_REPORT.md`.

## Pages and routes covered

The shared system covers 400, 401, 403, 404, 408, 409, 410, 422, 429, 500, 502, 503, 504, offline and unexpected/application errors. It also covers the route error boundary, configured maintenance, article/event/service/official/barangay/document resource errors, resident/staff unknown paths, admin/staff missing modules and access-denied pages. Existing inline form validation, dashboard request failures and settings-section errors retain their local recovery behavior. No backend response contract or unrelated workflow was changed.

## Navigation

| Context | Authorized safe destination |
|---|---|
| Public portal | Back to Home → `/` |
| Resident | Back to Dashboard → `/app` |
| Staff | Back to Staff Dashboard → `/app/staff` |
| Admin CMS | Back to Admin → `/admin`, when the dashboard permission allows it |
| Unauthorized surface | Destination selected from actual allowed role/session; otherwise public home |
| 401 without a session | Sign In → `/auth/login` |

Public pages read the optional existing auth context only; they do not request a session. Unauthenticated protected entries retain the existing sign-in redirect. Retry is offered for transient/read/render errors and existing explicit recovery callbacks. 429 without a reliable retry deadline does not invent an immediate retry; a supplied deadline disables Retry until elapsed. 409/422 default to safe navigation rather than replaying a failed mutation. Go Back is an explicit internal destination, offered only after a successful recorded visit and current authorization validation.

## Validation

- `node --test scripts/test-error-navigation.mjs scripts/test-routing.mjs`: **18 passed, 0 failed**.
- `node scripts/test-error-pages-ui.mjs`: **63 passed** at **320, 768 and 1440px**. Covers every shared status, no icons/placeholders, no horizontal overflow, exact codes, direct URL entry, correct resident/staff/admin destinations, resident denial of admin access, anonymous protected-entry sign-in redirect, valid internal back navigation and zero public session requests. Also verifies 429 cooldown disables/re-enables Retry and no uncaught browser errors.
- `npm run lint`: passed.
- `npm run lint:undefined`: passed.
- `npm run build`: passed.
- Screenshots: `artifacts/error-pages/404-320.png`, `404-768.png`, `404-1440.png`. Browser fixtures are test-only.

## Remaining edge cases

Go Back is deliberately conservative: only established public destinations and authorized module destinations are accepted; dynamic detail URLs, query-specific list states and most admin submodules are omitted when reliable authorization/history cannot be established. Public pages do not know a private session that has not been loaded, so their fallback stays public. A direct reload resets the in-memory previous-route record and hides Go Back. Browser checks validate layout and navigation; they are not a screen-reader certification or an end-to-end test of every failed business transaction. No deployment was performed.
