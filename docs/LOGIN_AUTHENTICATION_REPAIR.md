# Login authentication investigation and repair — 12 October 2026

## Confirmed causes

The failed account `rp34374@outlook.com` did not exist in the PostgreSQL database serving `http://localhost:5173`. It exists as a staff account in the original PostgreSQL data volume, with ID `703b3d6e-998e-474b-9bcc-ac3e2a34e132`.

The stopped original container `getafe-postgres` used `getafe_postgres_data`. The active Compose container `getafe_portal-postgres-1` used `getafe_portal_getafe-postgres-data`. A new Compose volume had become the local database, leaving the original account records and configuration behind. Both databases were reachable and structurally valid; connectivity alone therefore did not detect the problem. The original store has four CMS accounts and 21 resident records. The active store initially had no CMS accounts and one resident record.

The earlier import from `data/cms.json` recovered an older snapshot (two admins/nine residents), but that snapshot omitted the reported staff account and held outdated admin hashes. The user's retry correctly showed that this was insufficient. The subsequent investigation located the actual original PostgreSQL store instead of treating the displayed error as proof of an incorrect password.

A second controller defect was reproduced: `loginUser` selected `cmsUser || portalUser` before password verification. Where independent CMS and resident accounts shared an email, a valid resident password was checked against the CMS hash and rejected with 401. The original database contains shared-email accounts. The regression failed with `401 !== 200` before the fix.

## Authentication flow and security

The form sends normalized email, unchanged password, JSON, credentialed relative requests, and CSRF protection through Vite to `/api/auth/login`. The backend validates input/origin/CSRF/traffic, retrieves PostgreSQL records, verifies scrypt, applies account eligibility and password/MFA/email requirements, creates a signed session and registry entry, and exposes the account through `/api/auth/me`. The frontend then chooses a permitted application destination.

`selectLoginAccount` now verifies both account-domain hashes (or dummy hashes) and chooses only an eligible account whose password verifies. CMS precedence applies only after valid CMS proof. All later MFA, email verification, role, password-expiry, and session controls apply to the chosen account. A resident password cannot grant CMS access or bypass CMS MFA. Disabled CMS accounts cannot shadow a separate valid resident identity.

`loginUser` also retains the shared IP/email throttle and adds independent CMS/resident failure buckets. Success clears only the selected domain's budget, so known resident credentials cannot repeatedly clear the CMS brute-force limit. The regression alternates failed CMS attempts with successful resident sign-ins, confirms CMS remains locked, and confirms the resident identity still works. Short HTTP token-bucket waits are honored rather than disabling rate limits.

The original database required email verification and had SMTP enabled; those settings were missing from the new store. Original settings were restored through the audited configuration service after SMTP authentication/TLS verification passed. Password minimum, failure limit, and lockout settings matched the current policy. The reported account's original durable verified status was recovered from the source database, rather than granting a new verification exception. No sessions, reset grants, or MFA challenges were imported. Passwords were not requested, guessed, or reset; source hashes and MFA data were preserved.

## Changes and functions

| File | Change |
| --- | --- |
| `server/index.js` | `loginUser` delegates account selection to verified credential proof. |
| `server/src/services/loginAccount.js` | `selectLoginAccount` securely selects CMS/resident records and enforces eligible roles. |
| `docker-compose.yml` | Fixed PostgreSQL/Redis volume names; PostgreSQL volume is external, preventing implicit empty replacement. |
| `.env.example` | Documents explicit persistent volume settings. |
| `scripts/postgres-volume.mjs` | `preparePostgresVolume` reuses the configured volume, refuses empty replacement if original data survives, and provisions only a genuinely fresh volume. |
| `scripts/setup.js` | Uses volume guard before starting infrastructure and checks legacy account migration after schema preparation. |
| `scripts/recover-postgres-account.mjs` | Explicit dry-run/apply recovery from an isolated original PostgreSQL copy; preserves original credentials, MFA, profiles, groups/policies, verification facts, and ownership references. |
| `scripts/legacy-account-import.mjs`, `scripts/import-legacy-accounts.mjs` | Earlier trusted JSON migration; repeat-safe ledger and conservative collision checks. This is not the authoritative source for newer accounts. |
| `scripts/auth-test-isolation.mjs` | `createAuthTestIsolation` gives test servers a private PostgreSQL auth-state schema. |
| `scripts/test-password-change-http.mjs`, `scripts/test-auth-isolation-http.mjs` | Adopt isolated authentication state to avoid affecting live lockout counters. |
| `scripts/test-login-account-selection.mjs` | Real HTTP regression for shared email, distinct passwords, roles, MFA, and disabled-account handling. |
| `scripts/test-login-migration-ui.mjs` | Browser regression with the real backend/controllers/database and isolated security state. |
| `scripts/test-legacy-account-import.mjs`, `scripts/test-postgres-volume.mjs` | Credential/MFA preservation, conflicts, idempotence, no resurrection, and volume replacement prevention. |
| `package.json`, `README.md` | Recovery/test commands and operational documentation. |

## Data recovery

The original volume was mounted read-only into a helper and copied to a separate `getafe-auth-investigation-20261012` volume. Its PostgreSQL server was inspected without network access and stopped after recovery; the copy is retained for review. Neither original nor active source volume was overwritten or removed.

