CREATE TABLE IF NOT EXISTS external_sync_mappings (
  id UUID PRIMARY KEY,
  installation_id UUID REFERENCES integration_installations(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK(direction IN ('inbound','outbound','bidirectional')),
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  schedule TEXT NOT NULL DEFAULT 'manual',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS external_sync_runs (
  id UUID PRIMARY KEY,
  mapping_id UUID NOT NULL REFERENCES external_sync_mappings(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
  imported_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
