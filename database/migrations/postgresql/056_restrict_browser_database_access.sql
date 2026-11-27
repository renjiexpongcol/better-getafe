-- Application identities and authorization live in the Express API. The
-- field-limited portal_api.categories view retains its explicit public grant.
-- No records, accounts, media references or existing policies are removed.
SET LOCAL lock_timeout = '5s';
DO $migration$
DECLARE item record; role_name text;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'todos'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.tablename);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', item.tablename);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', item.tablename, role_name);
      END IF;
    END LOOP;
  END LOOP;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
  REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_name);
      FOR item IN SELECT viewname FROM pg_views WHERE schemaname='public' LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM %I', item.viewname, role_name);
      END LOOP;
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I', role_name);
    END IF;
  END LOOP;
  FOR item IN SELECT viewname FROM pg_views WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', item.viewname);
  END LOOP;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
END
$migration$;
