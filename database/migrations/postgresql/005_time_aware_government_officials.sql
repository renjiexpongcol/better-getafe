-- Time-aware government-official directory.  The existing site_pages
-- "officials" document remains the source for legacy CMS content while this
-- normalised model stores people, offices, tenure, and external provenance.
-- No existing public content, media path, or URL is removed by this migration.

CREATE TABLE IF NOT EXISTS government_people (
  id TEXT PRIMARY KEY,
  display_name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  profile_slug VARCHAR(280) NOT NULL UNIQUE,
  biography TEXT,
  photo TEXT,
  contact JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS government_positions (
  id TEXT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  jurisdiction_type VARCHAR(32) NOT NULL CHECK (jurisdiction_type IN ('municipal', 'barangay')),
  cardinality VARCHAR(16) NOT NULL DEFAULT 'single' CHECK (cardinality IN ('single', 'multiple')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS government_office_assignments (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES government_people(id) ON DELETE RESTRICT,
  position_id TEXT NOT NULL REFERENCES government_positions(id) ON DELETE RESTRICT,
  jurisdiction_type VARCHAR(32) NOT NULL CHECK (jurisdiction_type IN ('municipal', 'barangay')),
  jurisdiction_id TEXT,
  term_start DATE,
  term_end DATE,
  service_start DATE,
  service_end DATE,
  election_year INTEGER CHECK (election_year BETWEEN 1900 AND 2200),
  election_type VARCHAR(80),
  assumption_type VARCHAR(24) NOT NULL DEFAULT 'unknown' CHECK (assumption_type IN ('elected', 'appointed', 'succession', 'acting', 'ex_officio', 'unknown')),
  source_type VARCHAR(32) NOT NULL DEFAULT 'cms' CHECK (source_type IN ('cms', 'bettergov', 'manual', 'mixed')),
  source_reference TEXT,
  source_provider VARCHAR(64),
  source_person_id VARCHAR(128),
  source_contest_id VARCHAR(255),
  external_match_confidence VARCHAR(24),
  local_match_confidence VARCHAR(24),
  verification_status VARCHAR(24) NOT NULL DEFAULT 'unlinked' CHECK (verification_status IN ('verified', 'suggested', 'rejected', 'unlinked')),
  is_manually_verified BOOLEAN NOT NULL DEFAULT FALSE,
  election_result VARCHAR(24) CHECK (election_result IN ('winner', 'candidate')),
  election_party VARCHAR(255),
  election_votes BIGINT CHECK (election_votes >= 0),
  election_vote_link VARCHAR(80),
  source_data_vintage VARCHAR(80),
  source_api_version VARCHAR(32),
  source_last_synced_at TIMESTAMPTZ,
  source_verified_at TIMESTAMPTZ,
  source_verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  legacy_source_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (term_end IS NULL OR term_start IS NULL OR term_end > term_start),
  CHECK (service_end IS NULL OR service_start IS NULL OR service_end > service_start)
);

CREATE TABLE IF NOT EXISTS bettergov_cache (
  cache_key VARCHAR(500) PRIMARY KEY,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS official_external_sync_reviews (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES government_office_assignments(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  observed_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS government_office_assignments_person_idx ON government_office_assignments(person_id);
CREATE INDEX IF NOT EXISTS government_office_assignments_position_jurisdiction_idx ON government_office_assignments(position_id, jurisdiction_type, jurisdiction_id);
CREATE INDEX IF NOT EXISTS government_office_assignments_service_idx ON government_office_assignments(service_start, service_end);
CREATE INDEX IF NOT EXISTS government_office_assignments_external_idx ON government_office_assignments(source_provider, source_person_id, source_contest_id);
CREATE INDEX IF NOT EXISTS official_external_sync_reviews_pending_idx ON official_external_sync_reviews(status, created_at DESC);
CREATE INDEX IF NOT EXISTS bettergov_cache_expiry_idx ON bettergov_cache(expires_at);

-- Baseline office catalogue.  The distinct cardinality lets validation reject
-- overlapping mayors and vice mayors while allowing councilors and kagawads.
INSERT INTO government_positions (id, name, slug, jurisdiction_type, cardinality)
VALUES
  ('position-municipal-mayor', 'Municipal Mayor', 'municipal-mayor', 'municipal', 'single'),
  ('position-municipal-vice-mayor', 'Municipal Vice Mayor', 'municipal-vice-mayor', 'municipal', 'single'),
  ('position-sangguniang-bayan-member', 'Sangguniang Bayan Member', 'sangguniang-bayan-member', 'municipal', 'multiple'),
  ('position-abc-president', 'ABC President', 'abc-president', 'municipal', 'single'),
  ('position-punong-barangay', 'Punong Barangay', 'punong-barangay', 'barangay', 'single'),
  ('position-barangay-kagawad', 'Barangay Kagawad', 'barangay-kagawad', 'barangay', 'multiple'),
  ('position-sk-chairperson', 'SK Chairperson', 'sk-chairperson', 'barangay', 'single'),
  ('position-barangay-secretary', 'Barangay Secretary', 'barangay-secretary', 'barangay', 'single'),
  ('position-barangay-treasurer', 'Barangay Treasurer', 'barangay-treasurer', 'barangay', 'single')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  jurisdiction_type = EXCLUDED.jurisdiction_type,
  cardinality = EXCLUDED.cardinality,
  updated_at = CURRENT_TIMESTAMP;

-- The prior CMS stores a roster in site_pages.content.  Import what is safely
-- available as verified CMS profile data, but deliberately leave unknown term
-- dates empty.  This means the migration never invents a term or election.
CREATE OR REPLACE FUNCTION getafe_try_jsonb(value TEXT) RETURNS JSONB AS $$
BEGIN
  RETURN value::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

WITH page AS (
  SELECT getafe_try_jsonb(content) AS document FROM site_pages WHERE slug = 'officials'
), roster AS (
  SELECT 'mayor'::TEXT AS legacy_group, 0::INTEGER AS ordinal, document->'mayor' AS person FROM page
  UNION ALL SELECT 'viceMayor', 0, document->'viceMayor' FROM page
  UNION ALL SELECT 'abcPresident', 0, document->'abcPresident' FROM page
  UNION ALL SELECT 'sbMembers', ordinal::INTEGER, person
    FROM page CROSS JOIN LATERAL jsonb_array_elements(COALESCE(document->'sbMembers', '[]'::jsonb)) WITH ORDINALITY AS roster_values(person, ordinal)
  UNION ALL SELECT 'punongBarangays', ordinal::INTEGER, person
    FROM page CROSS JOIN LATERAL jsonb_array_elements(COALESCE(document->'punongBarangays', '[]'::jsonb)) WITH ORDINALITY AS roster_values(person, ordinal)
  UNION ALL SELECT 'deptHeads', ordinal::INTEGER, person
    FROM page CROSS JOIN LATERAL jsonb_array_elements(COALESCE(document->'deptHeads', '[]'::jsonb)) WITH ORDINALITY AS roster_values(person, ordinal)
), cleaned AS (
  SELECT *, trim(both '-' FROM regexp_replace(lower(trim(person->>'name')), '[^a-z0-9]+', '-', 'g')) AS person_slug
  FROM roster
  WHERE person IS NOT NULL AND COALESCE(trim(person->>'name'), '') <> ''
)
INSERT INTO government_people (id, display_name, normalized_name, profile_slug, biography, photo)
SELECT
  'legacy-person-' || md5(lower(trim(person->>'name'))),
  trim(person->>'name'),
  regexp_replace(lower(trim(person->>'name')), '[^a-z0-9]+', ' ', 'g'),
  NULLIF(person_slug, ''),
  NULLIF(person->>'biography', ''),
  NULLIF(person->>'photo', '')
FROM cleaned
WHERE NULLIF(person_slug, '') IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  normalized_name = EXCLUDED.normalized_name,
  biography = COALESCE(EXCLUDED.biography, government_people.biography),
  photo = COALESCE(EXCLUDED.photo, government_people.photo),
  updated_at = CURRENT_TIMESTAMP;

WITH page AS (
  SELECT getafe_try_jsonb(content) AS document FROM site_pages WHERE slug = 'officials'
), roster AS (
  SELECT 'mayor'::TEXT AS legacy_group, 0::INTEGER AS ordinal, document->'mayor' AS person FROM page
  UNION ALL SELECT 'viceMayor', 0, document->'viceMayor' FROM page
  UNION ALL SELECT 'abcPresident', 0, document->'abcPresident' FROM page
  UNION ALL SELECT 'sbMembers', ordinal::INTEGER, person
    FROM page CROSS JOIN LATERAL jsonb_array_elements(COALESCE(document->'sbMembers', '[]'::jsonb)) WITH ORDINALITY AS roster_values(person, ordinal)
  UNION ALL SELECT 'punongBarangays', ordinal::INTEGER, person
    FROM page CROSS JOIN LATERAL jsonb_array_elements(COALESCE(document->'punongBarangays', '[]'::jsonb)) WITH ORDINALITY AS roster_values(person, ordinal)
  UNION ALL SELECT 'deptHeads', ordinal::INTEGER, person
    FROM page CROSS JOIN LATERAL jsonb_array_elements(COALESCE(document->'deptHeads', '[]'::jsonb)) WITH ORDINALITY AS roster_values(person, ordinal)
), cleaned AS (
  SELECT *,
    trim(both '-' FROM regexp_replace(lower(trim(person->>'name')), '[^a-z0-9]+', '-', 'g')) AS person_slug,
    CASE legacy_group
      WHEN 'mayor' THEN 'municipal-mayor'
      WHEN 'viceMayor' THEN 'municipal-vice-mayor'
      WHEN 'sbMembers' THEN 'sangguniang-bayan-member'
      WHEN 'abcPresident' THEN 'abc-president'
      WHEN 'punongBarangays' THEN 'punong-barangay'
      ELSE NULL
    END AS known_position_slug
  FROM roster
  WHERE person IS NOT NULL AND COALESCE(trim(person->>'name'), '') <> ''
), department_positions AS (
  SELECT DISTINCT
    'position-municipal-' || md5(lower(trim(person->>'role'))) AS id,
    trim(person->>'role') AS name,
    'municipal-' || trim(both '-' FROM regexp_replace(lower(trim(person->>'role')), '[^a-z0-9]+', '-', 'g')) AS slug
  FROM cleaned
  WHERE legacy_group = 'deptHeads' AND COALESCE(trim(person->>'role'), '') <> ''
)
INSERT INTO government_positions (id, name, slug, jurisdiction_type, cardinality)
SELECT id, name, slug, 'municipal', 'single' FROM department_positions
ON CONFLICT (slug) DO NOTHING;

WITH page AS (
  SELECT getafe_try_jsonb(content) AS document FROM site_pages WHERE slug = 'officials'
), roster AS (
  SELECT 'mayor'::TEXT AS legacy_group, 0::INTEGER AS ordinal, document->'mayor' AS person FROM page
  UNION ALL SELECT 'viceMayor', 0, document->'viceMayor' FROM page
  UNION ALL SELECT 'abcPresident', 0, document->'abcPresident' FROM page
  UNION ALL SELECT 'sbMembers', ordinal::INTEGER, person
    FROM page CROSS JOIN LATERAL jsonb_array_elements(COALESCE(document->'sbMembers', '[]'::jsonb)) WITH ORDINALITY AS roster_values(person, ordinal)
  UNION ALL SELECT 'punongBarangays', ordinal::INTEGER, person
    FROM page CROSS JOIN LATERAL jsonb_array_elements(COALESCE(document->'punongBarangays', '[]'::jsonb)) WITH ORDINALITY AS roster_values(person, ordinal)
  UNION ALL SELECT 'deptHeads', ordinal::INTEGER, person
    FROM page CROSS JOIN LATERAL jsonb_array_elements(COALESCE(document->'deptHeads', '[]'::jsonb)) WITH ORDINALITY AS roster_values(person, ordinal)
), cleaned AS (
  SELECT *,
    trim(both '-' FROM regexp_replace(lower(trim(person->>'name')), '[^a-z0-9]+', '-', 'g')) AS person_slug,
    CASE legacy_group
      WHEN 'mayor' THEN 'municipal-mayor'
      WHEN 'viceMayor' THEN 'municipal-vice-mayor'
      WHEN 'sbMembers' THEN 'sangguniang-bayan-member'
      WHEN 'abcPresident' THEN 'abc-president'
      WHEN 'punongBarangays' THEN 'punong-barangay'
      ELSE 'municipal-' || trim(both '-' FROM regexp_replace(lower(trim(person->>'role')), '[^a-z0-9]+', '-', 'g'))
    END AS position_slug
  FROM roster
  WHERE person IS NOT NULL AND COALESCE(trim(person->>'name'), '') <> ''
)
INSERT INTO government_office_assignments (
  id, person_id, position_id, jurisdiction_type, jurisdiction_id, source_type,
  source_reference, verification_status, is_manually_verified, legacy_source_key
)
SELECT
  'legacy-assignment-' || md5(legacy_group || ':' || ordinal || ':' || lower(trim(person->>'name'))),
  'legacy-person-' || md5(lower(trim(person->>'name'))),
  positions.id,
  CASE WHEN legacy_group = 'punongBarangays' THEN 'barangay' ELSE 'municipal' END,
  CASE WHEN legacy_group = 'punongBarangays' THEN trim(both '-' FROM regexp_replace(lower(trim(person->>'role')), '[^a-z0-9]+', '-', 'g')) ELSE NULL END,
  'cms',
  'legacy:' || legacy_group || ':' || ordinal,
  'verified',
  TRUE,
  'legacy:' || legacy_group || ':' || ordinal
FROM cleaned
JOIN government_positions positions ON positions.slug = cleaned.position_slug
WHERE NULLIF(person_slug, '') IS NOT NULL
ON CONFLICT (legacy_source_key) DO NOTHING;

DROP FUNCTION getafe_try_jsonb(TEXT);
