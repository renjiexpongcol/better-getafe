-- Ordered optional article gallery metadata. Existing featured_image remains primary.
ALTER TABLE news ADD COLUMN IF NOT EXISTS gallery_images JSONB NOT NULL DEFAULT '[]'::jsonb;
