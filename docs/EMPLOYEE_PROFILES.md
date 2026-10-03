# Employee provisioning

## Schema and authentication audit

- CMS administrators and municipal staff use `users`; resident accounts use `portal_users` and `resident_profiles`. Employee provisioning applies to CMS accounts only.
- Existing UUID values are stored in the `users.id` text primary key. All references, sessions, authorization memberships, and request assignments continue to use that key.
- There was no existing employee profile, EID, username, or personnel table. The login identifier remains work email; no duplicate username is introduced.
- Existing `users.avatar_storage_path` is reused. A null path uses the portal's default initials avatar.
- Existing `auth_groups`, `auth_user_groups`, `auth_user_bootstrap`, `auth_group_permissions`, and `auth_audit_logs` are reused. The legacy per-user settings-grant form now delegates to the existing group-based access-management component.
- Existing password reset and welcome-email flows are reused. New passwords are generated securely, stored as scrypt hashes, and never returned to administrators. Accounts initially show Password Setup Required. A completed password setup clears that status; lazy hash upgrades do not.
- CMS MFA enrollment was not previously stored. `users.mfa_enabled` now defaults to false. This change records enrollment status; it does not add a new MFA enrollment flow. Existing email-code authentication remains intact.

## Migration and activation

Apply `022_employee_profiles.sql` to the CMS database before running the updated backend. The standard migration command is `npm run migrate:postgres`. Review any other pending migrations before using that command.

The migration locks account writes during backfill, orders existing accounts by creation date and UUID, assigns EIDs, and preserves account IDs and relationships. Legacy departments and positions remain unassigned until an administrator supplies them; they are not inferred from permission groups. Legacy creation attribution is System migration and their historical last login is unknown (shown as Never until the next successful login).

`employee_profiles.user_id` references the existing account. A PostgreSQL insert trigger guarantees a default employee profile whenever a new CMS user row is inserted, including bootstrap inserts outside the API. The application provisioning service completes department, position, group membership, security defaults, and audit data using a single checked-out database connection and transaction.

EIDs are assigned by `employee_eid_seq`, constrained to `000001`–`999999`, unique, immutable, and never recycled. Failed transactions can consume sequence values, so gaps are expected. The sequence stops at its maximum rather than wrapping. Do not reset or recreate this sequence during routine operations or restores; restore its high-water mark along with account data.

The initial employment default is configurable for future employees:

```sql
UPDATE employee_profile_defaults
SET employment_status = 'Active'
WHERE singleton = TRUE;
```

Existing employees keep their employment status when the default changes. Individual employment status and personnel data can be edited through the profile API.

## Routes and authorization

- `POST /api/admin/users`: name, email, department, position, role, and optional `group_ids`. With no groups selected, the backend assigns the existing default role group, subject to the creator's grant authority. System fields supplied by a client do not override generated values.
- `PATCH /api/admin/users/:id`: permitted account changes preserve EID. Group membership is managed by the existing access-management routes.
- `GET /api/admin/users/:id/profile`: employee information and group names; requires `users.view`.
- `PATCH /api/admin/users/:id/profile`: allowlisted phone, hire date, employment type, office assignment, supervisor, and employment status; requires `users.manage`. Account identity and creation metadata are read-only. Super administrator personnel edits require a super administrator.

Provisioning checks group availability and grant authority. Audit failure rolls back all required database writes. Welcome email runs after commit; email failure returns a saved-account warning and does not undo a valid account. Administrators can ask the employee to use the existing Forgot password flow after fixing SMTP.

Staff search matches name, email, EID, department, and position. UUIDs remain machine identifiers in API payloads and form values; directory, profile, assignment, and audit labels show names and EIDs.

## Verification

```text
node --test scripts/test-employee-provisioning.mjs
node --test scripts/test-admin-users.mjs scripts/test-auth-hardening.mjs
node --test scripts/test-eservices.mjs
node scripts/test-employee-profile-ui.mjs
npm run lint
npm run build
```

Database tests use temporary schemas and clean them up. Browser tests use intercepted fixtures and do not create real accounts. The browser test expects Vite at localhost:5173. Set `PLAYWRIGHT_CHANNEL=msedge` to use installed Edge when bundled Chromium is unavailable. Screenshots are stored in `artifacts/employee-profiles`.
