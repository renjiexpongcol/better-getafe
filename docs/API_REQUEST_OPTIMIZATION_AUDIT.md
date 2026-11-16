# Getafe Portal request and computation audit

This audit covers 187 frontend source files, the 69 generated page-route components, the additional resident/staff/admin module routes, 240 network call sites and the backend's 231 method/path policy entries. Static request candidates and import dependencies are in artifacts/network-audit/source-inventory.json; actual browser traffic for 59 representative pages at both 390px and 1440px is in artifacts/network-audit/all-routes/report.json. Action-only requests are distinguished from initial route requests by their consuming handlers and browser interaction checks.

## 1. Weather root cause

AppContent rendered the public Header for every non-authentication/non-app pathname, including the wildcard 404. Header rendered HeaderWeather unconditionally. CSS hid desktop header actions below 981px, but the widget still mounted, fetched /api/weather/getafe and installed its timers. StrictMode's initial effect cleanup/remount produced two weather requests.

## 2. Weather scope

App now identifies registered public routes before enabling public header features. Error views signal their mounted state through RouteActivity; Header disables feature widgets on errors/offline views. Header mounts weather only when its desktop region is visible. Auth, resident, staff and admin surfaces do not mount it. Leaving the surface or narrowing the viewport unmounts the widget, aborts its subscription and clears refresh/retry/slide timers. Hidden tabs skip refreshes and slide/clock state updates; weather resumes when due.

## 3. Unnecessary global/shared requests found

- Public weather and configuration on unknown public routes.
- Public weather when the desktop header was CSS-hidden.
- Every admin page requesting /api/admin/news?limit=100, /api/categories, /api/officials and /api/barangays regardless of module, including module errors and insufficient module permissions.
- Media library preloading on department/destination list pages before an editor or picker opened.
- Department editor options preloading on the department list.
- Resident header search fetching the service catalogue before any query was entered.
- Staff e-service record pages also fetching the unrelated legacy /api/staff/applications/:id record.
- Duplicate session, service catalogue, staff dashboard, public data coverage, resident application detail, staff utilities, destinations, privacy and error-log reads during effect replay.

## 4–8. Requests removed by surface

Public: unknown routes no longer request public config or weather; narrow headers no longer request weather; coverage reads coalesce. Legitimate homepage news, notices, services, events and destinations remain.

Resident: no public weather, admin or staff APIs; duplicate catalogue reads are eliminated; inactive header search does not fetch the catalogue. The resident dashboard aggregate remains because the rendered resident shell consumes profile/avatar and notification information from that existing contract.

Staff: no resident dashboard/preferences or public weather; e-service details no longer request legacy application details. Staff notifications and settings load only on their modules. /api/admin/settings on the authorized staff settings module is an existing, deliberate shared consumer, not an accidental admin bootstrap.

Admin: unrelated content/directory requests are removed from users, access, settings, media, departments, service catalogue, destinations, privacy and diagnostics. The dashboard retains news/categories for displayed statistics. Officials/barangays modules retain the directory lookups required by their editing controls. Editors/pickers load media only when used.

Auth/Error: unknown public/auth routes and explicit development error previews make no API calls. Valid auth routes retain session restoration and minimum public configuration. Unknown protected paths retain the minimum session/access boundary; they do not load protected feature data. /admin/content is an unregistered module and remains a 404 rather than silently becoming a new page.

## 9. Provider/hook boundaries

PublicConfig can be disabled for unknown/error routes while protected surfaces retain fail-closed configuration handling. AuthProvider remains limited to registered auth/protected surfaces; unknown auth paths skip it. ResidentPreferencesProvider mounts only for authorized resident pages, excluding staff and unknown resident pages. CitizenProvider remains inside CitizenLayout and does not mount on staff/admin/public/error routes. RouteActivity communicates rendered error state without scattering route checks through data hooks.

## 10. Deduplication

routeRequests coalesces in-flight reads with separately owned subscriber signals. A zero-delay final release lets StrictMode's immediate remount rejoin without disabling StrictMode. One departing subscriber cannot abort another subscriber's work. No duplicate API URLs were recorded in the final 59-page checks at either viewport. Unit tests verify shared cancellation/remount behavior. Private caches are memory-only, scoped, cleared on session teardown and invalidation; service catalogue caches are short-lived and invalidated by service edits.

