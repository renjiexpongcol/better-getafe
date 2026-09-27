# API route security inventory

The allowlist in `server/src/services/apiRoutePolicy.js` is the enforcement source for every `/api/*` request. An API request is rejected before its route handler when its path is not registered, when its method is not listed, or when its access class is not satisfied.

| Area | Routes covered | Methods | Access class | Additional enforcement |
| --- | --- | --- | --- | --- |
| Weather and feedback | `/api/weather`, `/api/weather/getafe`, `/api/weather/forecast`, `/api/feedback/article` | GET, POST | Public | Input validation, public/general rate limits |
| Sign-in and recovery | `/api/auth/login`, MFA verification, Google OAuth, `/api/portal-auth/login`, registration, code verification/resend, password recovery/renewal, `/api/auth/me`, logout | GET, POST | Auth flow | Authentication/OTP throttles, no-store responses, secure session cookies |
| Session management | `/api/auth/sessions`, `/api/auth/sessions/:sessionId` | GET, DELETE | Authenticated session | Session registry ownership check and revocation |
| Resident account | `/api/auth/mfa/*`, `/api/auth/change-password`, `/api/citizen/*`, `/api/users/me/preferences`, `/api/users/me/notification-preferences` | GET, POST, PUT, PATCH | Resident | Portal session validation, onboarding guard, user-derived IDs, ownership-constrained queries |
| Public content | `/api/news` and published article routes, `/api/categories`, `/api/notifications`, `/api/discover*`, `/api/officials*`, `/api/barangays`, `/api/public-data/*`, `/api/public/config`, `/api/contact` | GET, POST | Public | Public-only filtering, input allowlists, sanitized response views, public rate limits |
| CMS content and media | `/api/news` mutations, `/api/categories/*`, `/api/officials` PUT, `/api/barangays` PUT, `/api/media*`, `/api/storage/upload-url`, `/api/account/*` | GET, POST, PUT, PATCH, DELETE | CMS | CMS role validation, granular permission checks, upload signature/size checks, private cache headers |
| Staff operations | `/api/staff/*` | GET, POST, PATCH | Staff | CMS session plus staff permission/resource checks, application ownership/resource authorization |
| Administration | `/api/admin/*` | GET, POST, PUT, PATCH, DELETE | CMS | Granular permission checks, settings origin checks, audit events, safe response fields |
| Diagnostics | `/api/health`, `/api/health/storage`, `/api/health/database` | GET | CMS | `system.infrastructure.view`; public probes use `/health/live`, `/healthz`, or `/health/ready` |

## Boundary rules

- No wildcard CORS response is emitted. Approved origins are explicit and preflight is accepted only for a registered route and method.
- Cookie-authenticated state-changing requests must include an accepted same-site/configured origin. Bearer-authenticated requests remain subject to route authorization.
- Private responses are marked `Cache-Control: no-store, private` and security decisions are logged with a request ID, route policy, status, and actor identity only. Credentials, tokens, OTPs, and request bodies are never logged.
- Public content serializers do not return CMS storage keys, author IDs, autosave fields, or media relationship internals.
- Resident resources derive identity from the validated session and return not-found responses for records outside that resident's ownership scope.
- Unknown API paths return JSON 404 responses and never fall through to the SPA. Known paths with unsupported methods return JSON 405 responses with an `Allow` header.

Run `npm run test:api-security` for the registry and method/coverage checks. The direct request security suites should be run with the configured application services before deployment.
