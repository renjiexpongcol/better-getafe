CREATE TABLE IF NOT EXISTS auth_policy_editors (
  policy_id TEXT PRIMARY KEY REFERENCES auth_policies(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES auth_groups(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  granted_by TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_policy_proposals (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES auth_policies(id),
  author_id TEXT NOT NULL,
  base_version TIMESTAMPTZ NOT NULL,
  before_value JSONB NOT NULL,
  proposed_value JSONB NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected')),
  reviewer_id TEXT,
  reviewed_at TIMESTAMPTZ,
  CHECK (reviewer_id IS NULL OR reviewer_id <> author_id)
);
CREATE INDEX IF NOT EXISTS auth_policy_proposals_policy ON auth_policy_proposals(policy_id,created_at DESC);
ALTER TABLE public.auth_policy_editors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_policy_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_policy_editors, public.auth_policy_proposals FROM PUBLIC, anon, authenticated;
