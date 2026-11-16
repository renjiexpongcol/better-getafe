# Build versus embedded iPaaS — 9 October 2026

## Requirements and unknowns

The inspected application uses a small set of municipal services: resident Google identity, public weather/statistics/election data, SMTP/SMS, B2, and internal financial workflows. No requirement for hundreds of customer-specific SaaS integrations was established. The deployment already uses Node, PostgreSQL, Docker and Redis. Municipality budget, procurement restrictions, data-residency requirements, staffing capacity and expected connector volume are not supplied. Those facts must be established before purchasing any platform; no vendor is assumed approved for resident data.

| Option | Fit and effort | Operations and governance | Commercial and custody questions |
|---|---|---|---|
| Native modular framework | Best current fit for a few known providers and existing policy/ownership rules. Requires implementing provider adapters and maintaining security tests. | One existing backend plus a worker; CMS backups and secret-store keys remain under municipal deployment control. Direct engineering responsibility for incidents, provider API changes, OAuth consent and deletion. | No new iPaaS license or dependency. Municipality must budget engineering/on-call capacity and provider costs. |
| Prismatic | Embedded platform intended for B2B SaaS integration delivery. Its product may reduce connector/workflow engineering when the catalog expands. | Vendor platform creates another execution, credential and audit boundary; assess regions, retention and export/recovery controls. | Obtain a written quote and connector-by-connector demonstration for B2, Philippine SMS, weather and municipal APIs. Marketing connector counts are not proof of compatibility. |
| Appmixer | Provides embedded integration tools and OAuth connector configuration; self-hosting is an available option. | Self-hosting can give infrastructure custody but also adds a platform to operate, patch, back up and monitor. | Compare hosted/self-hosted licensing and support. Confirm offline OAuth refresh, revocation, key custody and allowed network access in the actual deployment. |
| Workato Embedded | Embedded integration and connection-management UI can reduce broader automation work. | Adds provider-managed execution and licensing boundaries. Region-specific embedded connection URLs are documented, but do not establish approval for the municipality's data. | Direct-customer usage pricing is documented separately; request Embedded contract pricing, quotas, audit export and white-label rights explicitly. |

## Recommendation

Continue with the native modular hub and PostgreSQL workers for this increment. This recommendation is an inference from the small observed integration set and existing deployment architecture, not a claim about the municipality's undisclosed budget. Preserve the registry/configuration/execution boundaries so later procurement can replace an adapter without rewriting resident authentication or municipal policy enforcement.

Revisit embedded iPaaS when measured adapter-maintenance costs or a concrete multi-provider workflow backlog justify the license and operational burden. A procurement review should demonstrate each required operation, OAuth permission, webhook signature and data transformation; compare total annual licensing/usage/support costs; review credential custody, data locations, subprocessors, security certification evidence, audit retention/export, backup/restore, deletion, incident reporting, and exit/migration rights. Legal and data-handling approval must use the proposed contract and deployment, not vendor marketing statements. No paid platform was installed or connected.

## Primary vendor sources reviewed

* [Prismatic pricing](https://prismatic.io/pricing/) and [security policy](https://prismatic.io/legal/security/): evaluate a quote and agreed execution/security boundary; no numeric municipal cost was inferred.
* [Appmixer pricing and self-hosted offering](https://www.appmixer.com/pricing) and [OAuth connector configuration](https://docs.appmixer.com/getting-started/services): support the deployment and OAuth options above; exact local-provider coverage remains unverified.
* [Workato Embedded](https://docs.workato.com/en/oem.html), [embedded connection widget](https://docs.workato.com/en/oem/embedded-connections.html), [pricing documentation](https://docs.workato.com/pricing/), and [Embedded agreement](https://www.workato.com/legal/embedded-edition-agreement): separate product capabilities from quote/contract-specific licensing and custody terms.
