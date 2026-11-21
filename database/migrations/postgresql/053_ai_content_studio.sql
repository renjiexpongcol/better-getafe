CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  id UUID PRIMARY KEY,
  template_key TEXT UNIQUE NOT NULL,
  tone TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  prompt_template TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_content_generations (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  tone TEXT NOT NULL,
  module_key TEXT NOT NULL,
  generation_status TEXT NOT NULL DEFAULT 'generated',
  publication_status TEXT NOT NULL DEFAULT 'pending_review',
  published_article_id TEXT,
  input_facts_redacted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_content_generations_user_idx
  ON ai_content_generations (user_id, created_at DESC);
