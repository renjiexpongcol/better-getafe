-- Durable operator-controlled recovery state. Runtime APIs never execute DDL.
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT;
CREATE TABLE IF NOT EXISTS getafe_database_identity (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
  id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO getafe_database_identity(singleton) VALUES(TRUE) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS getafe_database_operations (
  id UUID PRIMARY KEY, operation TEXT NOT NULL, state TEXT NOT NULL,
  project_ref TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ, report JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS getafe_administrator_setup (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
  user_id TEXT NOT NULL REFERENCES users(id), completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE getafe_database_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE getafe_database_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE getafe_administrator_setup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON getafe_database_identity,getafe_database_operations,getafe_administrator_setup FROM PUBLIC;
