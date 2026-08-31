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
  filename VARCHAR(255) NOT NULL,
  filepath VARCHAR(1024) NOT NULL UNIQUE,
  filetype VARCHAR(100) NOT NULL,
  filesize BIGINT UNSIGNED NOT NULL,
  uploaded_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT media_uploaded_by_fk FOREIGN KEY (uploaded_by) REFERENCES users(id)
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
  published_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT news_category_fk FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT news_author_fk FOREIGN KEY (author_id) REFERENCES users(id),
  INDEX news_public_listing_idx (status, published_at),
  INDEX news_category_idx (category_id)
);
