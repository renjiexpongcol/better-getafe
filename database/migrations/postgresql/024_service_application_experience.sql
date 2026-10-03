-- Additive metadata on revisioned forms; existing requests keep their definitions.
ALTER TABLE service_form_fields ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT '';
ALTER TABLE service_form_fields ADD COLUMN IF NOT EXISTS profile_source TEXT NOT NULL DEFAULT '';
ALTER TABLE service_form_fields ADD COLUMN IF NOT EXISTS profile_readonly BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS applicant_snapshot JSONB NOT NULL DEFAULT '{}';
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS draft_step INTEGER NOT NULL DEFAULT 0 CHECK (draft_step BETWEEN 0 AND 102);
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS draft_context JSONB NOT NULL DEFAULT '{}';

-- Structural entries only: offices must configure and publish actual services.
INSERT INTO service_categories(name,slug) VALUES ('Other Services','other') ON CONFLICT(slug) DO NOTHING;
INSERT INTO services(name,slug,kind,category_id)
SELECT entry.name,entry.slug,entry.kind,category.id FROM (VALUES
 ('Business Registration Request','business-registration','BUSINESS','business'),
 ('Business Clearance','business-clearance','BUSINESS','business'),
 ('Business Certification','business-certification','BUSINESS','business'),
 ('Retirement or Closure of Business','business-closure','BUSINESS','business'),
 ('Other Services','other-services','DIRECTORY','other')
) entry(name,slug,kind,category) JOIN service_categories category ON category.slug=entry.category
ON CONFLICT(slug) DO NOTHING;
-- New business transactions are applications; legacy billing stays unchanged.
UPDATE services SET settings=settings||'{"workflow_type":"APPLICATION"}'::jsonb
WHERE slug IN ('business-registration','business-clearance','business-certification','business-closure') AND NOT published AND version=1 AND settings='{}'::jsonb;