## 11. Polling/background computation

Header weather refresh/retry/rotation and clocks clean up on unmount; hidden tabs skip non-critical updates. Home notices skip hidden-tab refreshes and stale updates. Weather-page refresh/clock clean up on departure. Staff queue refresh remains within the mounted queue and already pauses in hidden tabs. Config refresh retains maintenance/security freshness on genuine consumers. Session recovery polling retains its security purpose and runs only within the auth surface. Authentication challenge cooldowns and CAPTCHA readiness timers remain scoped and clean up. Error-navigation DOM observation now disconnects once the route settles instead of scanning every later content mutation.

Three-minute observation of representative error, auth, admin and staff pages is present in the historical regressions.json artifact. It is not a fresh capture from this resumed audit. No rate limit was increased.

## 12. Cancellation and cleanup

Shared request subscriptions abort the underlying fetch after the last consuming subscription leaves. Session restoration, resident preferences/dashboard, staff dashboard/legacy details, weather, access management, privacy reads and e-service route reads use this boundary. useEservice forwards route signals to its loaders, including billing/account/order/catalogue/queue/detail consumers; refreshes supersede old requests and sequence guards reject stale results. Public data/destination reads reuse the same abstraction. Existing guards on other cached public reads are retained; useful already-shared public cache work is not indiscriminately cancelled for a single consumer.

## 13–14. Code splitting and heavy modules

The existing page manifest already lazy-loads public/auth/resident/staff/admin routes and the map library. Added splits: admin settings, access management, departments, destinations, service catalogue, privacy and diagnostics; staff e-services, utility pages and request modal; resident account settings/profile content and footer. Account forms load when the modal opens; staff details load when a record opens. No route prefetch-all mechanism was found. Tiny universal accessibility/navigation utilities remain shared. Global CSS remains shared; this audit does not claim a CSS redesign or zero base JavaScript.

## 15. Before/after network measurements

Cold browser contexts, fixed synthetic API responses, 1440px viewport, retained development StrictMode. These request counts measure frontend orchestration, not database latency or real provider costs. Transferred/decoded sizes below are browser ResourceTiming resource sums; they exclude the navigation document and reflect uncompressed development modules, external resources and development prebundling. Total/byte changes are therefore diagnostic, not a production performance percentage claim. API calls and their paths are fully listed in the JSON captures.

| Route | Total requests | API calls | Repeated API URLs | Transferred MiB | Decoded JS MiB |
|---|---:|---:|---:|---:|---:|
| / | 162 → 122 | 9 → 8 | 1 → 0 | 17.81 → 17.83 | 12.93 → 12.94 |
| /missing-audit-page | 59 → 58 | 3 → 0 | 1 → 0 | 15.58 → 15.60 | 12.91 → 12.92 |
| /auth/login | 61 → 62 | 3 → 2 | 1 → 0 | 14.62 → 14.64 | 12.92 → 12.93 |
| /auth/login?mode=register | 61 → 62 | 3 → 2 | 1 → 0 | 14.62 → 14.64 | 12.92 → 12.93 |
| /app | 82 → 76 | 9 → 5 | 4 → 0 | 15.07 → 14.78 | 12.95 → 12.94 |
| /app/services | 84 → 78 | 9 → 5 | 4 → 0 | 15.07 → 14.78 | 12.95 → 12.94 |
| /app/staff | 77 → 65 | 5 → 3 | 2 → 0 | 14.95 → 14.53 | 12.93 → 12.93 |
| /admin | 99 → 70 | 11 → 4 | 5 → 0 | 16.01 → 15.16 | 12.97 → 12.93 |
| /admin/content | 99 → 68 | 11 → 2 | 5 → 0 | 16.01 → 15.15 | 12.97 → 12.93 |
| /admin/news | 99 → 70 | 11 → 4 | 5 → 0 | 16.01 → 15.16 | 12.97 → 12.93 |
| /admin/users | 101 → 73 | 13 → 3 | 6 → 0 | 16.01 → 15.36 | 12.97 → 12.93 |
| /admin/settings | 100 → 73 | 12 → 3 | 5 → 0 | 16.01 → 15.36 | 12.97 → 12.95 |

