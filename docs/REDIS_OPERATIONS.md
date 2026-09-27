# Redis operations

The local Compose Redis service is reachable from the host at `127.0.0.1:6379` and from its Compose network as `redis:6379` (set `REDIS_URL` accordingly). Port 6379 is not published by the Compose service; the currently running development container publishes it on `127.0.0.1` only.

The Redis instance is capped at 256 MB and uses `noeviction`. This is deliberate because rate limits, auth revocations, sessions, and queued work share Redis with disposable cache entries. When memory is full, writes fail instead of silently evicting correctness-sensitive keys. Cache reads fall back to PostgreSQL and cache writes are skipped; email enqueueing and distributed coordination fail explicitly when Redis cannot accept writes. Monitor memory and provision capacity before production workloads grow.

Compose enables AOF, persists `/data` in a named Docker volume, and checks Redis with `PING`. The running development instance reports `appendonly yes` and `appendfsync everysec`; a host or container failure can still lose roughly the most recent second of Redis writes. Losing the volume loses cache and counters, active-session listings, temporary OTP/block/rate-limit state, and any queued jobs. PostgreSQL records remain authoritative; Redis persistence is not a substitute for PostgreSQL backups or transactions.

Do not expose Redis directly to the internet. Production should use a private service network, an authenticated/TLS managed Redis endpoint where the deployment requires it, and a separately sized cache instance if cache growth could threaten core Redis capacity. Review `used_memory`, `maxmemory`, `evicted_keys`, `expired_keys`, and connected clients during deployment operations.

The current email worker is a bounded, single-process Redis list consumer with retries. It is not a durable multi-worker job system: a process crash after dequeue can lose the in-flight email, and delayed jobs, notifications, dead-letter retry UI, priorities, and scheduled work are not configured. Use a queue system with explicit acknowledgements and worker recovery before relying on Redis for critical delivery.
