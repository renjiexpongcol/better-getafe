CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  slug VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS department_services (
  service_id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS department_services_department_idx ON department_services(department_id);
INSERT INTO departments(id, slug, name, published, display_order, content) VALUES
('executive','executive','Office of the Municipal Mayor',TRUE,0,'{"shortDescription":"Municipal leadership and executive coordination."}'),
('engineering','engineering','Municipal Engineering Office',TRUE,1,'{"shortDescription":"Infrastructure and public works support."}'),
('zoning-planning','zoning-planning','Municipal Planning and Development / Zoning',TRUE,2,'{"shortDescription":"Land use and development planning."}'),
('treasury','treasury','Municipal Treasury Office',TRUE,3,'{"shortDescription":"Local payments, taxes, and revenue services."}'),
('assessment','assessment','Municipal Assessor''s Office',TRUE,4,'{"shortDescription":"Property assessment and tax declarations."}'),
('civil-registry','civil-registry','Municipal Civil Registrar',TRUE,5,'{"shortDescription":"Civil registration and record services."}'),
('health','health','Municipal Health Office / Rural Health Unit',TRUE,6,'{"shortDescription":"Public health and rural health services."}'),
('social-welfare','social-welfare','Municipal Social Welfare and Development Office',TRUE,7,'{"shortDescription":"Assistance and support for residents and families."}')
ON CONFLICT (id) DO NOTHING;
-- Ownership is assigned only to transactions explicitly identified in the existing catalogue.
INSERT INTO department_services(service_id, department_id) VALUES
('birth-certificate','civil-registry'),
('ordinance-violation-settlement','treasury'),('public-market-stall-settlement','treasury'),
('miscellaneous-fees-settlement','treasury'),('transport-franchise-settlement','treasury'),
('health-card','health'),('vaccination','health'),('medical-assistance','health'),('maternal-health','health')
ON CONFLICT (service_id) DO NOTHING;
