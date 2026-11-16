-- CMS database. No existing configuration or credentials are copied or activated.
CREATE TABLE integration_installations (
  id UUID PRIMARY KEY, connector_id TEXT NOT NULL UNIQUE,
  configuration JSONB NOT NULL DEFAULT '{}', credential JSONB,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected','pending_authorization','configured','connected','degraded','failed','disabled')),
  revision INTEGER NOT NULL DEFAULT 1,
  failures INTEGER NOT NULL DEFAULT 0, circuit_until TIMESTAMPTZ, next_request_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ, last_health_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE integration_jobs (
  id UUID PRIMARY KEY, installation_id UUID NOT NULL REFERENCES integration_installations(id),
  operation TEXT NOT NULL, idempotency_key TEXT NOT NULL, revision INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','dead','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_until TIMESTAMPTZ, lease_token UUID, error_code TEXT,
  created_by TEXT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
  UNIQUE(installation_id,idempotency_key)
);
CREATE INDEX integration_jobs_ready ON integration_jobs(available_at,created_at) WHERE status IN ('queued','running');
CREATE INDEX integration_jobs_history ON integration_jobs(installation_id,created_at DESC);
CREATE TABLE integration_webhook_events (
  installation_id UUID NOT NULL REFERENCES integration_installations(id), external_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL, event JSONB NOT NULL, job_id UUID UNIQUE REFERENCES integration_jobs(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(installation_id,external_id)
);
CREATE TABLE integration_executions (
  id UUID PRIMARY KEY, job_id UUID REFERENCES integration_jobs(id) ON DELETE SET NULL,
  installation_id UUID NOT NULL REFERENCES integration_installations(id), correlation_id UUID NOT NULL,
  outcome TEXT NOT NULL, error_code TEXT, latency_ms INTEGER NOT NULL, bytes INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX integration_execution_usage ON integration_executions(installation_id,created_at DESC);
CREATE TABLE integration_oauth_states (
  state_hash TEXT PRIMARY KEY, installation_id UUID NOT NULL REFERENCES integration_installations(id),
  actor_id TEXT NOT NULL REFERENCES users(id), verifier JSONB NOT NULL, revision INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE integration_audit (
  id UUID PRIMARY KEY, installation_id UUID NOT NULL REFERENCES integration_installations(id),
  actor_id TEXT REFERENCES users(id), action TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX integration_audit_history ON integration_audit(installation_id,created_at DESC);
CREATE TABLE integration_workers (
  id UUID PRIMARY KEY, heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
