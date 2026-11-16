CREATE TABLE IF NOT EXISTS database_migration_runs (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'Starting',
  started_by TEXT NOT NULL,
  confirmed_by TEXT,
  source_inventory JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_inventory JSONB NOT NULL DEFAULT '{}'::jsonb,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS database_migration_tables (
  run_id UUID NOT NULL REFERENCES database_migration_runs(id) ON DELETE CASCADE,
  database_category TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  strategy TEXT NOT NULL DEFAULT 'primary-key-upsert',
  rows_source BIGINT NOT NULL DEFAULT 0,
  rows_copied BIGINT NOT NULL DEFAULT 0,
  last_key JSONB,
  source_checksum TEXT,
  target_checksum TEXT,
  error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, database_category, schema_name, table_name)
);

CREATE INDEX IF NOT EXISTS database_migration_runs_updated_idx ON database_migration_runs (updated_at DESC);
