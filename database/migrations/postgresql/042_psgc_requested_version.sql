ALTER TABLE psgc_sync_state
  ADD COLUMN IF NOT EXISTS requested_version TEXT NOT NULL DEFAULT '';

UPDATE psgc_sync_state
SET requested_version = source_version
WHERE requested_version = '';
