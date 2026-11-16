CREATE TABLE media_migration_runs (
  id UUID PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('inventory', 'copy', 'cutover')),
  status TEXT NOT NULL CHECK (status IN ('running', 'preview', 'ready', 'blocked', 'interrupted', 'restart_required', 'active', 'accepted')),
  source_bucket TEXT NOT NULL,
  started_by TEXT NOT NULL,
  confirmed_by TEXT,
  accepted_by TEXT,
  stage TEXT NOT NULL DEFAULT 'Starting',
  error TEXT,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE media_migration_entries (
  run_id UUID NOT NULL REFERENCES media_migration_runs(id),
  object_key TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  copied BOOLEAN NOT NULL DEFAULT FALSE,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id, object_key)
);

CREATE TABLE media_migration_reference_backup (
  run_id UUID NOT NULL REFERENCES media_migration_runs(id),
  media_id TEXT NOT NULL,
  original_provider TEXT,
  original_bucket TEXT NOT NULL,
  original_key TEXT NOT NULL,
  PRIMARY KEY (run_id, media_id)
);
