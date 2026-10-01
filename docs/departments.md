# Departments & offices

The eight public menu destinations use `/departments/:slug`. The public directory
is `/departments`; former `/services/offices/:slug` links redirect to it.

The CMS module is **Departments & Offices** at `/admin/departments`. It requires
`departments.manage`, assigned through the existing Access Management interface.
The system administrator group automatically receives new permissions. Media
selection uses the existing Media Library and its permissions.

Office names, descriptions, responsibilities, programs, contact details, hours,
images, icons, display order and publication are editable. Office heads reference
the existing official profile slug. Executive also resolves the current mayor
from the same directory when no office head is explicitly selected.

Services are selected from `citizenServices`, with one owning department per
service in `department_services`. Remove a service from its current office before
assigning it elsewhere. Requests, appointments and payments use existing routes.
Health and Civil Registry retain links to their existing service information.

News selections reference existing records: only associated, published,
non-future articles appear publicly. Selected active media documents become
public with the office; media usage is tracked through `content_media`.

Unpublished offices return 404 through both collection and detail APIs. Empty
optional sections are hidden. Missing services and contact information have
explicit empty states. Public API responses omit admin relationship IDs and
technical errors. Concurrent reads are coalesced, with no retained content cache
that could delay publication updates.

The eight original office keys remain valid aliases even if an administrator
changes an office's slug. Those keys are reserved so another office cannot take
over a menu destination. Page metadata points to the current canonical slug.

Apply PostgreSQL migrations with `npm run migrate:postgres`, then restart the
backend. Migrations 016 and 017 create the model, seed the existing office names,
and preserve previously published overview text as editable content. They do not
invent programmes, eligibility, fees or contact information.

Checks: `node scripts/test-departments.mjs`; database-backed checks:
`node scripts/test-departments.mjs --integration`. The latter requires the local
configured PostgreSQL database and cleans up its temporary verification records.
