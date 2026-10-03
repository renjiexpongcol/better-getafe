# Backend lifecycle and dependency recovery

## Audit findings

`npm run dev` previously launched `node --watch server.js`. Node's watcher is
the source of the `Restarting 'server.js'` wording. The entrypoint itself only
imports `server/index.js`; it does not implement a restart loop. Source changes
restart the worker. No historical log in this repository proves which file
changed in the reported incident, and ordinary `fs` writes are not automatically
watched imports. The fix explicitly limits development reloads to executable
source, `.env`, and `package.json`, excluding runtime files.
Each deliberate source restart now prints the triggering filenames, so future
incidents can be traced to a specific change instead of inferred from a proxy error.

There were separate, reproducible exit paths:

- Neither the settings PostgreSQL pool nor the application PostgreSQL pools
  had an `error` listener. Dropping an idle PostgreSQL connection could emit an
  unhandled EventEmitter error, reach `uncaughtException`, and exit with code 1.
  Checked-out clients also need listeners for disconnects between queries.
- The email worker's final promise had no rejection handler. An exception in
  delivery failure callbacks or bookkeeping could reach `unhandledRejection`
  and exit with code 1.
- Startup rejected a temporary PostgreSQL/settings-store outage and explicitly
  exited. Failed storage/SMTP probes discarded their clients, preventing normal
  per-operation recovery.
- The development runner killed frontend and backend after six failed health
  probes. `/health` previously mixed process liveness with dependency status.

Dockerfile runs `node server.js` directly. Repository Compose restart policies
apply to infrastructure containers, not the Node server. There is no nodemon,
tsx-watch, concurrently, or application `process.abort` path. The unused legacy
`scripts/server-runner.mjs` restarts only on exit code 75; no backend path emits
that code. Existing fatal handlers and the shutdown deadline remain intentional.

## Resulting behavior

Express 5 catches rejected promises returned by asynchronous route handlers.
The existing final error middleware handles request errors; network/dependency
failures map to 503, timeouts to 504, and unexpected errors to 500 unless an
operation supplies an explicit status. Diagnostic details remain in operator
logs. Vite returns safe JSON with HTTP 503 for upstream failures, including
closed/partially sent responses and upgrade sockets. Login shows a generic
outage message and does not replay the login POST automatically.

All PostgreSQL pools have bounded connection/query/idle waits and pool/client
error listeners. Failed idle clients are removed by pg; subsequent requests
acquire new connections. Database writes and transactions are not automatically
replayed. Transaction cleanup releases clients even when commit/rollback fails.
At startup a temporary connection failure retains a configured pool. Invalid
configuration, authentication failures, missing databases and incompatible
required schema still reject normal initialization. If the settings store is
temporarily unavailable at cold startup, validated environment defaults are
used to prepare clients, but application routes remain gated until the saved
security/configuration snapshot is available. Settings loading is attempted
again at the existing 30-second interval.

Redis disables the offline command queue and reconnects with exponential
backoff and jitter (about 1, 2, 4, 8, 16, then at most 30 seconds). Optional
features degrade; production authentication still fails closed when Redis is
required. B2/SMTP retain configured clients after temporary startup failures.
B2 retries are bounded with jitter; SDK retries are not multiplied by wrapper
retries. Fixed-key, fixed-byte S3 uploads can safely overwrite the same object;
application writes and other non-idempotent HTTP requests are not retried.
SMTP jobs retain their existing five-attempt retry/dead-letter policy; worker
callback failures are logged locally rather than escaping to process level.

HTTP binds immediately after critical local secret and port validation, before
network initialization. The lifecycle is STARTING, READY, DEGRADED, or
SHUTTING_DOWN. STARTING application requests return safe 503 JSON with
Retry-After: 2; no application handler runs before initialization, the settings
snapshot, required database schema, and production Redis are ready. Shutdown
closes admission before draining connections and dependencies.

