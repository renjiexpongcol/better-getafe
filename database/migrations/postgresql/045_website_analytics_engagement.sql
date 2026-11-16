-- Additional, bounded website analytics. No query text, result URL, filter
-- values, or resident identity is stored in these rollups.

CREATE TABLE IF NOT EXISTS website_service_journey_daily (
  report_date DATE NOT NULL,
  service_id VARCHAR(192) NOT NULL,
  viewport VARCHAR(12) NOT NULL CHECK (viewport IN ('mobile', 'tablet', 'desktop', 'unknown')),
  stage VARCHAR(40) NOT NULL CHECK (stage IN ('service_viewed', 'requirements_opened', 'service_form_download_clicked', 'service_apply_clicked')),
  transitions BIGINT NOT NULL DEFAULT 0 CHECK (transitions >= 0),
  PRIMARY KEY (report_date, service_id, viewport, stage)
);
CREATE INDEX IF NOT EXISTS website_service_journey_date_idx
  ON website_service_journey_daily (report_date DESC, service_id, viewport, stage);

CREATE TABLE IF NOT EXISTS website_search_engagement_daily (
  report_date DATE NOT NULL,
  topic_ref VARCHAR(160) NOT NULL,
  source VARCHAR(8) NOT NULL CHECK (source IN ('typed', 'chip')),
  completed_submissions BIGINT NOT NULL DEFAULT 0 CHECK (completed_submissions >= 0),
  searches_with_result_click BIGINT NOT NULL DEFAULT 0 CHECK (searches_with_result_click >= 0),
  PRIMARY KEY (report_date, topic_ref, source)
);
CREATE INDEX IF NOT EXISTS website_search_engagement_date_idx
  ON website_search_engagement_daily (report_date DESC, topic_ref, source);

CREATE TABLE IF NOT EXISTS website_search_result_click_daily (
  report_date DATE NOT NULL,
  topic_ref VARCHAR(160) NOT NULL,
  source VARCHAR(8) NOT NULL CHECK (source IN ('typed', 'chip')),
  result_type VARCHAR(16) NOT NULL CHECK (result_type IN ('page', 'service', 'office', 'barangay', 'news', 'event', 'dataset')),
  position_bucket VARCHAR(8) NOT NULL CHECK (position_bucket IN ('1', '2-3', '4-10', '11+')),
  result_clicks BIGINT NOT NULL DEFAULT 0 CHECK (result_clicks >= 0),
  PRIMARY KEY (report_date, topic_ref, source, result_type, position_bucket)
);
CREATE INDEX IF NOT EXISTS website_search_result_click_date_idx
  ON website_search_result_click_daily (report_date DESC, topic_ref, source);

CREATE TABLE IF NOT EXISTS website_search_result_click_receipts (
  submission_id UUID NOT NULL,
  result_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (submission_id, result_hash)
);
CREATE INDEX IF NOT EXISTS website_search_result_receipts_expiry_idx
  ON website_search_result_click_receipts (expires_at);

CREATE TABLE IF NOT EXISTS website_open_data_daily (
  report_date DATE NOT NULL,
  dataset_id VARCHAR(192) NOT NULL,
  activity VARCHAR(24) NOT NULL CHECK (activity IN ('dataset_view', 'query_request', 'csv_download_click', 'xlsx_download_click')),
  events BIGINT NOT NULL DEFAULT 0 CHECK (events >= 0),
  PRIMARY KEY (report_date, dataset_id, activity)
);
CREATE INDEX IF NOT EXISTS website_open_data_date_dataset_idx
  ON website_open_data_daily (report_date DESC, dataset_id, activity);

-- Operational request telemetry is server generated and does not use cookie
-- preferences. Fixed dimensions and histogram buckets make its cardinality
-- bounded; each row is an additive histogram count, never a raw sample.
CREATE TABLE IF NOT EXISTS website_operation_daily (
  report_date DATE NOT NULL,
  operation VARCHAR(24) NOT NULL CHECK (operation IN ('search', 'dataset_query', 'dataset_export', 'public_404')),
  dataset_id VARCHAR(192) NOT NULL DEFAULT 'none',
  outcome VARCHAR(8) NOT NULL CHECK (outcome IN ('success', 'failure')),
  category VARCHAR(24) NOT NULL CHECK (category IN ('none', 'timeout', 'upstream_error', 'invalid_request', 'server_error', 'not_found')),
  cache_status VARCHAR(8) NOT NULL CHECK (cache_status IN ('hit', 'miss', 'unknown', 'none')),
  latency_bucket_ms INTEGER NOT NULL CHECK (latency_bucket_ms IN (0, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 240000, 240001)),
  requests BIGINT NOT NULL DEFAULT 0 CHECK (requests >= 0),
  PRIMARY KEY (report_date, operation, dataset_id, outcome, category, cache_status, latency_bucket_ms)
);
CREATE INDEX IF NOT EXISTS website_operation_date_idx
  ON website_operation_daily (report_date DESC, operation, dataset_id, outcome, category);

CREATE TABLE IF NOT EXISTS website_public_404_daily (
  report_date DATE NOT NULL,
  route_family VARCHAR(24) NOT NULL CHECK (route_family IN ('api', 'asset', 'services', 'data', 'news', 'events', 'barangays', 'other', 'unknown')),
  referring_section VARCHAR(24) NOT NULL CHECK (referring_section IN ('home', 'services', 'data', 'news', 'events', 'barangays', 'other', 'unknown')),
  responses BIGINT NOT NULL DEFAULT 0 CHECK (responses >= 0),
  PRIMARY KEY (report_date, route_family, referring_section)
);
CREATE INDEX IF NOT EXISTS website_public_404_date_idx
  ON website_public_404_daily (report_date DESC, route_family, referring_section);

ALTER TABLE search_submission_receipts
  ADD COLUMN IF NOT EXISTS has_result_click BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO website_analytics_settings (setting_key, date_value)
VALUES ('search_engagement_start', ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date + 1))
ON CONFLICT (setting_key) DO NOTHING;
