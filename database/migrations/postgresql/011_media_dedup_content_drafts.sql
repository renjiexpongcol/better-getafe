-- Media identity, canonical content relationships, and resilient CMS drafts.
-- This migration is additive and preserves the legacy path fields while the
-- application moves reads and writes to the relationship table.
ALTER TABLE media ADD COLUMN IF NOT EXISTS checksum_sha256 CHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS media_checksum_sha256_unique
  ON media (checksum_sha256)
  WHERE checksum_sha256 IS NOT NULL;

ALTER TABLE news ADD COLUMN IF NOT EXISTS autosave_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE news ADD COLUMN IF NOT EXISTS last_autosaved_at TIMESTAMPTZ;
ALTER TABLE news ALTER COLUMN slug DROP NOT NULL;

CREATE TABLE IF NOT EXISTS content_media (
  content_type VARCHAR(48) NOT NULL,
  content_id TEXT NOT NULL,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
  role VARCHAR(32) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  alt_text TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (content_type, content_id, media_id, role),
  CONSTRAINT content_media_role_check CHECK (role IN ('featured', 'gallery', 'inline', 'cover'))
);
CREATE INDEX IF NOT EXISTS content_media_media_idx ON content_media (media_id);
CREATE INDEX IF NOT EXISTS content_media_content_idx ON content_media (content_type, content_id, role, position);
CREATE UNIQUE INDEX IF NOT EXISTS content_media_one_featured_idx
  ON content_media (content_type, content_id)
  WHERE role = 'featured';

-- Preserve existing article image selections as canonical links.
INSERT INTO content_media (content_type, content_id, media_id, role, position, alt_text, caption)
SELECT 'news', n.id, m.id, 'featured', 0, '', ''
FROM news n
JOIN media m ON m.storage_path = n.featured_image
WHERE NULLIF(n.featured_image, '') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO content_media (content_type, content_id, media_id, role, position, alt_text, caption)
SELECT 'news', n.id, m.id, 'gallery',
       CASE WHEN item.value->>'position' ~ '^[0-9]+$' THEN (item.value->>'position')::INTEGER ELSE item.ordinality::INTEGER - 1 END,
       COALESCE(item.value->>'alt', ''),
       COALESCE(item.value->>'caption', '')
FROM news n
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(n.gallery_images) = 'array' THEN n.gallery_images ELSE '[]'::jsonb END)
  WITH ORDINALITY AS item(value, ordinality)
JOIN media m ON m.storage_path = item.value->>'storage_path'
WHERE NULLIF(item.value->>'storage_path', '') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Preserve Discover/Getafe featured images where the legacy record is valid.
INSERT INTO content_media (content_type, content_id, media_id, role, position, alt_text, caption)
SELECT 'destination', d.id, m.id, 'featured', 0, COALESCE(d.image_alt, ''), ''
FROM destinations d
JOIN media m ON m.storage_path = d.featured_image
WHERE NULLIF(d.featured_image, '') IS NOT NULL
ON CONFLICT DO NOTHING;
