-- The legacy account importer originally created this ledger on demand.
CREATE TABLE IF NOT EXISTS public.legacy_account_imports (
  account_table TEXT NOT NULL,
  account_id TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_table, account_id)
);
