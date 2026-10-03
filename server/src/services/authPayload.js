export function safeUser(user) {
  return {
    id: user.id,
    ...(user.eid ? { eid:user.eid,department:user.department || null,position:user.position || null } : {}),
    name: user.name,
    email: user.email,
    role: user.role,
    mfaEnabled: user.mfa_enabled === true || user.mfa_enabled === 1,
    avatar_url: user.avatar_storage_path ? `/api/account/avatar?v=${encodeURIComponent(user.updated_at instanceof Date ? user.updated_at.toISOString() : user.updated_at || 'current')}` : null,
  };
}
