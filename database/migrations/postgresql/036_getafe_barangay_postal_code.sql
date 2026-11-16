-- Getafe and all constituent barangays use the municipal postal code 6334.
WITH source AS (
  SELECT jsonb_agg(
    jsonb_set(barangay, '{researchData,philAtlas,postalCode}', '"6334"'::jsonb, true)
    ORDER BY ordinal
  ) AS content
  FROM site_pages page
  CROSS JOIN LATERAL jsonb_array_elements(page.content::jsonb) WITH ORDINALITY AS rows(barangay, ordinal)
  WHERE page.slug = 'barangays'
)
UPDATE site_pages
SET content = source.content::text, updated_at = CURRENT_TIMESTAMP
FROM source
WHERE slug = 'barangays' AND source.content IS NOT NULL;
