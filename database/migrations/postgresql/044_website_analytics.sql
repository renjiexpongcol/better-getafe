-- First-party, consent-gated daily reporting. No per-visitor or raw URL data.
CREATE TABLE IF NOT EXISTS website_analytics_event_receipts (
  event_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS website_analytics_receipts_expiry_idx
  ON website_analytics_event_receipts (expires_at);

CREATE TABLE IF NOT EXISTS website_page_view_daily (
  report_date DATE NOT NULL,
  route_key VARCHAR(120) NOT NULL,
  viewport VARCHAR(12) NOT NULL CHECK (viewport IN ('mobile', 'tablet', 'desktop', 'unknown')),
  entry_source VARCHAR(24) NOT NULL CHECK (entry_source IN ('direct_or_unknown', 'internal', 'search', 'external', 'none')),
  views BIGINT NOT NULL DEFAULT 0 CHECK (views >= 0),
  PRIMARY KEY (report_date, route_key, viewport, entry_source)
);
CREATE INDEX IF NOT EXISTS website_page_views_date_route_idx
  ON website_page_view_daily (report_date DESC, route_key);
CREATE INDEX IF NOT EXISTS website_page_views_route_date_idx
  ON website_page_view_daily (route_key, report_date DESC);

CREATE TABLE IF NOT EXISTS website_action_daily (
  report_date DATE NOT NULL,
  action_key VARCHAR(48) NOT NULL CHECK (action_key IN ('browse_services_click', 'report_concern_click', 'open_data_xlsx_request')),
  actions BIGINT NOT NULL DEFAULT 0 CHECK (actions >= 0),
  PRIMARY KEY (report_date, action_key)
);
CREATE INDEX IF NOT EXISTS website_action_daily_date_action_idx
  ON website_action_daily (report_date DESC, action_key);

-- Do not represent pre-consent search history as opt-in activity. Collection
-- is scheduled to start no earlier than the next Manila calendar day after
-- this migration; operators still keep the server kill switch off until the
-- privacy owner has approved the notice and inventory.
CREATE TABLE IF NOT EXISTS website_analytics_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  date_value DATE NOT NULL
);
INSERT INTO website_analytics_settings (setting_key, date_value)
VALUES ('search_analytics_consent_start', ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date + 1))
ON CONFLICT (setting_key) DO NOTHING;

-- Existing search completion already responds only after its PostgreSQL
-- transaction commits. Add bounded retry receipts; repeated event IDs remain
-- deduplicated for seven days after commit.
ALTER TABLE search_submission_receipts
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
UPDATE search_submission_receipts
   SET expires_at = created_at + INTERVAL '7 days'
 WHERE expires_at IS NULL;
ALTER TABLE search_submission_receipts
  ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
  ALTER COLUMN expires_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS search_submission_receipts_expiry_idx
  ON search_submission_receipts (expires_at);
