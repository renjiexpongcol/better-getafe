# Authentication return destinations

Implemented and verified on October 8, 2026. Password login, Google OAuth, MFA, email verification, registration and required onboarding converge on `resolvePostAuthDestination`. Final routing uses the established session rather than an approximate role inferred from an authentication response.

## 1. Root causes

The Google button did not send the intended destination. The Google callback used fixed admin/resident dashboards and omitted the destination from its MFA challenge redirect. Password, verification and MFA each had independent success redirects competing with the authenticated-user effect; the password response's `admin` boolean also classified staff as administrators. The route guard omitted URL fragments, and canonical routing stripped service form query parameters. Setup completion always returned to `/app`. Client session cleanup could erase a pending destination during successful authentication. Explicit logout could race with the unauthenticated guard and recreate a return URL.

## 2. Landing-page and public service links

Protected links enter the normal protected-route guard. Public service details use the same `loginDestination` helper when users select “Sign in to apply”; the destination is the matching `/app/services/:slug` plus the current query string and fragment. There is one return parameter format, encoded once with `URLSearchParams`.

## 3. Protected-route preservation

The guard captures `pathname + search + hash`, then replaces the protected entry with the shared login URL. Residents already signed in but requiring setup save the complete guarded URL in their tab before entering setup. Explicit logout opens plain Sign in instead of creating a new intended destination.

## 4. Password login

Password success refreshes the authenticated session. One login effect resolves, validates and authorizes the destination using that user, consumes the pending record and navigates with `replace`. Independent success-handler redirects have been removed. Failed attempts retain the query and tab record. Authenticated users opening Sign in use this same effect.

## 5. Google OAuth

The Google button includes the full validated intended URL. Initiation associates that URL with the existing random server-side OAuth state record, with the existing ten-minute lifetime and PKCE verifier. State remains an opaque random value; no destination is placed inside it. The callback verifies the matching state cookie, consumes the one-use state, verifies PKCE and exchanges the provider code using the original verifier.

After session issuance, the callback enters the shared login completion page with the recovered destination. That page checks the actual authenticated session and invokes the same resolver as password login. This also fixes staff Google login being sent to the admin shell. Validated cancellations, provider failures and existing-account signup responses preserve the destination and allow password sign-in. Tampered/replayed state remains rejected.

## 6. MFA and verification

MFA and email challenges do not consume the destination. Successful MFA now refreshes the full authenticated user, including effective permissions and onboarding status. Email verification does the same. Google MFA retains `returnUrl` in the query and keeps the one-use challenge in the fragment; the page clears that challenge fragment after reading it. Required password renewal retains the flow while the user updates the password and signs in again. Password recovery does not clear tab intent.

## 7. Registration and onboarding

Switching authentication tabs keeps the destination. Registration establishes or verifies the session before the shared resolver runs. If the session requires setup, `/app/setup` is an intermediate destination and the intended URL remains pending. Completing setup first saves the profile, completes the server onboarding operation and refreshes the session to confirm setup is complete. Only then does the resolver consume the pending destination and replace the setup page. Setup failure leaves intent intact. Completed setup cannot itself be a final return destination.

## 8. Open-redirect validation

Only bounded, same-origin internal paths are accepted. Absolute URLs, protocol-relative URLs, encoded protocol-relative paths, backslashes, control characters, malformed encoding, authentication/logout/callback/API/error destinations and unknown routes fall back safely. The SPA registers its real auto-discovered page manifest with the resolver, so validation follows the router's current pages. Admin/staff routes use their existing canonical registries. Legacy root query selectors are rejected because they can select a different module after authorization. Invalid intent never causes authentication to fail.

## 9. Authorization

The existing `getProtectedRouteState` checks shell access and the existing `resolveModuleAccess` checks admin/staff module permissions. Resident accounts cannot return to staff or admin pages. Admin/staff defaults select the normal dashboard when authorized, otherwise an authorized registered module, finally the public home page. Resource ownership continues to be enforced by the existing page/API checks; this change does not grant access to records or files.

## 10. Lifecycle, tabs and history

Pending intent uses tab-scoped `sessionStorage`, expires after ten minutes and is cleared after final resolution, explicit/remote logout and existing session-expiry cleanup. Successful password/registration/MFA cleanup preserves it until final resolution. No intended URL is stored in `localStorage`. OAuth adds the server state association to survive full-page navigation. Separate tabs have separate client records. Expired or unavailable storage falls back safely; when browser storage is disabled, query-based authentication still works, but intent cannot persist across a separate setup/recovery page without storage.

