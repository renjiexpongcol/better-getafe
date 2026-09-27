export function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mfaEnabled: user.mfa_enabled === true || user.mfa_enabled === 1,
    avatar_url: user.avatar_storage_path ? `/api/account/avatar?v=${encodeURIComponent(user.avatar_storage_path)}` : null,
  };
}
