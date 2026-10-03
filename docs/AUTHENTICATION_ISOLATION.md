# Public and authenticated surfaces

The public website renders without an AuthProvider or ResidentPreferencesProvider. Its header has a neutral E-Getafe link to `/app`; it never reads account state. `/auth/*`, `/app/*`, and `/admin/*` mount authentication explicitly. `/app` checks the session and sends residents, staff, and administrators to their appropriate application. Private routes retain role checks and backend APIs retain session, role, permission, and policy enforcement.

Public API requests omit cookies and Authorization headers. The backend independently ignores identity on routes classified PUBLIC, including legacy root-scoped session cookies. Public news returns published public fields for every visitor; CMS reads use `/api/admin/news` with the `content.news.manage` permission. Visiting a public page never revokes the application session.

New session cookies are HttpOnly, Path=/api, SameSite=Lax, and Secure in HTTPS production. Remembered sessions retain the configured expiration. Issuing a session expires the previous Path=/ cookie. Valid legacy cookies continue to work on private endpoints until renewal or expiration; public visits do not migrate or destroy them. Local authenticated upload writes now use `/api/storage/local-upload/*` so the scoped session cookie reaches them. Public media downloads retain their existing URLs.

Private API responses use no-store caching and vary by Cookie and Authorization. The shared JSON cache only persists allowlisted public GET/HEAD responses. Account caches stay in memory and are cleared when the authenticated provider unmounts or the account changes. The old persisted response-cache namespace is removed without reading its contents. There is no service-worker response cache in this project.

Authentication responses use an explicit user-field allowlist. Account IDs support authenticated application operations; permission IDs support private navigation. Passwords, password hashes, stored MFA secrets, session credentials, storage keys, and password-reset grants are excluded. Password reset authorization is a short-lived, one-time HttpOnly, SameSite=Strict cookie scoped to the renewal endpoint; the UI receives only a verification flag. MFA enrollment retains its authenticated provisioning QR and one-time recovery codes, which are necessary for enrollment, but no longer returns a separate plaintext manual secret. These enrollment materials are never persisted in browser storage or sent on public routes. OAuth provider credentials remain server-side. OTP challenge IDs identify a challenge and do not authorize a session without its verification code.

## Verification

- `npm run test:auth-isolation-ui`: anonymous, resident, staff, and admin browser scenarios; six public pages; request headers; browser storage; preserved session; application routing; denied admin access; app-to-public navigation without a reload; desktop/mobile screenshots in `artifacts/auth-isolation/`. Browser API responses are controlled fixtures.
- `npm run test:auth-isolation`: actual backend with temporary database accounts and isolated Redis sessions; public responses independent of role, CMS denial/authorization, private cache headers, issued cookie scope and legacy migration, password-reset grant consumption and replay denial. Requires configured local PostgreSQL and Redis. Temporary accounts are deleted afterward.
- `npm run test:request-cache`: verifies private profile requests bypass shared caching and public requests discard explicit credentials.
- Auth, routing, OAuth, media paths, API policy audit, storage tests, targeted lint, and production build also pass.

The changes are local. Deploy the updated frontend and backend together so the new CMS-read and local-upload URLs agree.
