# Security operations

The existing API route registry classifies 609 method/path handlers after adding the scheduler endpoint. Registration fails for undeclared endpoints and middleware mounts. Authentication, account validation, permissions, input limits, CSRF and error handling remain enforced. The internal job endpoint adds a fixed job allowlist, independent bearer authentication, durable claims and no browser authority.

Production sessions require Redis and secure HTTP-only cookies. Concurrent-renewal and outage regression tests are retained. MFA, reset-token consumption and role checks were preserved. OAuth redirects now enforce the configured application origin and the same registered callback throughout the exchange.

Application backing tables are private to the backend. Migration 056 repaired broad anonymous grants and missing RLS. The fixed public categories projection remains explicitly readable. Do not add blanket public policies to remove advisor notices: RLS without browser policies is intentional for the custom-auth backend. Privileged role replacement and a full grant audit across non-application schemas require separate verification.

Azure upload SAS URLs grant create-only access to one random key for at most 15 minutes. Finalization validates actual content and owner. SAS size enforcement is application-side; monitor orphan growth. Signed links are secrets and should not appear in logs. Azure CORS requires operator configuration.

Only explicitly public values may use VITE_ names. Session, encryption, database, Redis, Azure, OAuth secret, SMTP and API credentials stay server-side. .env files and .vercel files are ignored by Git/deployment. Infrastructure environment values override conflicting saved origin/OAuth/Azure settings. Existing production encryption and session keys must be retained through migration unless a deliberate rotation is planned.

`node scripts/audit-secrets.mjs` scans all reachable Git history and tracked text heuristically, records only locations/hashes and excludes generated artifact history. Five candidates in the initial run were test fixtures. No real exposed credential was confirmed by that scan. Untracked files, binary content, arbitrary credential formats, unreachable objects, remote branches not present locally and provider audit logs are not covered. Use GitHub secret scanning and an independent detector before release.

The original database grants meant public roles had authority over authentication and settings records. Whether that authority was exercised is unknown. Review Supabase API/database logs, account/role changes and settings changes. Assess rotation of session-signing, OAuth, storage and integration credentials that may have been obtainable through affected settings or accounts; rotate confirmed exposures without printing values. Revocation of grants does not establish that no prior compromise occurred.

Production npm dependencies now resolve patched body-parser 2.4.0 and qs 6.17.1. The initial audit reported GHSA-27r3-jxmh-p828 and GHSA-6pq8-jhm2-2vcw; the refreshed production audit reports zero advisories. This is a checkout result, not proof that an existing deployment is patched. See [body-parser advisory](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828) and [qs advisory](https://github.com/ljharb/qs/security/advisories/GHSA-6pq8-jhm2-2vcw).

This implementation pass does not constitute exhaustive exploit validation of every endpoint. Preserve the repository's broader SECURITY.md scope and complete the remaining authentication, IDOR, SSRF, file-access and application-flow testing in an isolated environment.

