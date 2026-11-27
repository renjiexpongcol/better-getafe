# Managed Redis

The existing Vercel Marketplace integration is named `redis`; project environment metadata includes `MY_REDIS_REDIS_URL`. Its values, plan capacity and live health were not verified by metadata inspection. Do not provision a replacement automatically.

`MY_REDIS_REDIS_URL` is authoritative; `REDIS_URL` is accepted only when it matches or the primary is absent. Conflicting, local or malformed endpoints are invalid. Vercel requires `rediss://` TLS. This application uses the native Redis protocol and Lua transactions. A REST-only service cannot be substituted by renaming its URL; a separately reviewed adapter would be needed. No REST provider was observed in the connected integration metadata.

The centralized client coalesces connection attempts, disables offline queuing, caps the command queue at 1000, applies a five-second command timeout and bounds reconnection to five attempts with exponential delay and jitter. Readiness waits are bounded separately. Invalid configuration is reported as unavailable without throwing during API import. The development runner warns without restarting the whole application. No default localhost connection is initiated when configuration is absent.

Production sessions, atomic renewal/revocation and security-sensitive limits require Redis. A failed or missing registry yields controlled 503s; no production in-memory session fallback is introduced. Public traffic control retains its existing bounded local degraded fallback; it is not a substitute for distributed DDoS protection. Cache failures do not authorize private reads.

Production preserves the existing `REDIS_PREFIX` (default `getafe`) to avoid invalidating all sessions. Vercel Preview/development additionally scopes keys by stage and a hash of the branch identity. Configure a separate deployment's namespace and preferably resource for local testing; never point ordinary local development at the production session namespace.

Use the provider dashboard to verify TLS, connection limits, memory, eviction policy and persistence. Session and queue keys must not be arbitrarily evicted. Review queued/retry/dead-letter sizes and latency. Sensitive messages are stored in the configured Redis queues, so restrict access. Dead-letter retention is capped to 1000 records/30 days.

`npm run test:redis` exercises configuration and concurrent session failure behavior with isolated doubles. A live PING, expiring disposable-key test, distributed session test and capacity check are still required. Vercel marks the integration credentials sensitive, so CLI environment pulls cannot supply them to local runtime tests.

