# Authentication audit: current route and security map

This map was written from the current Express route registrations and middleware. It describes the implementation before the remediation changes below.

## Authentication and account routes

| Method | Route | Authentication / authorization | Rate limit | Purpose |
|---|---|---|---|---|
| POST | `/api/auth/login` | Public | authentication | Shared CMS/resident password login |
| POST | `/api/portal-auth/login` | Public, same handler | authentication | Compatibility alias |
| POST | `/api/portal-auth/register` | Public | authentication + registration state | Resident registration |
| GET | `/api/auth/me` | Optional signed cookie/bearer; anonymous returns `{user:null}` | general | Resolve current account and permissions |
| POST | `/api/auth/logout` | Optional signed cookie/bearer; idempotent cookie clear | general | Revoke session and clear cookies |
| POST | `/api/auth/verify-code` | Public, challenge credential | OTP | Complete email login challenge |
| POST | `/api/auth/mfa/verify` | Public, challenge credential | OTP | Complete resident MFA challenge |
| GET | `/api/auth/google` | Public | authentication | Start Google OAuth |
| GET | `/api/auth/google/callback` | Public, OAuth state cookie | authentication | Complete Google OAuth |
| POST | `/api/auth/forgot-password` | Public | OTP + account email cooldown | Issue generic password-reset challenge |
| POST | `/api/auth/forgot-password/verify` | Public, challenge credential | OTP | Exchange reset OTP for reset token |
| POST | `/api/auth/renew-password` | Public, reset-token credential | OTP | Change password after reset |
| PATCH | `/api/account/password` | CMS session | admin_sensitive | Change CMS password |
| POST | `/api/auth/change-password` | Resident session | general | Change resident password |
| GET | `/api/auth/mfa/status` | Resident session | general | Read MFA state |
| POST | `/api/auth/mfa/setup` | Resident session | OTP | Start TOTP enrollment |
| POST | `/api/auth/mfa/activate` | Resident session + enrollment | OTP | Confirm and activate TOTP |
| POST | `/api/auth/mfa/disable/request` | Resident session | OTP + per-account cooldown | Send MFA-disable code |
| POST | `/api/auth/mfa/disable/confirm` | Resident session + challenge | OTP | Disable TOTP |
| GET | `/api/auth/sessions` | Signed, current account lookup | general | List Redis-tracked sessions |
| DELETE | `/api/auth/sessions/:sessionId` | Signed, owns session | general | Revoke one session |
| DELETE | `/api/auth/sessions` | Signed, current account lookup | general | Revoke all or all except current |
| POST | `/api/citizen/onboarding/verification/request` | Resident session | OTP | Request onboarding email verification |
| POST | `/api/citizen/onboarding/verification/confirm` | Resident session + challenge | OTP | Complete onboarding email verification |
| POST | `/api/citizen/onboarding/password` | Resident session | general | Set onboarding password |
| POST | `/api/citizen/onboarding/complete` | Resident session | general | Complete profile onboarding |

## Protected route families

| Method / route family | Authentication | Permission / additional control |
|---|---|---|
| `/api/admin/*` | CMS `admin` middleware on route or mounted family | Route-specific `permission(...)` or family-level `requireAccess`; some dashboards use CMS role only |
| `/api/staff/*` | CMS `admin` middleware | CMS role and route-specific ownership/state checks |
| `/api/account/*` | CMS `admin` middleware | Account password/avatar only |
| `/api/citizen/*` | Resident middleware | Resident account; onboarding gate except onboarding/profile completion paths |
| `/api/auth/*` MFA/password/session endpoints | Resident/CMS middleware as documented above | Per-action state/permission checks |
| Public data and content reads | No authentication | Public by route design |

Admin data routes installed by `settingsRoutes`, `adminUsersRoutes`, `staffRoutes`, and `accessManagementRoutes` apply authentication through mounted middleware. `settingsRoutes` and access-management mutations perform permission checks in their handlers/middleware. Routes individually decorated with `admin` and `permission(...)` do both at registration.

## Initial concrete findings

