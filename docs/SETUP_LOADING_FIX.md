# Setup startup screen

The `/app/setup` screenshot came from the global public-settings gate in `App.jsx`, before the setup form rendered. Its loader displayed bare text with only a background color.

`StartupScreen` now displays the municipal seal, a centered responsive panel, a status message and the existing spinner. The settings request has a five-second total deadline across transport retries and response parsing. Failed settings still prevent setup from opening and present the existing recovery page; **Try again** loads fresh settings and restores the form.

Validation:

- `npm run test:setup-loading-ui`: full application at 390px and 1440px, saved profile hydration, stalled settings, timeout, manual recovery, no browser errors or horizontal overflow.
- Targeted ESLint and Vite production build passed.
- `npm run test:mobile-profile-ui` passed on mobile and desktop, including the verification settings.
- The older `test:startup-ui` suite stops at its hard-coded homepage heading assertion. The current homepage obtains its hero from published content, and that suite does not supply it. The setup-specific test exercises the actual application independently of homepage content.

Screenshots are in `artifacts/setup-loading/`.
