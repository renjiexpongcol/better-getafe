-- Add double opt-in and unsubscribe tokens without replacing existing rows.
ALTER TABLE newsletter_subscriptions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE newsletter_subscriptions ADD COLUMN IF NOT EXISTS confirmation_token_hash TEXT;
ALTER TABLE newsletter_subscriptions ADD COLUMN IF NOT EXISTS confirmation_expires_at TIMESTAMPTZ;
ALTER TABLE newsletter_subscriptions ADD COLUMN IF NOT EXISTS unsubscribe_token_hash TEXT;
ALTER TABLE newsletter_subscriptions ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_confirmation_token_hash_idx ON newsletter_subscriptions (confirmation_token_hash) WHERE confirmation_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_unsubscribe_token_hash_idx ON newsletter_subscriptions (unsubscribe_token_hash) WHERE unsubscribe_token_hash IS NOT NULL;
