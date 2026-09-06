-- Safe additive migration for existing Cloud SQL databases.
-- Run after the users table exists. This does not alter or delete media rows.
CREATE TABLE IF NOT EXISTS media_uploads (
  id CHAR(36) PRIMARY KEY,
  storage_path VARCHAR(1024) NOT NULL UNIQUE,
  original_filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  uploaded_by CHAR(36) NOT NULL,
  context VARCHAR(32) NOT NULL,
  status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  CONSTRAINT media_uploads_uploaded_by_fk FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX media_uploads_owner_status_idx (uploaded_by, status, expires_at)
);