-- For existing legacy MySQL CMS databases. SQLite JSON storage needs no migration.
ALTER TABLE news ADD COLUMN is_important BOOLEAN NOT NULL DEFAULT FALSE;
