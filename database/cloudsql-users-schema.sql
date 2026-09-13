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

CREATE TABLE resident_profiles (
  user_id CHAR(36) PRIMARY KEY, full_name VARCHAR(160) NOT NULL, birth_date DATE NULL,
  sex VARCHAR(32), civil_status VARCHAR(64), nationality VARCHAR(64), mobile VARCHAR(32),
  house_lot VARCHAR(160), street VARCHAR(160), purok_sitio VARCHAR(160), barangay VARCHAR(160),
  municipality VARCHAR(100) DEFAULT 'Getafe', province VARCHAR(100) DEFAULT 'Bohol', zip_code VARCHAR(16),
  avatar_storage_path VARCHAR(500),
  verification_status VARCHAR(32) NOT NULL DEFAULT 'unverified', updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES portal_users(id) ON DELETE CASCADE
);

CREATE TABLE applications (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, reference_number VARCHAR(32) NOT NULL UNIQUE,
  service_name VARCHAR(160) NOT NULL, status VARCHAR(48) NOT NULL DEFAULT 'draft',
  payment_status VARCHAR(32) NOT NULL DEFAULT 'not_required', submitted_at DATETIME(3),
  last_updated DATETIME(3) NOT NULL, details JSON NOT NULL,
  CONSTRAINT fk_application_user FOREIGN KEY (user_id) REFERENCES portal_users(id) ON DELETE CASCADE,
  INDEX idx_applications_user_id (user_id)
);

CREATE TABLE application_status_history (id CHAR(36) PRIMARY KEY, application_id CHAR(36) NOT NULL, status VARCHAR(48) NOT NULL, note TEXT, created_at DATETIME(3) NOT NULL, FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE);
CREATE TABLE application_documents (id CHAR(36) PRIMARY KEY, application_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, name VARCHAR(255) NOT NULL, storage_path VARCHAR(500), verification_status VARCHAR(32) NOT NULL DEFAULT 'pending', created_at DATETIME(3) NOT NULL, FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES portal_users(id) ON DELETE CASCADE, INDEX idx_documents_user_id (user_id));
CREATE TABLE payments (id CHAR(36) PRIMARY KEY, application_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, amount DECIMAL(12,2) NOT NULL, method VARCHAR(64), status VARCHAR(32) NOT NULL DEFAULT 'pending', official_receipt VARCHAR(64), created_at DATETIME(3) NOT NULL, FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES portal_users(id) ON DELETE CASCADE, INDEX idx_payments_user_id (user_id));
CREATE TABLE appointments (id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, application_id CHAR(36), department VARCHAR(160) NOT NULL, service VARCHAR(160) NOT NULL, appointment_at DATETIME(3) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'scheduled', created_at DATETIME(3) NOT NULL, FOREIGN KEY (user_id) REFERENCES portal_users(id) ON DELETE CASCADE, INDEX idx_appointments_user_id (user_id));
CREATE TABLE notifications (id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, title VARCHAR(255) NOT NULL, message TEXT NOT NULL, read_at DATETIME(3), archived_at DATETIME(3), created_at DATETIME(3) NOT NULL, FOREIGN KEY (user_id) REFERENCES portal_users(id) ON DELETE CASCADE, INDEX idx_notifications_user_id (user_id));