- Password login does not reject malformed email before database lookups and the lockout key combines client identity with raw email rather than independent client and pseudonymized-account buckets.
- Email verification can return distinguishable reset states (`challengeId` versus `null`) for registered and unknown addresses; cooldown responses also differ.
- Google OAuth state is held only in the browser cookie: there is no server-side expiry/single-use record, and the state cookie is not cleared for every failed callback.
- Password reset and password changes update the account timestamp, which invalidates timestamp-bound sessions, but do not consistently rotate/revoke the current session as an explicit session lifecycle.
- MFA login reads challenge state and verifies TOTP before separately consuming it, allowing concurrent TOTP requests to both pass. Recovery-code consumption is transactional in the PostgreSQL path.
- `verifyCode` is serialized/transactional for a challenge, but a wrong attempt refreshes its expiry and Redis failures may fall back to local-file or SQL state instead of failing closed.
- Session registry writes are best effort while Redis is ready; a cookie can be issued even if its registry write failed, after which the next request can treat the session as missing/revoked.
- The frontend centralizes `fetch` only for auth context methods; feature components still call `fetch` directly, and auth-expiry handling is not globally centralized.

## Remediations made in this pass

- Password login now rejects malformed/oversized email and oversized passwords before lookups/hashing, performs CMS and resident lookups concurrently, and performs a dummy constant-time scrypt comparison for unknown accounts.
- CMS and resident identities remain separate server-side session `kind` values; `/api/auth/me` now rejects unknown kinds instead of interpreting every non-CMS token as a resident.
- Login failure tracking now uses independent IP, keyed account pseudonym, and client/account-combination buckets. Default account/combination lockout is 5 failures in 15 minutes; the IP-wide bucket is 5× that configured limit and is deliberately not cleared by success. 429 values use the actual stored remaining TTL.
- Auth and OTP traffic policies now return the standard generic 429 response with `Retry-After`. In production, login, registration, Google OAuth, and OTP rate limiting fails closed with 503 if its Redis-backed limiter is unavailable; local fallback remains available in development.
- Email/SMS challenges are stored before delivery, carry their original expiry, retain that expiry after wrong attempts, use HMAC digests keyed by the session secret, enforce six-digit syntax, and do not delete a challenge submitted to the wrong purpose. Five bad entries consume the challenge. Redis/SQL state transactions serialize challenge consumption; replay and concurrent verification are covered by an integration test.
- MFA TOTP verification and MFA setup activation now verify and consume their challenge in one state transition. Recovery-code consumption remains row-locked/transactional in PostgreSQL, and competing attempts cannot both establish a session. TOTP/enrollment expiry is fixed at issuance (5 minutes and 10 minutes).
- Password-reset requests now use the same address cooldown and response shape for known and unknown addresses. Unknown/delivery-failed requests receive an unusable decoy challenge.
- Google OAuth state is now server-held for 10 minutes and single-use, must match the HttpOnly browser state cookie and intent, and is cleared on every callback result.
- Session-registry write failures no longer issue a cookie for an unregistered Redis session. Password change rotates the current session; the account timestamp invalidates older sessions. Production auth traffic cannot use a local in-process rate-limit fallback.
- Proxy-derived client addresses now use Express's `req.ip` only when the immediate peer is inside configured trusted proxy CIDRs. Raw `X-Forwarded-For` and `CF-Connecting-IP` values are not selected directly.
- Cookie-authenticated mutations, including logout, require a same-origin `Origin` or `Referer`; `X-Requested-With` remains only an app marker. Malformed JSON and missing JSON bodies now receive controlled API handling, and auth request JSON is limited to 32 KB.
- The frontend emits a session-expired event for protected API 401s and clears auth state. It does not do so for 403, 422, 429, or 503, and it excludes password-verification actions where a 401 can mean an incorrect current password.
- Added structured login result logs with pseudonymized client/account identifiers. Passwords, codes, tokens, and cookies are not included.

## State machine after remediation

