-- Run this in the `getafe-users` Cloud SQL database.
CREATE TABLE portal_users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'resident',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
);
