-- Account-backed preferences for the authenticated resident portal.
-- This is separate from notification delivery preferences and is never used
-- by administrator or staff interfaces.
CREATE TABLE IF NOT EXISTS portal_user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  appearance JSONB NOT NULL DEFAULT '{"theme":"system","contrast":"standard","textScale":"default","reduceMotion":false,"density":"comfortable"}'::jsonb,
  locale JSONB NOT NULL DEFAULT '{"language":"en","region":"PH","timezone":"Asia/Manila","dateFormat":"long","timeFormat":"12h","weekStart":"sunday"}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