The following historical production-after snapshot uses fixed API fixtures with the then-current built assets. It is not a live account capture. It omits `/admin/media`, and the News route still records `limit=100`; current `Admin.jsx` requests 20 for the News table, 5 for the dashboard's recent list, and 100 only for the content editor picker. The snapshot is therefore not a valid current before/after comparison and is retained only as historical data. No fresh browser capture could be made in this workspace because Playwright's Chromium binary is absent. The current production build was rebuilt successfully; it has a 268.5 KB base JS entry (86.7 KB gzip), a 111.4 KB admin shell (29.5 KB gzip), and route-specific Settings and access modules. There is no valid captured production-before/after route table, so no production byte-reduction claim is made.

| Measurement | Current verified value |
|---|---:|
| Base JS entry | 268.5 KB (86.7 KB gzip) |
| Admin shell chunk | 111.4 KB (29.5 KB gzip) |
| Browser route requests | Not recaptured (Chromium unavailable) |
| Signed-in avatar transfer | Not measured (requires a real admin session) |

The six requested route families map to `/`, `/auth/login`, `/admin`, `/admin/news`, `/admin/media`, and `/admin/settings`. Historical fixture captures exist only for the first, second, third, fourth, and sixth. There is no verified current production measurement for `/admin/media`. The historic figures also do not capture the signed-in account's avatar bytes: the avatar endpoint returns private image data and requires a real admin session. The reported 2.1 MB network value on the original screenshot cannot be attributed to the avatar from these artifacts. Avoid using it as an avatar baseline.

Current source-level request expectations: homepage needs public config, visible desktop weather, homepage news/notices/events, popular services and featured destinations; login restores the session through `/api/auth/me` and loads public config; Admin dashboard restores the session and loads the five recent news items plus categories; News & Events loads its 20-row page and categories; Media Library loads its paged `/api/media` query when that module opens; Settings loads its selected settings category. Admin public-config is disabled in current `App.jsx`; its presence in historical captures is stale. No admin API is requested by public pages. The admin shell's session request is needed for authentication and permission navigation. A current signed-in browser capture is needed to verify shared cache/CDN headers and avatar transfer size.

## Backend/external service audit

The weather aggregator already provides a 15-minute memory/Redis TTL, per-location in-flight deduplication, forecast locking/deduplication and on-demand provider calls. No weather startup poller was found; changing that working cache was unnecessary. A new regression verifies concurrent callers reuse provider work and subsequent reads reuse the TTL result. ConfigService already serializes refreshes and bounds ordinary reloads to 30 seconds. Public APIs bypass private account/permission work through the established public allowlist; protected APIs retain account validation and permission/ownership checks. Email/e-service fulfillment workers, lifecycle checks and orphan cleanup are purposeful server jobs and remain independent of browser route lifetime. Startup dependency validation remains intact. No real paid provider calls were made by the browser fixtures or weather cache regression.

## 16. Verification

- Current resumed-audit checks: production build passed; ESLint on inspected source and the modified regression script passed; request-cache tests passed (14/14); route-request tests passed (4/4); JavaScript syntax checks passed.
- Existing artifacts report 59 routes at two viewports and a three-minute background observation, but those browser runs were not repeated in this resumed audit. Their captures are stale relative to current code: they include admin public-config and a 100-item News request.
- Browser regression execution is pending because Playwright Chromium is not installed. The route-network script now includes dashboard five-item, News 20-item and Media Library module assertions, and a flow for opening the editor's “Select from Media Library” picker. The new assertions are syntax-checked only, not executed.
## 17. Security and behavior

No endpoint was exposed, rate limit raised, permission broadened, CSRF validation bypassed, ownership check removed, database schema changed or API response contract redesigned. Mutations continue through existing securityFetch with fresh CSRF tokens and remain non-replayed. Authorization precedes expensive module effects. Error/config outage paths retain protected fail-closed behavior. Municipal branding, forms and workflows retain their existing design.