```text
Password login -> normalized/validated input -> layered rate limit -> CMS and resident lookup
  -> generic credential failure | expired-password reset | resident TOTP challenge
  -> email OTP challenge if configured/required | fresh signed session

Google login -> server state + HttpOnly browser state -> one-use callback validation
  -> verified Google identity -> CMS match / resident match / resident creation
  -> resident MFA challenge when enabled -> fresh session -> onboarding gate if incomplete

Password reset -> address-neutral response + OTP challenge/decoy -> purpose-bound OTP verify
  -> one-use 10-minute reset authorization -> password update -> old timestamp-bound sessions rejected
```

## State keys and lifetimes

| State | Key / storage | Lifetime |
|---|---|---|
| Auth temporary state (OTP, OAuth state, reset auth, lockouts) | Redis `getafe:auth-state:<sha256(state-key)>`; durable SQL fallback when Redis is unavailable and configured | Per record: OTP 10m, Google state 10m, MFA challenge 5m, enrollment 10m, reset authorization 10m; configured lockout/cooldown windows |
| Login throttle | Auth-state records for IP, HMAC account ID, and IP/account combination | 15m default; IP bucket locks at 5× configured failed-login limit |
| Password reset email cooldown | Auth-state record keyed from normalized email | 5m |
| General/auth/OTP traffic limit | Redis `getafe:ratelimit:{general|auth:burst|auth:sustained|otp|otp:sustained}:<client-hash>` | Token-bucket state; configured windows 60s and 15m |
| Session registry | Redis `getafe:session:<sha256(session-id)>`, plus per-user session set | Remaining signed-session lifetime; default signed lifetime 12h or 30d remembered; idle expiry default 30m |
| Session revocation | Auth-state `revoked-token`/`revoked-session` records (hashed Redis storage key) | Remaining signed-session lifetime |
| MFA recovery codes | Scrypt digests in the portal account row; consumed under row lock | Until consumed or replaced during MFA reconfiguration |

## Authenticated route families and authorization

| Route family | Authentication | Authorization |
|---|---|---|
| `/api/admin/*` | CMS session, current CMS row and role rechecked | Required permission is enforced by per-route middleware or the installed family middleware; CMS role alone does not satisfy explicit permission routes |
| `/api/staff/*` | CMS session and role | Route-level ownership/status checks; staff actions remain server-side |
| `/api/account/*` | CMS session | Password is reverified for change; avatar stays private to the account |
| `/api/citizen/*` | Resident session and current resident row | Onboarding gate applies except onboarding/profile endpoints needed to finish setup |
| `/api/auth/mfa/*`, `/api/auth/change-password`, `/api/auth/sessions*` | Resident or current signed account session as appropriate | Challenge purpose, ownership, current DB state, and session ownership checked per endpoint |
| `/api/auth/login`, `/api/portal-auth/login`, `/api/portal-auth/register`, Google OAuth, OTP/reset endpoints | Public/challenge credential | Layered rate limit; challenge-purpose checks; no client-supplied role is accepted |
| `/api/auth/me`, `/api/auth/logout` | Optional session | Anonymous `/me` returns `{user:null}`; logout clears cookie even when stale |

## Verification and remaining limits

