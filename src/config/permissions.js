import { config } from './index.js';
export const allPermissions = ['settings.view', 'settings.edit', 'settings.secrets.edit', 'settings.database.edit', 'settings.storage.edit', 'settings.security.edit', 'settings.audit.view'];
export function permissionsFor(user) {
  if (!['admin', 'super_admin'].includes(user?.role)) return [];
  if (user.role === 'super_admin') return allPermissions;
  const grants = JSON.parse(config.get('security.permissionGrants'));
  return grants[user.id] || allPermissions;
}
export function requirePermission(user, permission) { if (!permissionsFor(user).includes(permission)) throw new Error(`Permission required: ${permission}`); }
export function authorizeChanges(user, values) {
  requirePermission(user, 'settings.edit');
  for (const [key, value] of Object.entries(values || {})) {
    if (['database', 'portalDatabase'].includes(key.split('.')[0])) requirePermission(user, 'settings.database.edit');
    if (['storage', 'google'].includes(key.split('.')[0])) requirePermission(user, 'settings.storage.edit');
    if (['security', 'authentication'].includes(key.split('.')[0])) requirePermission(user, 'settings.security.edit');
    if (/password$|clientSecret$|apiKey$|oauthClientSecret$/.test(key) && value !== '') requirePermission(user, 'settings.secrets.edit');
    if (key === 'security.permissionGrants' && user.role !== 'super_admin') {
      const old = JSON.parse(config.get(key)), next = value === null ? {} : JSON.parse(value);
      const own = next[user.id] || allPermissions;
      if (!own.includes('settings.security.edit') || !own.includes('settings.edit')) throw new Error('You cannot remove your own settings recovery access.');
      for (const [id, permissions] of Object.entries(next)) if (JSON.stringify(old[id]) !== JSON.stringify(permissions) && permissions.some(permission => !permissionsFor(user).includes(permission))) throw new Error('Cannot grant permissions you do not hold.');
      for (const id of Object.keys(old)) if (!next[id] && permissionsFor(user).length !== allPermissions.length) throw new Error('Cannot restore permissions you do not hold.');
    }
  }
}
