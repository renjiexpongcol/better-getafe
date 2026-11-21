CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  default_model TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  default_provider TEXT NOT NULL DEFAULT 'openai',
  monthly_budget_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ai_settings (id, enabled) VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_modules (
  module_key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  model TEXT,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ai_modules (module_key) VALUES
  ('resident_assistant'),
  ('cms_content'),
  ('writing_assistant'),
  ('translation'),
  ('smart_search'),
  ('knowledge_base'),
  ('analytics_insights'),
  ('document_assistance'),
  ('accessibility_assistance'),
  ('moderation_assistance'),
  ('administrative_assistant'),
  ('workflow_automation')
ON CONFLICT (module_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_provider_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'openai',
  status TEXT NOT NULL DEFAULT 'not_configured',
  status_detail TEXT,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ai_provider_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id UUID PRIMARY KEY,
  module_key TEXT,
  model TEXT,
  status TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  request_id TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx ON ai_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_module_idx ON ai_usage_events (module_key, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_audit_logs (
  id UUID PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  module_key TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ai_audit_logs_created_idx ON ai_audit_logs (created_at DESC);