Four original CMS accounts and 20 resident records were reconciled with the active database. Existing current application content was retained. For one admin whose earlier JSON snapshot used a different ID, the current ID and ownership/profile references were retained while recovering the actual original credential hash. Replacement of a stale hash requires proof that the record was an unchanged account inserted by the earlier legacy importer; arbitrary live credentials cannot be overwritten.

The reported staff account retained its original ID, password hash, employee profile, and six original group memberships. Original group UUIDs/grants/policies are preserved; a same-name current group with broader grants is not substituted. Name collisions use a distinct original-access group name. Existing live groups are not rewritten. Recovery ledgers prevent unintended resurrection on repeat runs. Durable source verification/password-age facts are restored only for the recovered identity; transient authentication grants are excluded.

One resident identity collision was left untouched: an original source record and a pre-existing live record use the same email with different IDs/credentials. It requires ownership reconciliation if the older source credentials are desired; overwriting the live record would be unsafe. This does not involve `rp34374@outlook.com`.

## Validation results

| Scenario | Result |
| --- | --- |
| Valid database credentials | Browser fixture with an actual imported legacy database record authenticated, upgraded its hash after proof, and reached `/admin`. Previously demonstrated through the live localhost proxy; subsequent tests use a separate security-state backend. User-account confirmation remains pending. |
| Shared-email accounts | HTTP regression passes both distinct valid passwords, chooses the corresponding account, keeps resident access separate, retains CMS MFA, and prevents one domain's successful proof from clearing another domain's lockout. |
| Incorrect password/nonexistent account | Browser returned identical 401/generic errors without account disclosure. |
| Disabled account | Correct password rejected; disabled CMS identity cannot block an independent valid resident account. Disabled status preserved on migration. |
| Locked account/repeated failures | Real cooldowns honored and expired naturally. Traffic suite verified excess attempts, temporary blocks, and Retry-After. |
| MFA | Staff MFA suite passed challenge, one-use recovery/replay denial, rotation, privacy, and browser enrollment/persistence. Shared-email regression confirmed CMS password still requires MFA. |
| Expired session | Auth isolation suite rejected correctly signed expired tokens and disabled sessions. |
| Backend unavailable | Browser showed service unavailability, not invalid credentials. |
| Database outage | Isolated relay demonstrated controlled 503, unchanged server PID, and automatic recovery; repository failure never became a mock account or invalid-credential verdict. |
| Refresh | Same account remained authenticated; HttpOnly/SameSite=Lax/API-scoped cookie verified. |
| Logout/re-login | Original session revoked; subsequent login with the same credentials succeeded. |
| Public/session isolation | Public data remained independent of authenticated identity; private authorization/IDOR/CSRF boundaries passed. |

Other successful checks: resident/staff password-change HTTP suites; 12 hash/origin/recovery tests; API transport suite; four volume guard tests; importer PostgreSQL regression; setup on existing infrastructure; modified-file lint; API policy audit (259 policies, 223 handlers). Production build passed earlier; no frontend production source was changed afterward.

The current Backblaze configuration also passed DNS/TCP/TLS, S3 authentication, and bucket-access checks. The saved bootstrap storage credential set returned 403 on its bucket check and was not restored over the working environment configuration. All four CMS and 20 reconciled resident records were compared against the original source for matching credential hashes, roles, MFA state, and original memberships, without exposing hashes in output. Repeat recovery is observational after its ledger entry exists, preserving later password/MFA/access changes and refusing deleted identities.

An existing destination test still expects `/admin/news` for a content manager, while current navigation chooses `/admin/public-content`. That unrelated expectation was not altered.

An additional validation issue was found: earlier regression servers shared the live database's IP lockout bucket despite separate Redis prefixes. Test failures contributed to a temporary live IP lockout. The tests were moved to private auth-state schemas; the lockout was not reset or bypassed and was verified to expire naturally. Isolated password-change and browser/security tests then passed.

## Remaining limits and operation

- Successful sign-in by the user with the original `rp34374@outlook.com` credentials is still required before declaring the reported issue fully resolved. No password was requested or reset.
- The single resident identity collision is preserved for review. Existing live credentials remain authoritative there.
- Recovery covers authentication/account metadata, not a wholesale restore of all historical business content. Both original and active volumes remain available.
- Account recovery and optional audited configuration restoration are separate commits; retries are conservative and safe, but this is not a distributed transaction.
- Verified locally; no production deployment or live HTTPS cookie test. Original SMTP authentication and STARTTLS verification passed.

Use `npm run setup` before first infrastructure startup; it prepares the explicitly named external PostgreSQL volume and refuses silent replacement of surviving data. `POSTGRES_DATA_VOLUME` and `REDIS_DATA_VOLUME` must retain their identities across project renames. Do not select a PostgreSQL volume with an incompatible image/locale.

Recovery previews require `node scripts/recover-postgres-account.mjs --email ACCOUNT_EMAIL --kind cms --container TRUSTED_ISOLATED_COPY`; add `--apply` only after reviewing the preview. `--restore-auth-config` verifies SMTP before restoring original authentication/email settings. `--replace-legacy-snapshot` only reconciles untouched earlier importer records with provenance checks. Original hashes and MFA material never appear in output.

Run `npm run test:login-account-selection`, `npm run test:login-migration-ui`, `npm run test:legacy-account-import`, `node --test scripts/test-postgres-volume.mjs`, and the existing security/password/session suites for regression checks.
