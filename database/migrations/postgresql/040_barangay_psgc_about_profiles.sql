-- Mark source-light profiles for an About summary built from the local PSA copy.
WITH source AS (
  SELECT jsonb_agg(
    CASE WHEN reference.psgc_code IS NOT NULL THEN
      jsonb_set(
        jsonb_set(
          barangay,
          '{researchData}',
          COALESCE(barangay->'researchData', '{}'::jsonb) || jsonb_build_object(
            'psgcProfileAuto', CASE
              WHEN NULLIF(BTRIM(COALESCE(barangay->>'description','')), '') IS NULL
                OR BTRIM(COALESCE(barangay->>'description','')) ILIKE 'A detailed description for Barangay % is not currently available.'
              THEN true ELSE COALESCE((barangay#>>'{researchData,psgcProfileAuto}')::boolean, false)
            END,
            'population2024', COALESCE(
              NULLIF(barangay#>>'{researchData,population2024}', '')::integer,
              NULLIF(barangay->>'population', '')::integer,
              (SELECT NULLIF(pop->>'population','')::integer FROM jsonb_array_elements(reference.population_data) AS pop WHERE (pop->>'year')::integer = 2024 LIMIT 1)
            ),
            'classification', reference.urban_rural,
            'psgc', reference.psgc_code
          ),
          true
        ),
        '{population}', to_jsonb(COALESCE(
          NULLIF(barangay->>'population','')::integer,
          (SELECT NULLIF(pop->>'population','')::integer FROM jsonb_array_elements(reference.population_data) AS pop WHERE (pop->>'year')::integer = 2024 LIMIT 1)
        )),
        true
      )
    ELSE barangay END
    ORDER BY ordinal
  ) AS content
  FROM site_pages page
  CROSS JOIN LATERAL jsonb_array_elements(page.content::jsonb) WITH ORDINALITY AS rows(barangay, ordinal)
  LEFT JOIN psgc_barangay_reference reference
    ON reference.psgc_code = COALESCE(barangay#>>'{researchData,psgc}', '')
   AND reference.municipality_code = '0701226000'
  WHERE page.slug = 'barangays'
)
UPDATE site_pages
SET content = source.content::text, updated_at = CURRENT_TIMESTAMP
FROM source
WHERE slug = 'barangays' AND source.content IS NOT NULL;
