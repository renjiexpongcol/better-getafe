-- Content is deliberately empty on a new installation. No sample records are published.
CREATE TABLE IF NOT EXISTS managed_public_content (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('page','hotlines','navigation','actions','home','help')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS managed_public_content_audit (
  id BIGSERIAL PRIMARY KEY,
  content_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  version INTEGER NOT NULL,
  previous_content JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
