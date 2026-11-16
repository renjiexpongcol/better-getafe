-- Publish current PSA population facts and Buyog's sourced PhilAtlas profile
-- as municipal content. The public API reads these fields from site_pages.
WITH research(slug, data) AS (
  VALUES
    ('alumar', jsonb_build_object('psgc','0701226001','population2024',1137,'classification','Rural')),
    ('banacon', jsonb_build_object('psgc','0701226002','population2024',1494,'classification','Rural')),
    ('buyog', jsonb_build_object(
      'psgc','0701226003','population2024',1162,'classification','Rural',
      'coordinateSource','PhilAtlas',
      'municipalContext','Getafe is a coastal municipality on the northern coast of Bohol. Municipal background information is provided by the Provincial Government of Bohol.',
      'philAtlas', jsonb_build_object(
        'coordinates',jsonb_build_object('lat',10.1088,'lng',124.1536),
        'elevationMeters',29.8,'householdPopulation2015',906,'households2015',188,
        'householdSize2015',4.82,'medianAge2015',21.56,
        'demographicsSummary','PhilAtlas reports a population of 973 in 2020, up from 906 in 2015. The newer 2024 count is reported separately by the PSA.',
        'populationHistory',jsonb_build_array(
          jsonb_build_object('year',1990,'population',645),jsonb_build_object('year',1995,'population',701),
          jsonb_build_object('year',2000,'population',709),jsonb_build_object('year',2007,'population',734),
          jsonb_build_object('year',2010,'population',775),jsonb_build_object('year',2015,'population',906),
          jsonb_build_object('year',2020,'population',973)),
        'ageGroups2015',jsonb_build_array(
          jsonb_build_object('age','Under 1','population',17),jsonb_build_object('age','1–4','population',87),
          jsonb_build_object('age','5–9','population',111),jsonb_build_object('age','10–14','population',114),
          jsonb_build_object('age','15–19','population',100),jsonb_build_object('age','20–24','population',77),
          jsonb_build_object('age','25–29','population',74),jsonb_build_object('age','30–34','population',54),
          jsonb_build_object('age','35–39','population',49),jsonb_build_object('age','40–44','population',33),
          jsonb_build_object('age','45–49','population',32),jsonb_build_object('age','50–54','population',32),
          jsonb_build_object('age','55–59','population',31),jsonb_build_object('age','60–64','population',24),
          jsonb_build_object('age','65–69','population',32),jsonb_build_object('age','70–74','population',19),
          jsonb_build_object('age','75–79','population',10),jsonb_build_object('age','80 and over','population',10)),
        'adjacentBarangays',jsonb_build_array(
          jsonb_build_object('name','Corte Baud','slug','corte-baud','municipality','Getafe'),
          jsonb_build_object('name','Santo Niño','slug','santo-nino','municipality','Getafe'),
          jsonb_build_object('name','Campao Oriental','slug','campao-oriental','municipality','Getafe'),
          jsonb_build_object('name','Cabasakan','slug','cabasakan','municipality','Getafe'),
          jsonb_build_object('name','Campao Occidental','slug','campao-occidental','municipality','Getafe'),
          jsonb_build_object('name','Bago','municipality','Buenavista'),
          jsonb_build_object('name','Overland','municipality','Buenavista'))),
      'sources',jsonb_build_array(
        jsonb_build_object('label','Philippine Statistics Authority — 2024 POPCEN and PSGC','url','https://psa.gov.ph/classification/psgc/barangays/0701226000'),
        jsonb_build_object('label','PSA Central Visayas — Getafe 2020 Census report','url','https://rsso07.psa.gov.ph/system/files/attachment-dir/2022-SR12-033.pdf'),
        jsonb_build_object('label','Provincial Government of Bohol — Getafe municipal profile','url','https://bohol.gov.ph/about/municipalities/2nd-district/getafe/'),
        jsonb_build_object('label','PhilAtlas — Buyog profile and historical demographics','url','https://www.philatlas.com/visayas/r07/bohol/getafe/buyog.html')))),
    ('cabasakan', jsonb_build_object('psgc','0701226004','population2024',1284,'classification','Rural')),
    ('campao-occidental', jsonb_build_object('psgc','0701226006','population2024',557,'classification','Rural')),
    ('campao-oriental', jsonb_build_object('psgc','0701226007','population2024',1131,'classification','Rural')),
    ('cangmundo', jsonb_build_object('psgc','0701226008','population2024',1121,'classification','Rural')),
    ('carlos-p-garcia', jsonb_build_object('psgc','0701226009','population2024',1010,'classification','Rural')),
    ('corte-baud', jsonb_build_object('psgc','0701226010','population2024',1058,'classification','Rural')),
    ('handumon', jsonb_build_object('psgc','0701226011','population2024',1191,'classification','Rural')),
    ('jagoliao', jsonb_build_object('psgc','0701226012','population2024',1403,'classification','Rural')),
    ('jandayan-norte', jsonb_build_object('psgc','0701226013','population2024',1038,'classification','Rural')),
    ('jandayan-sur', jsonb_build_object('psgc','0701226014','population2024',1658,'classification','Rural')),
    ('mahanay', jsonb_build_object('psgc','0701226015','population2024',516,'classification','Rural')),
    ('nasingin', jsonb_build_object('psgc','0701226016','population2024',2105,'classification','Rural')),
    ('pandanon', jsonb_build_object('psgc','0701226017','population2024',2306,'classification','Rural')),
    ('poblacion', jsonb_build_object('psgc','0701226018','population2024',2680,'classification','Rural')),
    ('saguise', jsonb_build_object('psgc','0701226019','population2024',1967,'classification','Rural')),
    ('salog', jsonb_build_object('psgc','0701226020','population2024',1076,'classification','Rural')),
    ('san-jose', jsonb_build_object('psgc','0701226021','population2024',1779,'classification','Rural')),
    ('santo-ni-o', jsonb_build_object('psgc','0701226022','population2024',918,'classification','Rural')),
    ('taytay', jsonb_build_object('psgc','0701226023','population2024',1766,'classification','Rural')),
    ('tugas', jsonb_build_object('psgc','0701226024','population2024',1078,'classification','Rural')),
    ('tulang', jsonb_build_object('psgc','0701226025','population2024',2050,'classification','Rural'))
), source AS (
  SELECT jsonb_agg(
    CASE WHEN research.data IS NULL THEN barangay
      ELSE jsonb_set(barangay, '{researchData}', COALESCE(barangay->'researchData','{}'::jsonb) || research.data, true)
    END ORDER BY ordinal
  ) AS content
  FROM site_pages page
  CROSS JOIN LATERAL jsonb_array_elements(page.content::jsonb) WITH ORDINALITY AS rows(barangay, ordinal)
  LEFT JOIN research ON research.slug = COALESCE(barangay->>'slug', barangay->>'id')
  WHERE page.slug = 'barangays'
)
UPDATE site_pages
SET content = source.content::text, updated_at = CURRENT_TIMESTAMP
FROM source
WHERE slug = 'barangays' AND source.content IS NOT NULL;
