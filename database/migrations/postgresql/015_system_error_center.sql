-- Grouped, protected diagnostic records for the administrator Error Center.
-- Technical values are redacted by the application before they are stored.
CREATE TABLE IF NOT EXISTS system_error_groups (
  id TEXT PRIMARY KEY,
  reference_id VARCHAR(20) NOT NULL UNIQUE,
  fingerprint VARCHAR(64) NOT NULL UNIQUE,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  state VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'acknowledged', 'resolved')),
  service VARCHAR(160) NOT NULL,
  route VARCHAR(1000) NOT NULL,
  method VARCHAR(16) NOT NULL,
  status INTEGER NOT NULL,
  internal_code VARCHAR(160) NOT NULL,
  technical_message TEXT NOT NULL,
  stack_trace TEXT NOT NULL,
  upstream_dependency VARCHAR(255),
  application_version VARCHAR(64),
  environment VARCHAR(32),
  request_id VARCHAR(160),
  user_id TEXT,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS system_error_groups_last_seen_idx ON system_error_groups (last_seen DESC);
CREATE INDEX IF NOT EXISTS system_error_groups_state_idx ON system_error_groups (state, last_seen DESC);
CREATE INDEX IF NOT EXISTS system_error_groups_service_idx ON system_error_groups (service, last_seen DESC);
CREATE INDEX IF NOT EXISTS system_error_groups_status_idx ON system_error_groups (status, last_seen DESC);
