-- Add shared administrative labels to the database-backed barangay profiles.
WITH source AS (
  SELECT jsonb_agg(
    jsonb_set(
      barangay,
      '{researchData}',
      COALESCE(barangay->'researchData', '{}'::jsonb) || jsonb_build_object(
        'administrative', jsonb_build_object(
          'country', 'Philippines',
          'region', 'Central Visayas (Region VII)',
          'province', 'Bohol',
          'municipality', 'Getafe',
          'barangayCount', 24
        )
      ),
      true
    ) ORDER BY ordinal
  ) AS content
  FROM site_pages page
  CROSS JOIN LATERAL jsonb_array_elements(page.content::jsonb) WITH ORDINALITY AS rows(barangay, ordinal)
  WHERE page.slug = 'barangays'
)
UPDATE site_pages
SET content = source.content::text, updated_at = CURRENT_TIMESTAMP
FROM source
WHERE slug = 'barangays' AND source.content IS NOT NULL;
