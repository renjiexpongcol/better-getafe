-- Local PSA PSGC snapshot and sync state for Getafe barangays.
CREATE TABLE IF NOT EXISTS psgc_barangay_reference (
  psgc_code TEXT PRIMARY KEY CHECK (psgc_code ~ '^[0-9]{10}$'),
  municipality_code TEXT NOT NULL CHECK (municipality_code ~ '^[0-9]{10}$'),
  correspondence_code TEXT NOT NULL,
  area_name TEXT NOT NULL,
  geographic_level TEXT NOT NULL DEFAULT 'Bgy',
  urban_rural TEXT NOT NULL DEFAULT '',
  old_name TEXT NOT NULL DEFAULT '',
  source_version TEXT NOT NULL,
  population_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS psgc_barangay_reference_municipality_idx
  ON psgc_barangay_reference (municipality_code, area_name);

CREATE TABLE IF NOT EXISTS psgc_sync_state (
  dataset_key TEXT PRIMARY KEY,
  source_version TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT NOT NULL DEFAULT ''
);

INSERT INTO psgc_barangay_reference
  (psgc_code, municipality_code, correspondence_code, area_name, geographic_level, urban_rural, source_version, population_data, raw_payload)
VALUES
  ('0701226001','0701226000','071226001','Alumar','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1137}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226002','0701226000','071226002','Banacon','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1494}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226003','0701226000','071226003','Buyog','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1162}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226004','0701226000','071226004','Cabasakan','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1284}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226006','0701226000','071226006','Campao Occidental','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":557}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226007','0701226000','071226007','Campao Oriental','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1131}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226008','0701226000','071226008','Cangmundo','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1121}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226009','0701226000','071226009','Carlos P. Garcia','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1010}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226010','0701226000','071226010','Corte Baud','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1058}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226011','0701226000','071226011','Handumon','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1191}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226012','0701226000','071226012','Jagoliao','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1403}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226013','0701226000','071226013','Jandayan Norte','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1038}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226014','0701226000','071226014','Jandayan Sur','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1658}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226015','0701226000','071226015','Mahanay','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":516}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226016','0701226000','071226016','Nasingin','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":2105}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226017','0701226000','071226017','Pandanon','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":2306}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226018','0701226000','071226018','Poblacion','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":2680}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226019','0701226000','071226019','Saguise','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1967}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226020','0701226000','071226020','Salog','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1076}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226021','0701226000','071226021','San Jose','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1779}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226022','0701226000','071226022','Santo Niño','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":918}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226023','0701226000','071226023','Taytay','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1766}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226024','0701226000','071226024','Tugas','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":1078}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}'),
  ('0701226025','0701226000','071226025','Tulang','Bgy','Rural','PSA_2025-07-31','[{"year":2024,"population":2050}]','{"source":"PSA PSGC municipality page","reference_date":"2025-07-31"}')
ON CONFLICT (psgc_code) DO NOTHING;

INSERT INTO psgc_sync_state (dataset_key, source_version, record_count, snapshot_at)
VALUES ('getafe_barangays','PSA_2025-07-31',24,CURRENT_TIMESTAMP)
ON CONFLICT (dataset_key) DO NOTHING;
