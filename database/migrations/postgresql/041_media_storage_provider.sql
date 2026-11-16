-- Record provider identity without guessing the provider for legacy rows.
ALTER TABLE media ADD COLUMN IF NOT EXISTS storage_provider TEXT;
ALTER TABLE media_uploads ADD COLUMN IF NOT EXISTS storage_provider TEXT;
ALTER TABLE media_uploads ADD COLUMN IF NOT EXISTS storage_bucket TEXT;
CREATE INDEX IF NOT EXISTS media_storage_identity_idx
  ON media (storage_provider, storage_bucket, storage_path);
CREATE INDEX IF NOT EXISTS media_uploads_storage_identity_idx
  ON media_uploads (storage_provider, storage_bucket, storage_path);
DROP INDEX IF EXISTS media_checksum_sha256_unique;
CREATE UNIQUE INDEX IF NOT EXISTS media_storage_checksum_unique
  ON media (storage_provider, storage_bucket, checksum_sha256)
  WHERE checksum_sha256 IS NOT NULL;
