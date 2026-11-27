# Background jobs

Historical database restores now persist a queue hold. Email delivery, integration claims, AI indexing and resident/staff outbox consumption remain paused until an operator reviews restored providers, identities and delivery records and runs `db:approve-restored-jobs` with explicit confirmation. See [DATABASE_RECOVERY.md](DATABASE_RECOVERY.md). A fresh installation without a restore does not have this hold.

Vercel function imports do not start the HTTP listener, PSGC schedule, AI timer, email timer, e-service polling or analytics cleanup timer. Updating PSGC configuration also does not start a timer in function mode. Long media migrations are rejected from the function-hosted admin mutation route.

## Scheduled functions

`vercel.json` schedules `GET /api/internal/jobs/psgc` at 16:00 UTC (00:00 Asia/Manila) and `GET /api/internal/jobs/media-cleanup` at 16:15 UTC (00:15 Asia/Manila). Each is once daily to avoid assuming higher-frequency plan entitlements. Verify the project's actual cron and duration limits before deployment. Vercel sends `Authorization: Bearer <CRON_SECRET>`; missing/incorrect values fail constant-time verification. The secret must be at least 32 characters.

Each allowlisted name gets a durable daily claim in `scheduled_job_runs`. Concurrent/repeated delivery cannot execute a claimed/completed run again. Interrupted leases expire after two minutes; failures have exponential retry availability and a three-attempt ceiling. A later authenticated delivery can retry; no guarantee is made that Cron automatically retries. Monitor failed/stale runs and deliberately redeliver after the backoff. These operations must remain idempotent if a process dies after effects but before completion.

PSGC checks the saved 24-barangay snapshot and does not fetch a complete national dataset at startup. Failed synchronization preserves the previous valid snapshot. Orphan cleanup in a function examines only one expired upload per call to bound work; higher backlog throughput belongs in the external worker/approved maintenance process. Inspect scanned/removed counts; a cleanup failure must not be reported as verified deletion.

## External execution

Provision a managed container/Node worker host with the same reviewed source, Node 24 and server-only environment. Its command is:

```powershell
npm ci --omit=dev
npm run worker:managed
```

Run `server/managed-worker.js` outside Vercel. It acquires a dedicated PostgreSQL session advisory lock before recovering or consuming email work. A second replica cannot requeue messages being sent by the first. Losing the connection stops the worker; configure the host supervisor with bounded exponential restart backoff and alerting. It writes `managed_worker_state` heartbeats, drains durable resident/staff notification outboxes, sends queued email, runs AI knowledge jobs and claims existing integration jobs when the vault is configured. The existing integration service retains lease tokens, circuit breaking, retry limits, idempotency keys and dead states.

Email failure transitions atomically remove a processing item and add its retry/dead-letter state in one Redis Lua operation. Retries use bounded exponential backoff, at most five delivery attempts, and persistent dead-letter records. Successful external SMTP delivery followed by a crash before acknowledgement can still duplicate an email; SMTP does not provide exactly-once delivery. Track the application delivery ID and use a provider with idempotency support if strict deduplication is required.

AI rebuilds can exceed a function's duration, so they remain on this external worker. Its existing claim uses row locks/SKIP LOCKED, persisted attempts and recovery of interrupted jobs. Full-source rebuild memory/time budgets and embedding costs still require load testing; do not claim them verified from unit tests. Outbox and AI schemas remain unchanged.

Analytics cleanup is available as an explicit external maintenance command: `npm run analytics:cleanup`. Schedule it on the worker host under the municipality's retention policy. No automatic production data cleanup was executed during this work.

Admin Settings > System status includes the actual worker heartbeat and latest persisted scheduled status. A stopped/unprovisioned worker is unavailable, not operational merely because the code exists. Verify a disposable email, integration job, AI indexing job and a successful cron run before release.

