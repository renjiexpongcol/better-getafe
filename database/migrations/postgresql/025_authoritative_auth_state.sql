-- Old Redis-only consumption did not reliably invalidate durable fallback
-- copies. Their historical consumption cannot be inferred, so revoke all
-- outstanding single-use grants once during rollout. Users can request new
-- codes/resets and restart OAuth/MFA enrollment. Preserve revocations,
-- verification, lockouts, password ages and other long-lived security state.
UPDATE auth_state SET value = 'null', expires_at = 0
WHERE split_part(state_key, ':', 1) IN
  ('challenge', 'passwordReset', 'google-oauth-state', 'mfa-login', 'mfa-enrollment');