`GET /health` (and liveness aliases) returns 200 before dependency middleware.
`GET /ready` reports lifecycle and core readiness, probing CMS/resident databases;
the initial settings snapshot, databases, plus Redis in production, determine readiness. Storage is a
feature dependency and does not block the entire portal. Readiness checks do
not stop processes. Unexpected unhandled programming errors remain fatal with
redacted stack diagnostics; there is no global ignore-network-errors handler.

B2 HeadBucket runs after client activation in the background during cold
startup. Slow/unavailable B2 cannot delay the HTTP listener or core readiness.
Subsequent storage operations update its health and recover with the retained
client. Runtime settings updates continue validating replacements before
activating them. Redis starts alongside configuration initialization.

The frontend previously retried through the global fetch wrapper and again
through its request cache; Discover's abort-on-cleanup effect also sent a new
request during StrictMode replay. Public configuration refreshed on every focus.
Transport now owns retries. Network reads have at most three attempts; explicitly
startup-sensitive config/Discover reads have four total attempts, spaced by
2, 4, and 8 seconds, respecting Retry-After. A server cooldown longer than the
30-second retry window stops retries rather than shortening the cooldown.
Other 503s and 429s are not automatically replayed. Mutations always have one
attempt. Shared config/Discover promises coalesce concurrent consumers and
StrictMode replay; subscriptions stop updating on unmount without aborting work
needed by another subscriber. Config focus refreshes are throttled to its normal
five-minute freshness period. A failed cold config load stops background retries
until explicit refresh/reload. The UI keeps its loading state through the bounded
startup window, then offers a safe unavailable page and manual retry.

Vite's configured logger suppresses only its duplicate log for expected network
proxy errors already handled by our proxy listener. The structured diagnostic is
limited to one per error code per ten seconds; unexpected proxy exceptions still
reach Vite's normal logger. Development frontend-only mode starts even without
the backend. The normal launcher starts Vite after HTTP liveness, while the
frontend handles readiness through the same controlled API contract.

## Verification

- `node --test scripts/test-runtime-resilience.mjs scripts/test-config-service.mjs scripts/test-error-handling.mjs`
- `node scripts/test-storage.mjs`
- `node scripts/test-dependency-recovery.mjs`
- `node scripts/test-backend-watch.mjs`
- `node scripts/test-startup-ui.mjs`
- `node scripts/test-request-cache.mjs`
- `npm run build`

The recovery test routes an isolated backend's real PostgreSQL and Redis
connections through local TCP relays, drops established sockets, rejects new
connections, then restores connectivity. It checks controlled database 503s,
readiness/liveness, successful requests after recovery, and unchanged worker
PID. Shared database/Redis services are not stopped. A fake B2 client injects
an unreachable-storage error; SMTP and worker callback failures are injected.
It also tests startup while dependencies are down and later recovery. The Vite
test uses a real upstream HTTP socket reset and connection refusal. The watcher
test creates an isolated temporary checkout, writes runtime files, verifies its
PID, and confirms that a source edit still reloads the worker.

Latest outage run: PID before=13680, after=13680 for PostgreSQL, Redis, and B2.
The startup test delays initial configuration and B2 independently, proving
health=200 and ready/config=503 during STARTING, and core readiness before B2.
The real-browser startup test uses the actual configured Vite proxy: Vite starts
before its upstream, recovers automatically (three spaced config attempts), and
sends one Discover request under StrictMode. Reload during initialization shows
loading without error flashing. A prolonged outage produces exactly four config
requests, no render/focus feedback loop, and successful manual recovery.
Browser API content comes from a controlled HTTP fixture; backend dependency
failure tests use the real configured PostgreSQL/Redis clients.

These tests do not disconnect the actual remote B2 service or send real email.
They exercise failure boundaries without interrupting the user's running portal.

References: [pg pool error events](https://node-postgres.com/apis/pool),
[Node watch mode](https://nodejs.org/download/release/v22.17.0/docs/api/cli.html).
