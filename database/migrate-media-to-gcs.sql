-- Idempotent migration for a legacy Cloud SQL media table.
-- It preserves rows and does not delete local files or GCS objects.
-- Set this to the production bucket before running the script.
SET @gcs_bucket_name = 'getafe-supra-storage';

DELIMITER $$
CREATE PROCEDURE migrate_media_to_gcs()
BEGIN
	IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media' AND column_name = 'filename') > 0
		 AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media' AND column_name = 'original_filename') = 0 THEN
		ALTER TABLE media CHANGE COLUMN filename original_filename VARCHAR(255) NOT NULL;
	END IF;
	IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media' AND column_name = 'filepath') > 0
		 AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media' AND column_name = 'storage_path') = 0 THEN
		ALTER TABLE media CHANGE COLUMN filepath storage_path VARCHAR(1024) NOT NULL;
	END IF;
	IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media' AND column_name = 'filetype') > 0
		 AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media' AND column_name = 'content_type') = 0 THEN
		ALTER TABLE media CHANGE COLUMN filetype content_type VARCHAR(100) NOT NULL;
	END IF;
	IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media' AND column_name = 'filesize') > 0
		 AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media' AND column_name = 'file_size') = 0 THEN
		ALTER TABLE media CHANGE COLUMN filesize file_size BIGINT UNSIGNED NOT NULL;
	END IF;
	IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media' AND column_name = 'storage_bucket') = 0 THEN
		ALTER TABLE media ADD COLUMN storage_bucket VARCHAR(255) NOT NULL DEFAULT '' AFTER original_filename;
	END IF;
	IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media' AND column_name = 'related_record_id') = 0 THEN
		ALTER TABLE media ADD COLUMN related_record_id CHAR(36) NULL AFTER uploaded_by;
	END IF;
	IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media' AND column_name = 'status') = 0 THEN
		ALTER TABLE media ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'active' AFTER related_record_id;
	END IF;
	UPDATE media SET storage_bucket = @gcs_bucket_name WHERE storage_bucket = '';
END$$
DELIMITER ;

CALL migrate_media_to_gcs();
DROP PROCEDURE migrate_media_to_gcs;
