CREATE SCHEMA IF NOT EXISTS portal_api;

CREATE OR REPLACE VIEW portal_api.categories AS
SELECT id, name, slug FROM public.categories;

REVOKE ALL ON SCHEMA portal_api FROM PUBLIC;
REVOKE ALL ON portal_api.categories FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE ON SCHEMA portal_api TO anon;
    GRANT SELECT ON portal_api.categories TO anon;
  END IF;
END
$$;
