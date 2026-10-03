-- Extend the existing request, business, assessment and payment systems.
CREATE SEQUENCE eservice_bill_reference;
CREATE SEQUENCE eservice_payment_reference;
CREATE SEQUENCE eservice_business_reference;
ALTER TABLE payments ADD COLUMN payment_reference TEXT UNIQUE DEFAULT ('PAY-'||to_char(now() AT TIME ZONE 'Asia/Manila','YYYY')||'-'||lpad(nextval('eservice_payment_reference')::text,6,'0'));
ALTER TABLE payment_orders ADD COLUMN billing_period TEXT NOT NULL DEFAULT '';
ALTER TABLE service_fees ADD COLUMN fee_type TEXT NOT NULL DEFAULT 'CHARGE' CHECK(fee_type IN ('CHARGE','TAX','REGULATORY','PENALTY','CREDIT','PROCESSING'));
ALTER TABLE payment_order_items ADD COLUMN fee_type TEXT NOT NULL DEFAULT 'CHARGE' CHECK(fee_type IN ('CHARGE','TAX','REGULATORY','PENALTY','CREDIT','PROCESSING'));
CREATE TABLE request_business_billing (
 request_id UUID PRIMARY KEY REFERENCES service_requests(id),
 business_id UUID NOT NULL REFERENCES businesses(id),
 selected_order_id UUID UNIQUE REFERENCES payment_orders(id),
 reviewed_order_id UUID REFERENCES payment_orders(id),
 reviewed_at TIMESTAMPTZ
);
CREATE INDEX request_business_billing_business_idx ON request_business_billing(business_id);
CREATE TABLE payment_attempts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 reference TEXT NOT NULL UNIQUE DEFAULT ('PAY-'||to_char(now() AT TIME ZONE 'Asia/Manila','YYYY')||'-'||lpad(nextval('eservice_payment_reference')::text,6,'0')),
 payment_order_id UUID NOT NULL REFERENCES payment_orders(id),
 user_id TEXT NOT NULL REFERENCES portal_users(id),
 method TEXT NOT NULL CHECK(method IN ('TREASURY','BANK','EWALLET','OVER_COUNTER')),
 payer_reference TEXT NOT NULL,
 amount NUMERIC(15,2) NOT NULL CHECK(amount>0),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VERIFIED','REJECTED')),
 payment_id TEXT UNIQUE REFERENCES payments(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 resolved_at TIMESTAMPTZ,
 resolved_by TEXT,
 reason TEXT
);
CREATE UNIQUE INDEX payment_attempt_one_pending ON payment_attempts(payment_order_id) WHERE status='PENDING';
CREATE TABLE payment_gateway_checkouts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), payment_order_id UUID NOT NULL REFERENCES payment_orders(id),
 user_id TEXT NOT NULL REFERENCES portal_users(id), provider TEXT NOT NULL,
 amount NUMERIC(15,2) NOT NULL CHECK(amount>0), currency TEXT NOT NULL DEFAULT 'PHP',
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED')),
 checkout_url TEXT, provider_reference TEXT, payment_id TEXT REFERENCES payments(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(provider,provider_reference)
);
CREATE UNIQUE INDEX gateway_checkout_one_pending ON payment_gateway_checkouts(payment_order_id) WHERE status='PENDING';
CREATE FUNCTION protect_payment_attempt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'PENDING' OR NEW.status NOT IN ('VERIFIED','REJECTED') OR
 (to_jsonb(OLD)-ARRAY['status','payment_id','resolved_at','resolved_by','reason']) IS DISTINCT FROM
 (to_jsonb(NEW)-ARRAY['status','payment_id','resolved_at','resolved_by','reason']) THEN
 RAISE EXCEPTION 'Payment submission is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_attempt_integrity BEFORE UPDATE OR DELETE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION protect_payment_attempt();
-- Names already stored as UUID-like references remain intact for compatibility.
-- New references use sequences; no existing account or financial record is recreated.
DO $$ DECLARE s services%ROWTYPE; definition UUID; workflow UUID; BEGIN
 FOR s IN SELECT * FROM services WHERE kind='BUSINESS' AND NOT EXISTS
   (SELECT 1 FROM service_workflows w JOIN service_workflow_steps x ON x.workflow_id=w.id WHERE w.service_id=services.id AND w.revision=services.version)
 LOOP
   INSERT INTO service_form_definitions(service_id,revision,declaration) VALUES(s.id,s.version+1,
     COALESCE(NULLIF((SELECT declaration FROM service_form_definitions WHERE service_id=s.id AND revision=s.version),''),'I confirm that I am authorized to transact for this business and that the submitted information is correct.')) RETURNING id INTO definition;
   INSERT INTO service_form_fields(definition_id,key,label,type,required,help_text,validation,options,visibility,display_order)
     SELECT definition,f.key,f.label,f.type,f.required,f.help_text,f.validation,f.options,f.visibility,f.display_order FROM service_form_fields f JOIN service_form_definitions d ON d.id=f.definition_id WHERE d.service_id=s.id AND d.revision=s.version;
   INSERT INTO service_requirements(service_id,revision,code,label,help_text,required,display_order) SELECT service_id,s.version+1,code,label,help_text,required,display_order FROM service_requirements WHERE service_id=s.id AND revision=s.version;
   INSERT INTO service_fees(service_id,revision,code,description,amount,source) SELECT service_id,s.version+1,code,description,amount,source FROM service_fees WHERE service_id=s.id AND revision=s.version;
   INSERT INTO service_workflows(service_id,revision) VALUES(s.id,s.version+1) RETURNING id INTO workflow;
   INSERT INTO service_workflow_steps(workflow_id,status,label,permission,next_statuses,display_order)
   SELECT workflow,v.status,v.label,v.permission,v.next_statuses::jsonb,v.display_order FROM (VALUES
     ('DRAFT','Draft','requests.own.update','["SUBMITTED","CANCELLED"]',0),
     ('SUBMITTED','Submitted','requests.department.process','["IN_REVIEW","FOR_ASSESSMENT","AWAITING_PAYMENT","CANCELLED"]',1),
     ('IN_REVIEW','Under review','requests.department.process','["FOR_ASSESSMENT","NEEDS_INFORMATION","REJECTED","CANCELLED"]',2),
     ('NEEDS_INFORMATION','Action required','requests.department.process','["IN_REVIEW","FOR_ASSESSMENT","CANCELLED"]',3),
     ('FOR_ASSESSMENT','For assessment','assessments.create','["AWAITING_PAYMENT","NEEDS_INFORMATION","REJECTED","CANCELLED"]',4),
     ('AWAITING_PAYMENT','Ready for payment','assessments.create','["PAID","CANCELLED"]',5),
     ('PAID','Paid','payments.verify','["COMPLETED","AWAITING_PAYMENT"]',6),
     ('COMPLETED','Completed','requests.department.process','[]',7),
     ('REJECTED','Rejected','requests.department.process','[]',8),
     ('CANCELLED','Cancelled','requests.department.process','[]',9)
   ) v(status,label,permission,next_statuses,display_order);
   UPDATE services SET version=s.version+1,payment_required=TRUE,settings=settings||'{"workflow_type":"ASSESSMENT_PAYMENT"}'::jsonb,updated_at=now() WHERE id=s.id;
 END LOOP;
END $$;
