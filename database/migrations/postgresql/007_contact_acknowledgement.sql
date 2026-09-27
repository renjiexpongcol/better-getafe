ALTER TABLE contact_messages
  ADD COLUMN IF NOT EXISTS acknowledgement_status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (acknowledgement_status IN ('pending', 'sent', 'failed', 'disabled'));

ALTER TABLE contact_messages
  ADD COLUMN IF NOT EXISTS acknowledgement_sent_at TIMESTAMPTZ;
