CREATE TABLE IF NOT EXISTS settings_lock (id INT PRIMARY KEY);
INSERT IGNORE INTO settings_lock (id) VALUES (1);
CREATE TABLE IF NOT EXISTS auth_state (
  state_key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  INDEX auth_state_expiry (expires_at)
);
