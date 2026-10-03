ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_service_request_idx ON appointments(service_request_id) WHERE service_request_id IS NOT NULL;
