export function safeUser(user) {
  return {
    id: user.id,
    ...(user.eid ? { eid:user.eid,department:user.department || null,position:user.position || null } : {}),
    name: user.name,
    email: user.email,
    role: user.role,
    mfaEnabled: user.mfa_enabled === true || user.mfa_enabled === 1,
    // Include the owner in the cache key so a shared browser profile cannot
    // reuse a previously authenticated account's private avatar.
    avatar_url: user.avatar_storage_path ? `/api/account/avatar?u=${encodeURIComponent(user.id)}&v=${encodeURIComponent(user.updated_at instanceof Date ? user.updated_at.toISOString() : user.updated_at || 'current')}` : null,
  };
}
