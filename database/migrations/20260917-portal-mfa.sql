ALTER TABLE portal_users
  ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN mfa_secret_encrypted TEXT NULL,
  ADD COLUMN mfa_recovery_codes JSON NULL,
  ADD COLUMN mfa_verified_at DATETIME(3) NULL;
