-- E-services records live in the portal database. Apply the standard migration
-- set to both databases when CMS and resident connections use separate databases.
CREATE TABLE service_categories (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE);
CREATE TABLE services (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
 category_id UUID REFERENCES service_categories(id), department_id TEXT REFERENCES departments(id),
 kind TEXT NOT NULL DEFAULT 'APPLICATION' CHECK(kind IN ('APPLICATION','BUSINESS_NEW','BUSINESS_RENEWAL','BUSINESS','REAL_PROPERTY','WATER','PAYMENT_ORDER','DIRECTORY')),
 short_description TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT 'FileText', hero_image TEXT,
 eligibility TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '', processing_time TEXT NOT NULL DEFAULT '', contact JSONB NOT NULL DEFAULT '{}',
 appointment_required BOOLEAN NOT NULL DEFAULT FALSE, payment_required BOOLEAN NOT NULL DEFAULT FALSE,
 online_available BOOLEAN NOT NULL DEFAULT FALSE, published BOOLEAN NOT NULL DEFAULT FALSE, display_order INTEGER NOT NULL DEFAULT 0,
 effective_from TIMESTAMPTZ, effective_until TIMESTAMPTZ, settings JSONB NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from)
);
CREATE TABLE service_requirements (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), service_id UUID NOT NULL REFERENCES services(id), revision INTEGER NOT NULL DEFAULT 1, code TEXT NOT NULL, label TEXT NOT NULL, help_text TEXT NOT NULL DEFAULT '', required BOOLEAN NOT NULL DEFAULT TRUE, display_order INTEGER NOT NULL DEFAULT 0, UNIQUE(service_id,revision,code));
CREATE TABLE service_form_definitions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), service_id UUID NOT NULL REFERENCES services(id), revision INTEGER NOT NULL, declaration TEXT NOT NULL DEFAULT '', UNIQUE(service_id,revision));
CREATE TABLE service_form_fields (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), definition_id UUID NOT NULL REFERENCES service_form_definitions(id), key TEXT NOT NULL, label TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('text','textarea','email','telephone','number','currency','date','select','radio','checkbox','address','file')), required BOOLEAN NOT NULL DEFAULT FALSE, help_text TEXT NOT NULL DEFAULT '', validation JSONB NOT NULL DEFAULT '{}', options JSONB NOT NULL DEFAULT '[]', visibility JSONB, display_order INTEGER NOT NULL DEFAULT 0, UNIQUE(definition_id,key));
CREATE TABLE service_workflows (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), service_id UUID NOT NULL REFERENCES services(id), revision INTEGER NOT NULL, UNIQUE(service_id,revision));
CREATE TABLE service_workflow_steps (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id UUID NOT NULL REFERENCES service_workflows(id), status TEXT NOT NULL, label TEXT NOT NULL, permission TEXT NOT NULL, next_statuses JSONB NOT NULL DEFAULT '[]', display_order INTEGER NOT NULL DEFAULT 0, UNIQUE(workflow_id,status));
CREATE TABLE service_fees (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), service_id UUID NOT NULL REFERENCES services(id), revision INTEGER NOT NULL, code TEXT NOT NULL, description TEXT NOT NULL, amount NUMERIC(15,2) NOT NULL CHECK(amount >= 0), source TEXT NOT NULL, UNIQUE(service_id,revision,code));
CREATE TABLE eservice_department_members (user_id TEXT NOT NULL, department_id TEXT NOT NULL REFERENCES departments(id), PRIMARY KEY(user_id,department_id));
-- Staff identities belong to the CMS identity store; no misleading cross-database FK.
CREATE SEQUENCE eservice_request_reference;
CREATE TABLE service_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_number TEXT NOT NULL UNIQUE,
 service_id UUID NOT NULL REFERENCES services(id), applicant_user_id TEXT NOT NULL REFERENCES portal_users(id), department_id TEXT NOT NULL REFERENCES departments(id),
 definition_id UUID NOT NULL REFERENCES service_form_definitions(id), workflow_id UUID NOT NULL REFERENCES service_workflows(id), configuration_revision INTEGER NOT NULL, payment_required BOOLEAN NOT NULL DEFAULT FALSE, settings_snapshot JSONB NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','RECEIVED','IN_REVIEW','NEEDS_INFORMATION','FOR_ASSESSMENT','AWAITING_PAYMENT','PAID','FOR_APPROVAL','APPROVED','FOR_RELEASE','COMPLETED','REJECTED','CANCELLED')),
 current_workflow_step_id UUID REFERENCES service_workflow_steps(id), resume_status TEXT, assigned_user_id TEXT,
 submitted_at TIMESTAMPTZ, received_at TIMESTAMPTZ, due_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ,
 version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX requests_applicant_idx ON service_requests(applicant_user_id,created_at DESC);
