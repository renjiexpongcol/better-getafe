# Redis operations

The portal uses the existing Vercel Redis integration (`redis-bistre-prism`) for development, preview, and production. Attach the integration to the `better-getafe` project in the `lgu-getafe` team, then run `vercel link` and `vercel env pull .env.development.local` for local development. The file is excluded from Git. Set `MY_REDIS_REDIS_URL` in each deployment environment. During migration, an authenticated managed `REDIS_URL` is accepted only when the primary variable is unset; conflicting values fail startup. Local Redis URLs are rejected.

A single client serves sessions, revocation, rate limits, cache and queues and closes during shutdown. A failed Redis connection is never a healthy authentication store. Keep security keys separate from disposable cache keys using the existing `REDIS_PREFIX` and namespaced key functions.

The 30 MB plan needs monitoring. Review memory, connected clients, expired and evicted keys, and command latency in the managed service. Do not enable eviction of active sessions. If memory pressure grows, reduce disposable cache size or provision more capacity before session writes begin failing. Do not store media or indexed AI documents in Redis.

If Redis is unavailable, authentication and critical Redis-backed jobs fail closed. Public traffic limiting uses a bounded per-process emergency limiter during an outage; it cannot provide distributed guarantees until Redis recovers. Public pages and traditional search remain available when optional AI or mail services fail.
