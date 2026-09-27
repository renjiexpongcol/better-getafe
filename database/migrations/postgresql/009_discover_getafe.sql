CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  short_description TEXT NOT NULL,
  full_description TEXT NOT NULL DEFAULT '',
  featured_image TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT FALSE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS destinations_public_order ON destinations (published, featured, display_order, id);
INSERT INTO destinations (id, slug, title, short_description, location, category, featured, display_order) VALUES
('discover-danajon', 'danajon-double-barrier-reef', 'Danajon Double Barrier Reef', 'Explore the marine environment of the Danajon Double Barrier Reef in the waters of northern Bohol.', 'Northern Bohol', 'Marine & Coastal', TRUE, 1),
('discover-banacon', 'banacon-island-mangrove-forest', 'Banacon Island Mangrove Forest', 'Discover the extensive mangrove forests of Banacon Island and learn about the community, coastal environment, and conservation efforts that make the area an important part of Getafe.', 'Banacon Island, Getafe, Bohol', 'Nature', TRUE, 2),
('discover-jandayan', 'jandayan-island', 'Jandayan Island', 'Discover Jandayan Island''s coastal communities, beaches, fishing traditions, and island landscapes in Getafe, Bohol.', 'Jandayan Island, Getafe, Bohol', 'Islands', TRUE, 3)
ON CONFLICT DO NOTHING;
