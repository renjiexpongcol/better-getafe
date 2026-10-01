-- Upgrade support for installations that applied the initial foundation.
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS payment_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS settings_snapshot JSONB NOT NULL DEFAULT '{}';
