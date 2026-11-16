CREATE TABLE IF NOT EXISTS search_topics (
  id TEXT PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  canonical_query VARCHAR(160) NOT NULL,
  normalized_query VARCHAR(160) NOT NULL UNIQUE,
  public_visible BOOLEAN NOT NULL DEFAULT TRUE,
  pin_order INTEGER CHECK (pin_order IS NULL OR pin_order BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS search_topic_terms (
  normalized_term VARCHAR(160) PRIMARY KEY,
  term VARCHAR(160) NOT NULL,
  topic_id TEXT NOT NULL REFERENCES search_topics(id) ON DELETE RESTRICT,
  is_canonical BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS search_topic_terms_topic_idx ON search_topic_terms(topic_id);

CREATE TABLE IF NOT EXISTS search_topic_daily (
  search_date DATE NOT NULL,
  topic_id TEXT NOT NULL REFERENCES search_topics(id) ON DELETE RESTRICT,
  typed_submissions BIGINT NOT NULL DEFAULT 0 CHECK (typed_submissions >= 0),
  chip_clicks BIGINT NOT NULL DEFAULT 0 CHECK (chip_clicks >= 0),
  typed_zero_results BIGINT NOT NULL DEFAULT 0 CHECK (typed_zero_results >= 0),
  chip_zero_results BIGINT NOT NULL DEFAULT 0 CHECK (chip_zero_results >= 0),
  PRIMARY KEY (search_date, topic_id)
);
CREATE INDEX IF NOT EXISTS search_topic_daily_topic_date_idx ON search_topic_daily(topic_id, search_date DESC);

CREATE TABLE IF NOT EXISTS search_daily_unmatched (
  search_date DATE PRIMARY KEY,
  unmatched_typed_submissions BIGINT NOT NULL DEFAULT 0 CHECK (unmatched_typed_submissions >= 0),
  unmatched_zero_results BIGINT NOT NULL DEFAULT 0 CHECK (unmatched_zero_results >= 0)
);

-- Keep only opaque submission IDs and aggregate metadata for retry-safe writes.
-- No submitted text, IP address, or user identity is stored in this receipt.
CREATE TABLE IF NOT EXISTS search_submission_receipts (
  submission_id UUID PRIMARY KEY,
  search_date DATE NOT NULL,
  topic_id TEXT REFERENCES search_topics(id) ON DELETE RESTRICT,
  source VARCHAR(8) NOT NULL CHECK (source IN ('typed', 'chip')),
  zero_results BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO search_topics (id, label, canonical_query, normalized_query, public_visible, pin_order)
VALUES
  ('search-topic-business-permit', 'Business Permit', 'Business Permit', 'business permit', TRUE, 1),
  ('search-topic-barangay-clearance', 'Barangay Clearance', 'Barangay Clearance', 'barangay clearance', TRUE, 2),
  ('search-topic-certificates', 'Certificates & IDs', 'Certificates and IDs', 'certificates and ids', TRUE, 3),
  ('search-topic-events', 'Events & Meetings', 'Events and Meetings', 'events and meetings', TRUE, 4),
  ('search-topic-open-data', 'Open Data', 'Open Data', 'open data', TRUE, 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO search_topic_terms (normalized_term, term, topic_id, is_canonical)
VALUES
  ('business permit', 'Business Permit', 'search-topic-business-permit', TRUE),
  ('business permits', 'Business Permits', 'search-topic-business-permit', FALSE),
  ('business permit renewal', 'Business Permit Renewal', 'search-topic-business-permit', FALSE),
  ('business permits and licenses', 'Business Permits and Licenses', 'search-topic-business-permit', FALSE),
  ('bplo', 'BPLO', 'search-topic-business-permit', FALSE),
  ('barangay clearance', 'Barangay Clearance', 'search-topic-barangay-clearance', TRUE),
  ('barangay clearances', 'Barangay Clearances', 'search-topic-barangay-clearance', FALSE),
  ('certificates and ids', 'Certificates and IDs', 'search-topic-certificates', TRUE),
  ('certificates ids', 'Certificates IDs', 'search-topic-certificates', FALSE),
  ('certificate', 'Certificate', 'search-topic-certificates', FALSE),
  ('national id', 'National ID', 'search-topic-certificates', FALSE),
  ('events and meetings', 'Events and Meetings', 'search-topic-events', TRUE),
  ('events', 'Events', 'search-topic-events', FALSE),
  ('meetings', 'Meetings', 'search-topic-events', FALSE),
  ('open data', 'Open Data', 'search-topic-open-data', TRUE),
  ('datasets', 'Datasets', 'search-topic-open-data', FALSE),
  ('statistics', 'Statistics', 'search-topic-open-data', FALSE)
ON CONFLICT (normalized_term) DO NOTHING;
