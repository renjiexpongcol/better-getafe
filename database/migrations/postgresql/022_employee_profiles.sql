-- Preserve all account keys and relationships. Sequence values are never reclaimed.
LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;
CREATE SEQUENCE employee_eid_seq AS INTEGER MINVALUE 1 MAXVALUE 999999 NO CYCLE;
CREATE TABLE employee_profile_defaults (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
  employment_status VARCHAR(64) NOT NULL DEFAULT 'Active'
);
INSERT INTO employee_profile_defaults(singleton) VALUES(TRUE);
CREATE TABLE employee_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  eid VARCHAR(6) NOT NULL UNIQUE DEFAULT lpad(nextval('employee_eid_seq')::text,6,'0') CHECK(eid ~ '^[0-9]{6}$' AND eid <> '000000'),
  department VARCHAR(160) NOT NULL DEFAULT '',
  position VARCHAR(160) NOT NULL DEFAULT '',
  employment_status VARCHAR(64) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL DEFAULT 'system',
  phone VARCHAR(32), hire_date DATE, employment_type VARCHAR(64),
  office_assignment VARCHAR(160), supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO employee_profiles(user_id,created_at,updated_at,created_by)
SELECT id,created_at,updated_at,'system-migration' FROM users ORDER BY created_at,id;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_setup_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE FUNCTION provision_employee_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO employee_profiles(user_id,employment_status,created_at,updated_at,created_by)
  SELECT NEW.id,employment_status,NEW.created_at,NEW.updated_at,COALESCE(NULLIF(current_setting('app.employee_creator',true),''),'system') FROM employee_profile_defaults WHERE singleton;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee defaults unavailable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER users_provision_employee AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION provision_employee_profile();
CREATE FUNCTION protect_employee_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.eid IS DISTINCT FROM OLD.eid OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Employee identity and creation metadata are immutable';
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END $$;
CREATE TRIGGER employee_identity_immutable BEFORE UPDATE ON employee_profiles FOR EACH ROW EXECUTE FUNCTION protect_employee_identity();
