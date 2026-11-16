-- Expand Taytay's public-facing About text with externally verifiable local context.
WITH source AS (
  SELECT jsonb_agg(
    CASE WHEN barangay->>'slug' = 'taytay' OR barangay->>'id' = 'taytay' THEN
      jsonb_set(
        jsonb_set(
          barangay,
          '{description}',
          to_jsonb('Barangay Taytay is a rural barangay of Getafe, Bohol. The Philippine Statistics Authority lists Taytay under PSGC code 0701226023 and counted 1,766 residents in the 2024 Census of Population. Public records also identify Taytay Elementary School in Getafe, and a 2024 Philippine Information Agency report describes the national highway route running from Poblacion through Taytay toward Barangay Carlos P. Garcia. The government sources reviewed do not explain the origin or meaning of the name “Taytay”; that history should be confirmed with barangay or municipal records.'::text),
          true
        ),
        '{lastUpdated}', to_jsonb('2024 POPCEN'::text), true
      ) || jsonb_build_object(
        'researchData',
        COALESCE(barangay->'researchData', '{}'::jsonb) || jsonb_build_object(
          'municipalContext', 'Taytay is identified as a rural barangay on the Getafe municipal map. A 2024 Philippine Information Agency report describes the national highway route from Poblacion through Taytay toward Barangay Carlos P. Garcia. The sources reviewed do not document the origin of the barangay name.',
          'sources',
          COALESCE(barangay#>'{researchData,sources}', '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object('label', 'PSA — Getafe barangay codes, classification and 2024 population', 'url', 'https://psa.gov.ph/classification/psgc/barangays/0701226000'),
            jsonb_build_object('label', 'DepEd — Bohol school records, including Taytay Elementary School', 'url', 'https://www.deped.gov.ph/wp-content/uploads/Annex-B_Allocation-List-4.pdf'),
            jsonb_build_object('label', 'Philippine Information Agency — Getafe highway route through Taytay (17 August 2024)', 'url', 'https://pia.gov.ph/news/p128-m-allotted-for-road-widening-project-in-bohol-town/'),
            jsonb_build_object('label', 'Bohol PPDO — Getafe municipal base map', 'url', 'https://ppdo.bohol.gov.ph/ppdofiles/Maps/MunicipalMaps/Getafe/PDFs/BasicMaps/Base%20Map%20A4%20Portrait.pdf')
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
