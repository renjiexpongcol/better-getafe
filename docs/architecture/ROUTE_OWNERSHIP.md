# Route ownership baseline

This is the initial ownership map used during frontend extraction. It does not change routing.

## Public web

- `/`
- `/info/*`
- `/about*`
- `/services*` (public service information)
- `/departments*`
- `/barangays*`
- `/officials*`
- `/news*`
- `/events*`
- `/tourism*`
- `/discover*`
- `/weather*`
- `/data*`
- `/contact`
- `/accessibility`
- `/legal/*`

## Resident application

- `/app`
- `/app/profile`
- `/app/setup`
- `/app/services*`
- `/app/e-requests*`
- `/app/e-payment*`
- `/app/e-billing*`
- `/app/requests*`
- `/app/notifications`
- `/app/documents`
- `/app/appointments`
- `/app/payments`
- `/app/settings`
- `/app/help`

## Staff and administration

- `/app/staff*`
- `/admin*`

These routes require backend authorization even after frontend extraction.

## API ownership target

The existing `/api/*` paths remain compatibility routes. New consumers should migrate to:

- `/api/v1/public/*`
- `/api/v1/auth/*`
- `/api/v1/resident/*`
- `/api/v1/admin/*`

No legacy route should be removed until contract tests and usage telemetry confirm that consumers have migrated.
