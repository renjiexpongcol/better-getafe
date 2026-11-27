CREATE TABLE IF NOT EXISTS public.scheduled_job_runs (
  run_key text PRIMARY KEY,
  name text NOT NULL CHECK (name IN ('psgc','media-cleanup')),
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 3),
  lease_until timestamptz NOT NULL,
  available_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.scheduled_job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_job_runs FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.scheduled_job_runs FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.scheduled_job_runs FROM authenticated; END IF;
END $$;
CREATE INDEX IF NOT EXISTS scheduled_job_runs_updated ON public.scheduled_job_runs(updated_at DESC);
CREATE TABLE IF NOT EXISTS public.managed_worker_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  worker_id uuid NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.managed_worker_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.managed_worker_state FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.managed_worker_state FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.managed_worker_state FROM authenticated; END IF;
END $$;
