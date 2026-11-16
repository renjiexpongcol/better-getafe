-- Trusted routing/assignment fields are never accepted from resident form JSON.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS department_id TEXT REFERENCES departments(id);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS assigned_user_id TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
-- Reuse existing configured service ownership only when the name is unambiguous.
UPDATE applications a SET department_id=s.department_id FROM services s
WHERE a.department_id IS NULL AND lower(a.service_name)=lower(s.name)
AND s.department_id IS NOT NULL AND (SELECT count(*) FROM services x WHERE lower(x.name)=lower(a.service_name))=1;
CREATE INDEX IF NOT EXISTS applications_queue_idx ON applications(department_id,status,submitted_at,id);
CREATE INDEX IF NOT EXISTS applications_assigned_idx ON applications(assigned_user_id,last_updated DESC,id);
CREATE INDEX IF NOT EXISTS applications_updated_idx ON applications(last_updated DESC,id);
CREATE INDEX IF NOT EXISTS requests_department_updated_idx ON service_requests(department_id,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS requests_due_idx ON service_requests(department_id,due_at) WHERE due_at IS NOT NULL AND status NOT IN ('DRAFT','COMPLETED','REJECTED','CANCELLED');
CREATE TABLE IF NOT EXISTS application_assignments (
 id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),assigned_user_id TEXT NOT NULL,assigned_by TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- CMS staff identities can reside in a different database: no portal-user FK.
CREATE TABLE IF NOT EXISTS staff_notifications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id TEXT NOT NULL,event_key TEXT NOT NULL UNIQUE,title TEXT NOT NULL,message TEXT NOT NULL,
 application_id TEXT REFERENCES applications(id),request_id UUID REFERENCES service_requests(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),read_at TIMESTAMPTZ,
 email_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(email_status IN ('PENDING','QUEUED','SENT','SUPPRESSED','FAILED')),attempts INTEGER NOT NULL DEFAULT 0,available_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_notifications_inbox_idx ON staff_notifications(user_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS staff_notifications_delivery_idx ON staff_notifications(available_at) WHERE email_status IN ('PENDING','FAILED');
CREATE TRIGGER application_assignments_immutable BEFORE UPDATE OR DELETE ON application_assignments FOR EACH ROW EXECUTE FUNCTION eservice_immutable();

-- Preserve existing support access to legacy records with no configured office.
INSERT INTO auth_permissions(id,category,label,description,sensitive)
VALUES('requests.unrouted.view','Requests','View unrouted support requests','Access legacy support requests without configured department ownership.',FALSE) ON CONFLICT DO NOTHING;
INSERT INTO auth_group_permissions(group_id,permission_id,created_at,created_by)
SELECT g.id,'requests.unrouted.view',now(),'staff-operations-migration' FROM auth_groups g
WHERE g.name='Staff_Support' AND EXISTS(SELECT 1 FROM auth_group_permissions p WHERE p.group_id=g.id AND p.permission_id='requests.view') ON CONFLICT DO NOTHING;
