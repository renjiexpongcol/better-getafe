-- Publish an attributed Taytay profile from PSA and Getafe municipal planning data.
WITH source AS (
  SELECT jsonb_agg(
    CASE WHEN barangay->>'slug' = 'taytay' OR barangay->>'id' = 'taytay' THEN
      jsonb_set(
        jsonb_set(
          jsonb_set(
            barangay,
            '{description}',
            to_jsonb('Barangay Taytay is one of the 24 rural barangays of the Municipality of Getafe, Bohol. The Philippine Statistics Authority recorded 1,766 residents in the 2024 Census of Population. Taytay is identified on the Getafe municipal base map; the map credits the Getafe Municipal Planning and Development Office for barangay boundaries and roads.'::text),
            true
          ),
          '{population}', '1766'::jsonb, true
        ),
        '{lastUpdated}', to_jsonb('2024 POPCEN'::text), true
      ) || jsonb_build_object(
        'researchData',
        COALESCE(barangay->'researchData', '{}'::jsonb) || jsonb_build_object(
          'population2024', 1766,
          'classification', 'Rural',
          'municipalContext', 'Taytay is one of Getafe’s 24 barangays. Its boundaries and roads are included in the Getafe municipal base map published by the Bohol Provincial Planning and Development Office, which credits the Getafe Municipal Planning and Development Office as the source of those municipal details.',
          'sources',
          COALESCE(barangay#>'{researchData,sources}', '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object('label', 'PSA — Getafe barangays and 2024 population counts', 'url', 'https://psa.gov.ph/classification/psgc/barangays/0701226000'),
            jsonb_build_object('label', 'Getafe municipal base map — boundaries and roads from the Municipal Planning and Development Office', 'url', 'https://ppdo.bohol.gov.ph/maps/municipal-maps/2nd-district/getafe/'),
            jsonb_build_object('label', 'Provincial Government of Bohol — Municipality of Getafe profile', 'url', 'https://bohol.gov.ph/about/municipalities/2nd-district/getafe/')
          )
        )
      )
    ELSE barangay END
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
