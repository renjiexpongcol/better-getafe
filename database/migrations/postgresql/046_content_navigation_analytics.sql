-- Content reach, homepage popup, and public navigation placement analytics.
-- All identifiers are public IDs or bounded route keys; no labels or URLs are stored.

CREATE TABLE IF NOT EXISTS website_content_view_daily (
  report_date DATE NOT NULL,
  content_id VARCHAR(192) NOT NULL,
  content_type VARCHAR(16) NOT NULL CHECK (content_type IN ('news', 'announcement', 'event', 'meeting', 'service')),
  views BIGINT NOT NULL DEFAULT 0 CHECK (views >= 0),
  PRIMARY KEY (report_date, content_id, content_type)
);
CREATE INDEX IF NOT EXISTS website_content_view_date_type_idx
  ON website_content_view_daily (report_date DESC, content_type, content_id);

CREATE TABLE IF NOT EXISTS website_announcement_daily (
  report_date DATE NOT NULL,
  article_id VARCHAR(192) NOT NULL,
  interaction VARCHAR(12) NOT NULL CHECK (interaction IN ('impression', 'open', 'dismiss')),
  interactions BIGINT NOT NULL DEFAULT 0 CHECK (interactions >= 0),
  PRIMARY KEY (report_date, article_id, interaction)
);
CREATE INDEX IF NOT EXISTS website_announcement_date_article_idx
  ON website_announcement_daily (report_date DESC, article_id, interaction);

CREATE TABLE IF NOT EXISTS website_announcement_impression_receipts (
  impression_id UUID PRIMARY KEY,
  article_id VARCHAR(192) NOT NULL,
  report_date DATE NOT NULL,
  has_open BOOLEAN NOT NULL DEFAULT FALSE,
  has_dismiss BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS website_announcement_receipts_expiry_idx
  ON website_announcement_impression_receipts (expires_at);

CREATE TABLE IF NOT EXISTS website_navigation_daily (
  report_date DATE NOT NULL,
  placement_key VARCHAR(64) NOT NULL CHECK (placement_key ~ '^[a-z][a-z0-9._-]{0,63}$'),
  destination_id VARCHAR(192) NOT NULL,
  slot_position SMALLINT NOT NULL DEFAULT 0 CHECK (slot_position BETWEEN 0 AND 5),
  viewport VARCHAR(12) NOT NULL CHECK (viewport IN ('mobile', 'tablet', 'desktop', 'unknown')),
  impressions BIGINT NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks BIGINT NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  impressions_with_click BIGINT NOT NULL DEFAULT 0 CHECK (impressions_with_click >= 0),
  PRIMARY KEY (report_date, placement_key, destination_id, slot_position, viewport)
);
CREATE INDEX IF NOT EXISTS website_navigation_date_placement_idx
  ON website_navigation_daily (report_date DESC, placement_key, viewport, slot_position);

CREATE TABLE IF NOT EXISTS website_navigation_impression_receipts (
  impression_id UUID PRIMARY KEY,
  report_date DATE NOT NULL,
  placement_key VARCHAR(64) NOT NULL,
  destination_id VARCHAR(192) NOT NULL,
  slot_position SMALLINT NOT NULL DEFAULT 0,
  viewport VARCHAR(12) NOT NULL,
  has_click BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS website_navigation_receipts_expiry_idx
  ON website_navigation_impression_receipts (expires_at);

INSERT INTO website_analytics_settings (setting_key, date_value)
VALUES ('content_navigation_start', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date)
ON CONFLICT (setting_key) DO NOTHING;