CREATE INDEX requests_queue_idx ON service_requests(department_id,status,submitted_at DESC);
CREATE INDEX requests_service_idx ON service_requests(service_id);
CREATE INDEX requests_assignee_idx ON service_requests(assigned_user_id);
CREATE INDEX requests_status_idx ON service_requests(status);
CREATE INDEX requests_submitted_idx ON service_requests(submitted_at);
CREATE INDEX requests_created_idx ON service_requests(created_at);
CREATE TABLE request_form_values (request_id UUID NOT NULL REFERENCES service_requests(id), field_id UUID NOT NULL REFERENCES service_form_fields(id), value JSONB NOT NULL, PRIMARY KEY(request_id,field_id));
CREATE TABLE request_documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID NOT NULL REFERENCES service_requests(id), requirement_id UUID NOT NULL REFERENCES service_requirements(id), storage_key TEXT NOT NULL UNIQUE, original_filename TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes BIGINT NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 10485760), checksum TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED','REPLACEMENT_REQUIRED')), uploaded_by TEXT NOT NULL REFERENCES portal_users(id), uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_by TEXT, reviewed_at TIMESTAMPTZ, review_reason TEXT, replaces_id UUID REFERENCES request_documents(id), scan_status TEXT NOT NULL DEFAULT 'UNSCANNED');
CREATE INDEX request_documents_request_idx ON request_documents(request_id);
CREATE TABLE request_assignments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID NOT NULL REFERENCES service_requests(id), assigned_user_id TEXT NOT NULL, assigned_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE request_status_history (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID NOT NULL REFERENCES service_requests(id), from_status TEXT, to_status TEXT NOT NULL, actor_user_id TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE request_notes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID NOT NULL REFERENCES service_requests(id), actor_user_id TEXT NOT NULL, visibility TEXT NOT NULL CHECK(visibility IN ('INTERNAL','APPLICANT')), message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE request_actions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID NOT NULL REFERENCES service_requests(id), actor_user_id TEXT NOT NULL, action TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE businesses (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), business_reference TEXT NOT NULL UNIQUE, business_name TEXT NOT NULL, trade_name TEXT NOT NULL DEFAULT '', ownership_type TEXT NOT NULL DEFAULT '', address JSONB NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'PENDING', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE business_owners (business_id UUID NOT NULL REFERENCES businesses(id), user_id TEXT NOT NULL REFERENCES portal_users(id), ownership_role TEXT NOT NULL DEFAULT 'OWNER', effective_from TIMESTAMPTZ NOT NULL DEFAULT now(), effective_until TIMESTAMPTZ, PRIMARY KEY(business_id,user_id,effective_from));
CREATE TABLE business_applications (request_id UUID PRIMARY KEY REFERENCES service_requests(id), business_id UUID NOT NULL REFERENCES businesses(id), application_type TEXT NOT NULL CHECK(application_type IN ('NEW','RENEWAL')));
CREATE TABLE billing_accounts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_type TEXT NOT NULL CHECK(account_type IN ('BUSINESS','REAL_PROPERTY','WATER','OTHER')), account_number TEXT NOT NULL, property_identifier TEXT, business_id UUID REFERENCES businesses(id), user_id TEXT NOT NULL REFERENCES portal_users(id), source TEXT NOT NULL, department_id TEXT NOT NULL REFERENCES departments(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(account_type,account_number));
CREATE TABLE billing_statements (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES billing_accounts(id), period TEXT NOT NULL, due_at TIMESTAMPTZ, source_reference TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(account_id,source_reference));
CREATE TABLE billing_statement_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), statement_id UUID NOT NULL REFERENCES billing_statements(id), description TEXT NOT NULL, amount NUMERIC(15,2) NOT NULL CHECK(amount >= 0));
CREATE SEQUENCE eservice_order_reference;
CREATE TABLE payment_orders (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_number TEXT NOT NULL UNIQUE, request_id UUID REFERENCES service_requests(id), statement_id UUID UNIQUE REFERENCES billing_statements(id), user_id TEXT NOT NULL REFERENCES portal_users(id), department_id TEXT NOT NULL REFERENCES departments(id), status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(status IN ('DRAFT','ISSUED','UNPAID','PARTIALLY_PAID','PAID','EXPIRED','CANCELLED')), amount NUMERIC(15,2) NOT NULL CHECK(amount >= 0), currency TEXT NOT NULL DEFAULT 'PHP' CHECK(currency='PHP'), assessed_by TEXT NOT NULL, assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK((request_id IS NOT NULL)::integer + (statement_id IS NOT NULL)::integer = 1));
CREATE UNIQUE INDEX payment_orders_active_request_idx ON payment_orders(request_id) WHERE status NOT IN ('CANCELLED','EXPIRED');
CREATE TABLE payment_order_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), payment_order_id UUID NOT NULL REFERENCES payment_orders(id), fee_code TEXT NOT NULL, description TEXT NOT NULL, amount NUMERIC(15,2) NOT NULL CHECK(amount >= 0), source TEXT NOT NULL);
-- Reuse existing payments; retain legacy application payments without converting records.
ALTER TABLE payments ALTER COLUMN application_id DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN amount TYPE NUMERIC(15,2);
ALTER TABLE payments ADD COLUMN payment_order_id UUID REFERENCES payment_orders(id);
ALTER TABLE payments ADD COLUMN provider TEXT;
ALTER TABLE payments ADD COLUMN provider_reference TEXT;
ALTER TABLE payments ADD COLUMN currency TEXT NOT NULL DEFAULT 'PHP';
ALTER TABLE payments ADD COLUMN paid_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN verified_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN verified_by TEXT;
ALTER TABLE payments ADD CONSTRAINT payments_target_check CHECK(application_id IS NOT NULL OR payment_order_id IS NOT NULL);
CREATE UNIQUE INDEX payments_provider_reference_idx ON payments(provider,provider_reference) WHERE provider_reference IS NOT NULL;
CREATE TABLE payment_allocations (payment_id TEXT NOT NULL REFERENCES payments(id), payment_order_id UUID NOT NULL REFERENCES payment_orders(id), amount NUMERIC(15,2) NOT NULL CHECK(amount > 0), PRIMARY KEY(payment_id,payment_order_id));
CREATE TABLE payment_receipts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), payment_id TEXT NOT NULL REFERENCES payments(id), kind TEXT NOT NULL CHECK(kind IN ('CONFIRMATION','OFFICIAL')), official_number TEXT UNIQUE, storage_key TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(kind <> 'OFFICIAL' OR official_number IS NOT NULL));
CREATE TABLE payment_adjustments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), payment_id TEXT NOT NULL REFERENCES payments(id), kind TEXT NOT NULL CHECK(kind IN ('REVERSAL','REFUND','VOID')), reason TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(payment_id));
CREATE TABLE eservice_idempotency (actor_id TEXT NOT NULL, scope TEXT NOT NULL, key TEXT NOT NULL, payload_hash TEXT NOT NULL, response JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,scope,key));
CREATE TABLE eservice_notification_outbox (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES portal_users(id), request_id UUID REFERENCES service_requests(id), title TEXT NOT NULL, message TEXT NOT NULL, event_type TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT now(), delivered_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION eservice_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Historical record is immutable'; END $$;
CREATE TRIGGER request_history_immutable BEFORE UPDATE OR DELETE ON request_status_history FOR EACH ROW EXECUTE FUNCTION eservice_immutable();
CREATE TRIGGER request_assignments_immutable BEFORE UPDATE OR DELETE ON request_assignments FOR EACH ROW EXECUTE FUNCTION eservice_immutable();
CREATE TRIGGER request_actions_immutable BEFORE UPDATE OR DELETE ON request_actions FOR EACH ROW EXECUTE FUNCTION eservice_immutable();
CREATE TRIGGER allocations_immutable BEFORE UPDATE OR DELETE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION eservice_immutable();
CREATE TRIGGER adjustments_immutable BEFORE UPDATE OR DELETE ON payment_adjustments FOR EACH ROW EXECUTE FUNCTION eservice_immutable();
CREATE TRIGGER request_notes_immutable BEFORE UPDATE OR DELETE ON request_notes FOR EACH ROW EXECUTE FUNCTION eservice_immutable();
CREATE OR REPLACE FUNCTION eservice_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.category='eservices' THEN RAISE EXCEPTION 'Audit record is immutable'; END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER eservice_audit_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION eservice_audit_immutable();
CREATE OR REPLACE FUNCTION eservice_payment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.payment_order_id IS NOT NULL THEN RAISE EXCEPTION 'Use a financial adjustment'; END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER eservice_payments_immutable BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION eservice_payment_immutable();
INSERT INTO service_categories(name,slug) VALUES ('Business Services','business'),('Billing and Payment','billing');
INSERT INTO services(name,slug,kind,category_id) SELECT v.name,v.slug,v.kind,c.id FROM (VALUES
 ('Business Services','business-services','DIRECTORY','business'),
 ('Business Online Billing and Payment','business-billing','BUSINESS','billing'),
 ('New Business Application','new-business-application','BUSINESS_NEW','business'),
 ('Renew Business Application','renew-business-application','BUSINESS_RENEWAL','business'),
 ('Realty Tax Online Billing and Payment','realty-billing','REAL_PROPERTY','billing'),
 ('Online Payment Order','online-payment-order','PAYMENT_ORDER','billing'),
 ('Water Online Billing and Payment','water-billing','WATER','billing')
 ) v(name,slug,kind,category) JOIN service_categories c ON c.slug=v.category;
