-- External API credentials and access audit. Secrets are never stored in clear text.
CREATE TABLE IF NOT EXISTS external_api_keys (
  id UUID PRIMARY KEY,
  key_id TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(500) NOT NULL DEFAULT '',
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ip_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  secret_hash TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  last_used_ip INET,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS external_api_keys_active_idx ON external_api_keys(key_id) WHERE enabled AND revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS external_api_key_audit (
  id UUID PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES external_api_keys(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  ip_address INET,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS external_api_key_audit_history ON external_api_key_audit(api_key_id, created_at DESC);