All final redirects replace the authentication/setup history entry. The final browser-history state identifies the resolved complete URL so ordinary query cleanup does not strip its parameters. That marker changes URL preservation only; it does not bypass role, module or server authorization. Service form parameters also retain their original encoding in ordinary navigation.

## 11. Changed implementation files

- `src/authNavigation.js`: shared internal URL validation, route authorization, defaults and tab intent lifecycle.
- `src/routeConfig.js`, `src/routes.js`: expose existing route overrides and register the actual page manifest.
- `src/routeRegistry.js`: preserve service form queries.
- `src/App.jsx`: complete protected URL capture, setup preservation, explicit logout handling and final URL preservation.
- `src/context/AuthContext.jsx`: preserve active intent during session establishment, refresh MFA session metadata and distinguish explicit sign-out.
- `src/pages/auth/Login.jsx`: one final redirect effect, verification session refresh and Google intent propagation.
- `src/pages/app/Setup.jsx`: confirm completion and resume the pending authorized destination.
- `src/components/ServiceDetails.jsx`: shared public-service login destination.
- `server/index.js`: state-associated OAuth destination, common completion bridge, MFA/cancellation/error preservation.

The existing authentication styling, logo, tabs, forms, background, cookie security, CSRF, rate limits and cryptographic OAuth protections are retained.

## 12. Tests and checks

New tests:

- `scripts/test-auth-destinations.mjs`: complete URL encoding, unsafe/unknown/unauthorized/legacy destinations, existing permission defaults, onboarding deferral, expiry and separate tab records.
- `scripts/test-google-destinations.mjs`: executes the actual initiation/callback handlers with a simulated provider and state store. Covers resident/staff/admin sessions, verifier propagation, replay/tampering, MFA, cancellation, provider errors, existing-account signup and malicious destinations.
- `scripts/test-auth-destinations-ui.mjs`: 19 browser scenarios, with session/API fixtures, including public links and Back history, direct URLs, failures/retries, password MFA, email verification, role defaults, Google initiation/cancellation/MFA, registration through verification and setup, guarded setup and logout cleanup.

Verification: 27 unit/routing/auth/OAuth tests passed; all 19 browser scenarios passed. The real-server HTTP isolation suite passed resident/staff/admin access boundaries, adversarial IDOR/CSRF/private-file/disabled-session checks, secure session issuance and one-use password-reset grants. Lint, undefined-variable checks and the production build passed.

Browser results: `artifacts/auth-destinations/browser-results.json`.

## 13. Authentication method and acceptance results

| Method | Result | Verification scope |
| --- | --- | --- |
| Password | PASS | Public service, direct URL, exact queries/fragments, failed retry, defaults, unauthorized fallback and already authenticated user |
| Google | PASS in automated tests | Actual callback handlers with simulated provider; browser initiation, shared completion, cancellation/password fallback and MFA |
| MFA | PASS | Password and Google challenge completion through the same resolver |
| Email verification | PASS | Sign-in and registration verification refresh the session and retain intent |
| Registration/setup | PASS | Required setup defers consumption; completion resumes the original service |
| eGovPH | Not applicable | Existing integration is unavailable and does not establish a session; no fake callback or authentication was added |

The ten requested acceptance scenarios are covered across the browser and callback tests. A live Google account consent/token exchange was not performed; provider credentials, redirect configuration and Google account behavior remain outside these automated fixtures. No deployment or commit was performed.

## Follow-up fixes from the edge-case audit

All four subsequently reproduced defects are fixed:

1. Session refresh cancels and removes the older shared `/api/auth/me` request before starting a fresh check. Successful sign-in cannot reuse an anonymous response from before cookie issuance. This also applies to MFA and onboarding refreshes.
2. Error normalization explicitly preserves the known safe “Current password is incorrect.” validation response. Password forms can display the correct error and the global session handler no longer treats it as session expiry. Actual expired-session responses still emit the expiry event.
3. Settings root aliases are resolved through `canonicalSettingsTarget` before destination authorization. Unknown categories fall back to the authorized default after login; direct unknown-category navigation displays the existing Not Found page.
4. Settings canonicalization consumes only the legacy category selector and preserves the remaining query encoding and fragment.

Additional changed files: `src/services/routeRequests.js` and `src/services/publicError.js`.

Regression command: `node scripts/audit-auth-edge-cases.mjs --regression`. It drives the actual global fetch wrapper and browser authentication/settings flows and exits unsuccessfully if any defect returns. Evidence is written to `artifacts/auth-destinations/edge-case-regressions.json`; the original audit evidence remains separate. Settings alias/category/permission checks were also added to `scripts/test-auth-destinations.mjs`. The 19 browser scenarios, targeted auth/routing/error tests, lint, undefined-variable checks and production build pass after these changes.
