-- Database-backed ordering for the landing-page Popular services links.
-- Update popularity_score in this table to change the public ranking.
CREATE TABLE IF NOT EXISTS popular_services (
  id TEXT PRIMARY KEY,
  label VARCHAR(160) NOT NULL,
  href VARCHAR(255) NOT NULL UNIQUE,
  popularity_score INTEGER NOT NULL DEFAULT 0 CHECK (popularity_score >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS popular_services_public_order_idx
  ON popular_services (is_active, popularity_score DESC, updated_at DESC, id);

INSERT INTO popular_services (id, label, href, popularity_score, is_active)
VALUES
  ('national-id', 'National ID', '/services/certificates', 100, TRUE),
  ('business-permit', 'Business Permit', '/services/business-trade', 90, TRUE),
  ('barangay-clearance', 'Barangay Clearance', '/services/barangay-clearance', 80, TRUE)
ON CONFLICT (id) DO NOTHING;
