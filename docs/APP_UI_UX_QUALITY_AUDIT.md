# App UI, UX and functional quality audit

Completed October 8, 2026. The existing public landing page, municipal branding, navy/cream design and authentication integrations remain in place. This pass fixes reproducible defects and improves workflow consistency rather than replacing the app's design.

## Scope

Reviewed 59 public, authentication, resident, staff and administration surfaces at 320px, 768px and 1440px: 177 page/viewport checks with long names, long service titles and populated lists. Checked page overflow, browser exceptions and representative screenshots. Exercised keyboard/dialog behavior, failure/recovery states, authentication, onboarding and mobile content administration. Ran the database/HTTP e-service and runtime-resilience suites for functional coverage.

## Findings and changes

| Finding | User impact | Fix |
| --- | --- | --- |
| Password recovery cooldown depended on exact error wording | The submit button remained available during a server cooldown, without a useful countdown; the handler silently ignored repeat clicks | Derive the disabled state from the cooldown itself, show the remaining time and keep the error visible |
| Setup review dialogs did not contain keyboard focus | Tab could leave the modal and reach obscured controls | Reuse the app's native `ModalDialog`, including focus containment and background isolation |
| Back from setup review could immediately return to review | Users whose password was already set could not revisit the address step | Skip the completed password step in both directions; Back and Escape reach the editable step |
| Escape and Back were available during setup saving | Users could leave a pending save, lose visible feedback or attempt overlapping actions | Block closing/navigation while saving and guard the mutation with a synchronous in-flight ref |
| Setup save errors were behind the overlay | The visible dialog gave no explanation for a failed save | Render errors inside the active dialog and allow retry once the request completes |
| Citizen save failures used service-loading copy | Saving profile details incorrectly reported that municipal services could not be loaded | Use the existing form error context for citizen mutations |
| Mobile news administration required sideways scrolling to reach status and actions | Editors could see titles but had to discover horizontal scrolling to edit/delete or inspect publication status | Stack row metadata with labels on narrow screens; keep status and Edit/Delete in view while retaining table semantics and the desktop layout |
| Setup claimed completion before its final save | Failed saves still displayed “Account setup complete” | Use “Finish account setup” and explain that the final action saves the details |

Additional polish: mobile setup inputs and navigation controls have a 44px minimum height; inputs use a 16px mobile font; setup error colors use semantic theme tokens. Error contrast was measured in light, dark and high-contrast themes and passes 4.5:1.

Adopting the native dialog exposed a redundant page scroll lock. That lock was removed, and registration/onboarding completion now explicitly tests that document scrolling is restored after navigation. No backend authentication, permission, payment, rate-limit or data-integrity rules were loosened.

## Verification

- All **177 page/viewport checks** passed after the layout changes, with no detected document horizontal overflow or browser exceptions in those fixtures.
- **9 new browser regression cases** passed across 320px and 1440px. These exercise cooldown state, keyboard containment, editable Back navigation, rapid double activation of Finish Setup, busy Escape/Back protection, visible save failure and mobile news actions. Save-error contrast is checked in three themes.
- **19 authentication browser scenarios** passed, including registration through verification/setup and restoration of document scrolling afterward.
- Existing overlay checks passed at **320px and 1440px**, including officials validation/save, barangay editing, media/gallery/delete confirmation focus return, weather dialogs, public skip links, MFA and verification error states.
- **38 e-service, error-handling and runtime tests** passed. Coverage includes database/HTTP lifecycle, ownership and department boundaries, concurrency, private uploads, appointments, assessment rollback, payment replay/amount checks, notifications and dependency recovery.
- Lint, undefined-variable checks and the production build passed.

Evidence: `artifacts/app-quality-audit/screens/report.json`, `artifacts/app-quality-audit/flows.json`, representative screenshots under `artifacts/app-quality-audit/screens`, `flows` and `overlays`, and `artifacts/auth-destinations/browser-results.json`.

## Files changed in this pass

- `src/pages/auth/ForgotPassword.jsx`
- `src/pages/app/Setup.jsx`
- `src/citizen.css`
- `src/services/citizenData.js`
- `src/pages/admin/Admin.jsx`
- `src/pages/admin/AdminDashboard.css`
- New `scripts/test-app-quality-flows.mjs`
- Updated `scripts/test-auth-destinations-ui.mjs` and `scripts/test-ui-review-overlays.mjs`

The browser suites use isolated API fixtures; the e-service suite exercises database/HTTP behavior. Live Google consent, live eGovPH authentication, real payment-provider checkout and physical-device keyboards were not exercised. These results describe the tested flows, not a guarantee that every possible app defect has been eliminated. No deployment or commit was performed.