- Passed: `npm run test:traffic`, `npm run test:redis` (including OTP purpose, expiry, attempts, replay/concurrency, layered login lockout, and fixed-window action-throttle checks), `npm run test:google-oauth`, `npm run lint`, and `npm run build`.
- Passed again during this follow-up: `npm run test:auth` (5 checks), `npm run test:admin-users` (7 checks), `npm run test:traffic`, `npm run test:redis`, `npm run test:google-oauth` (3 checks), `npm run test:config` (8 checks), `npm run test:appointments` (3 checks), `npm run test:media-paths` (2 checks), `npm run test:officials` (3 checks), `npm run test:routing` (6 checks), `npm run test:request-cache` (6 checks), `npm run test:storage`, `npm run lint`, and `npm run build`. `npm audit --audit-level=high` found 0 vulnerabilities; `node --check server/index.js` passed.
- Not performed: database-backed CMS/resident sign-in, SMTP delivery, real Google callback, browser end-to-end MFA/reset/onboarding, production reverse-proxy deployment, and outage injection against the configured production database/Redis. These require the target deployment services/accounts and are not claimed as passing.
- The Express process was not started against the workspace's configured services. Startup initializes PostgreSQL/runtime configuration and storage, so it needs a disposable integration environment to avoid applying changes to a real target. Backend entry syntax was checked; route/service unit and Redis tests passed. A production-like browser/API run remains the main verification gap.
- The complete admin/staff/citizen route inventory is broader than authentication routes and spans route installers. This audit maps its middleware families and protected authentication-relevant surface, but does not include a generated line-by-line matrix of every business endpoint.
- CMS email takes precedence if legacy data contains the same normalized email in both CMS and resident databases. New registration checks prevent a duplicate portal account, but pre-existing duplicate records still need administrative cleanup.
- Public registration still distinguishes duplicate addresses (HTTP 409) from newly created accounts. Removing that signal safely requires a pending-registration/verification flow that changes the existing registration contract; this pass preserved the current account-creation flow. Login returns generic credential failures; password reset has an address-neutral response shape, with SMTP timing remaining an open signal.
- Password-reset SMTP delivery remains synchronous to avoid persisting OTP plaintext in the Redis mail queue; SMTP latency may still provide a timing signal despite the identical response shape and decoy challenge.
- `AUTH_SESSION_SECRET` (or its configured compatibility aliases) and `RATE_LIMIT_TRUSTED_PROXY_CIDRS` must be correctly provisioned in production. If the trusted proxy CIDRs are empty or wrong, forwarded address and HTTPS recognition intentionally fall back to the direct peer and secure auth requests may fail.
- Legacy scrypt hashes are verified without breaking existing accounts and upgraded to the versioned current work factor after successful login. No bulk migration or database schema change is required; dormant accounts keep their legacy hash until they sign in or change/reset their password.
- Not every frontend fetch has been moved to a single API-client module; the existing app-wide fetch wrapper now handles protected-route 401 state clearing while same-origin credentials remain centralized there.

## Follow-up audit findings and changes

The prior audit map was checked against the current implementation and tests. This follow-up found and repaired four additional cross-cutting gaps:

- **Session registry outage behavior:** production previously skipped the Redis session-index write when Redis was unavailable and still returned a signed cookie; session validation also treated an unavailable Redis registry like an unrevoked session. Session creation and validation now require a ready registry in production. A Redis outage returns a temporary service failure instead of issuing or accepting sessions. Development fallback behavior is unchanged.
- **Rate-limit identity spoofing:** the limiter previously hashed any raw `X-API-Key` header, allowing a caller to choose a new identity for each request. It now accepts only a principal attached by server-side API-key authentication. No inbound API-key authentication exists in this app today, so raw headers use the normal authenticated-user or client-IP bucket.
- **Password-policy and hash drift:** registration, password reset/change, Google onboarding, and administrator-created CMS accounts now use the same configured minimum, character requirements, common-password deny list, and 1,024-character maximum. The default minimum is now 12 characters (existing user passwords still sign in unchanged); the existing minimum setting remains configurable. React password screens use the same client-side rules and display the configured minimum. New and changed passwords use versioned scrypt parameters (`N=2^14`, `r=8`, `p=5`); legacy hashes are verified and opportunistically upgraded after successful login, without a database schema change. [OWASP lists this as an equivalent scrypt configuration](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
- **OAuth and redirect hardening:** Google OAuth now uses one-use server-held PKCE verifiers and a 10-second timeout for token and user-info requests. OAuth MFA challenge IDs are carried in a URL fragment and cleared by the login page. Post-login return paths are parsed and constrained to the current origin; protocol-relative, backslash, encoded-control, oversized, and authentication-loop paths are rejected.
- **Auth response serialization:** the allowlisted user payload is now a small tested helper. It excludes password hashes, MFA secret/recovery data, reset credentials, and raw session IDs.

Tests added in this follow-up cover password-policy cases, versioned scrypt hashing and legacy compatibility, production Redis fail-closed behavior, safe return paths, auth payload secret exclusion, validated limiter identities, and OAuth S256 PKCE generation. The prior integration coverage for Redis OTP/session TTL and traffic policy remains in place.
