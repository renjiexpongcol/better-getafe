-- Resident notification preferences and delivery audit records.
-- Optional email preferences are deliberately separate from authentication
-- emails and from the in-app notifications feed.
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  request_updates BOOLEAN NOT NULL DEFAULT TRUE,
  appointment_updates BOOLEAN NOT NULL DEFAULT TRUE,
  document_updates BOOLEAN NOT NULL DEFAULT TRUE,
  payment_updates BOOLEAN NOT NULL DEFAULT TRUE,
  service_updates BOOLEAN NOT NULL DEFAULT TRUE,
  municipal_announcements BOOLEAN NOT NULL DEFAULT TRUE,
  event_updates BOOLEAN NOT NULL DEFAULT FALSE,
  account_updates BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Preserve the preference already stored on the resident profile when this
-- normalized preference record is introduced.
INSERT INTO user_notification_preferences (user_id, email_enabled, created_at, updated_at)
SELECT user_id, email_notifications, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM resident_profiles
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  notification_id TEXT REFERENCES notifications(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  channel VARCHAR(32) NOT NULL CHECK (channel IN ('email', 'sms', 'in_app')),
  type VARCHAR(96) NOT NULL,
  deduplication_key VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'suppressed')),
  reason VARCHAR(64),
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_code VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_channel_key_idx
  ON notification_deliveries(channel, deduplication_key);
CREATE INDEX IF NOT EXISTS notification_deliveries_user_idx
  ON notification_deliveries(user_id, created_at DESC);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(96);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_key VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_idx
  ON notifications(user_id, event_key)
  WHERE event_key IS NOT NULL;

ALTER TABLE application_status_history ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) NOT NULL DEFAULT 'public';
