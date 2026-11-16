# Setup contact details and mobile verification

Verified 12 October 2026 (Asia/Manila).

## Reproduced problem

After saving a Google account's full name and mobile number, a partial profile update (for example, an address edit) returned HTTP 422 with “Provide your full name and a valid mobile number (10–15 digits).” The handler checked only the incoming body and replaced omitted profile fields with empty values. The setup screen also allowed interactions before its saved-profile request settled.

## Changes

- Profile updates lock and read the saved profile, merge supported incoming fields, validate the resulting profile, and preserve omitted fields. Invalid names and numbers get specific errors.
- Setup waits for saved details before accepting input and saves contact details at the contact step. Loading failures offer a retry without submitting an empty profile.
- Shared mobile formatting accepts spaces, parentheses, dots, hyphens and country prefixes. Philippine numbers use the existing `09…` format so appointment prefills remain compatible; SMS delivery converts them to the provider's `639…` format.
- Residents can send and confirm a six-digit SMS code during setup or from their profile/account settings. Challenges use the existing hashed, expiring, single-use authentication state with bounded attempts. The server binds the proof to both the account and the saved number.
- Number changes clear `mobile_verified_at`; equivalent formatting preserves it. Clients cannot set verification timestamps or supply a different SMS recipient.
- Sending has a 30-second cooldown and a per-account limit. Both endpoints also use the existing strict OTP traffic policy and normal resident, CSRF and input-validation boundaries.
- Failed verification returns a validation response, so a wrong code does not trigger the frontend's expired-session handling.
- Migration `029_mobile_verification.sql` adds the verification timestamp and has been applied locally.

## Configuration

Admin → Settings → Authentication → Mobile number verification:

- Enable mobile number verification (default on).
- Require mobile verification during Google account setup (default off; enforced on the server).
- Semaphore SMS API key (encrypted and masked by the existing settings system).
- SMS sender name (use the provider-approved sender or its registered default).

Existing `SEMAPHORE_API_KEY` and `SEMAPHORE_SENDER_NAME` environment variables remain fallbacks. `MOBILE_VERIFICATION_ENABLED` and `REQUIRE_MOBILE_VERIFICATION` supply policy defaults. Required verification cannot be saved without enabled verification and an SMS key. Optional verification does not block setup if SMS is unavailable.

The local installation currently has no SMS API key. No SMS was sent to a real recipient during verification; delivery tests mocked the provider. SMS request and response handling follows the [Semaphore API documentation](https://api.semaphore.co/docs).

## Verification

- `npm run test:mobile-profile`: five tests passed against isolated PostgreSQL schemas and real HTTP routes, with real challenge hashing/verification and a mocked SMS transport.
- `npm run test:mobile-profile-ui`: desktop/mobile setup, wrong-code recovery without logout, mandatory verification, setup completion, account settings and administrator controls passed. Screenshots are in `artifacts/mobile-verification/`.
- SMS transport, configuration, Google OAuth and initial-password tests: 14 passed, including encrypted SMS credentials, failed-provider response handling and policy validation.
- Traffic protection tests and targeted lint passed.
- Production frontend build passed.
- Live API readiness and frontend checks returned HTTP 200.

The broader `test-security-boundaries.mjs` suite passed seven of eight checks. Its existing route-inventory check cannot enumerate the `base` identifier used by `server/src/integrationHub/routes.js:10`; that separate integration-route audit limitation was left unchanged. The mobile routes are covered by the real registration guard and request validation in their regression tests.
# Unpublished barangay setup regression

Profile updates previously validated the entire saved barangay against published website pages, even when only contact details changed. An empty directory therefore returned `Choose a published barangay.` during the contact step. Resident address entry now uses a required, length-limited text field with published names as optional suggestions. It preserves saved names and remains usable when the directory is empty or unavailable. Profile saves no longer depend on directory publication; the field remains self-reported and does not confer verified status or publish a directory record.

Optional SMS verification is hidden when the provider is unconfigured. Required verification remains visible and enforced. Sending real codes still requires a valid Semaphore API key in **Settings → Authentication → Mobile number verification**.

Regression checks: real HTTP/PostgreSQL persistence, empty/unavailable directory setup at 390px and 1440px, required/unavailable SMS enforcement, existing OTP and admin settings checks, targeted ESLint and production build all passed.

