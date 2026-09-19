-- Google Cloud SQL for MySQL 8.0+ schema for the Getafe CMS.
CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'admin',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
);

CREATE TABLE categories (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
);

CREATE TABLE media (
  id CHAR(36) PRIMARY KEY,
  original_filename VARCHAR(255) NOT NULL,
  storage_bucket VARCHAR(255) NOT NULL,
  storage_path VARCHAR(1024) NOT NULL UNIQUE,
  content_type VARCHAR(100) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  uploaded_by CHAR(36) NOT NULL,
  related_record_id CHAR(36) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT media_uploaded_by_fk FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE media_uploads (
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

CREATE TABLE news (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(280) NOT NULL UNIQUE,
  excerpt TEXT NOT NULL,
  content LONGTEXT NOT NULL,
  featured_image VARCHAR(1024) NOT NULL DEFAULT '',
  category_id CHAR(36) NULL,
  author_id CHAR(36) NOT NULL,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  is_important BOOLEAN NOT NULL DEFAULT FALSE,
  content_type ENUM('news', 'event', 'meeting') NOT NULL DEFAULT 'news',
  event_start_at DATETIME(3) NULL,
  event_end_at DATETIME(3) NULL,
  show_in_news BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_upcoming BOOLEAN NOT NULL DEFAULT FALSE,
  show_in_events BOOLEAN NOT NULL DEFAULT FALSE,
  show_on_homepage BOOLEAN NOT NULL DEFAULT TRUE,
  published_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT news_category_fk FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT news_author_fk FOREIGN KEY (author_id) REFERENCES users(id),
  INDEX news_public_listing_idx (status, published_at),
  INDEX news_display_idx (show_in_news, show_in_upcoming, show_in_events, event_start_at),
  INDEX news_category_idx (category_id)
);

CREATE TABLE site_pages (
  slug VARCHAR(120) PRIMARY KEY,
  content LONGTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL
);
