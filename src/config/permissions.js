import { config } from './index.js';
export const allPermissions = ['settings.view', 'settings.edit', 'settings.secrets.edit', 'settings.database.edit', 'settings.storage.edit', 'settings.security.edit', 'settings.audit.view', 'requests.view', 'requests.manage'];
export const cmsRoles = ['admin', 'super_admin', 'staff', 'it_support', 'content_manager'];
export const rolePermissions = { staff: ['settings.view', 'requests.view', 'requests.manage'], it_support: ['settings.view', 'settings.edit', 'settings.database.edit', 'settings.storage.edit', 'requests.view', 'requests.manage'], content_manager: ['settings.view'] };
export function permissionsFor(user) {
  if (!cmsRoles.includes(user?.role)) return [];
  if (user.role === 'super_admin') return allPermissions;
  const grants = JSON.parse(config.get('security.permissionGrants'));
  // An explicit grant is an override for every non-super-admin role. This
  // allows an administrator to delegate a tailored set of permissions to a
  // staff account instead of forcing the role defaults.
  if (Object.prototype.hasOwnProperty.call(grants, user.id)) {
    const granted = Array.isArray(grants[user.id]) ? grants[user.id] : [];
    // Backward compatibility for staff accounts delegated before request
    // permissions were introduced. Their existing access should not break
    // when the staff request workspace is enabled.
    if (['staff', 'it_support'].includes(user.role) && !granted.some(permission => permission.startsWith('requests.'))) return [...new Set([...granted, 'requests.view', 'requests.manage'])];
    return granted;
  }
  return rolePermissions[user.role] || allPermissions;
}
export function requirePermission(user, permission) { if (!permissionsFor(user).includes(permission)) throw new Error(`Permission required: ${permission}`); }
export function authorizeChanges(user, values) {
  requirePermission(user, 'settings.edit');
  for (const [key, value] of Object.entries(values || {})) {
    if (['database', 'portalDatabase'].includes(key.split('.')[0])) requirePermission(user, 'settings.database.edit');
    if (['storage', 'google'].includes(key.split('.')[0])) requirePermission(user, 'settings.storage.edit');
    if (['security', 'authentication'].includes(key.split('.')[0])) requirePermission(user, 'settings.security.edit');
    if (/(password|clientsecret|apikey|oauthclientsecret)$/i.test(key) && value !== '') requirePermission(user, 'settings.secrets.edit');
    if (key === 'security.permissionGrants' && user.role !== 'super_admin') {
      const old = JSON.parse(config.get(key)), next = value === null ? {} : JSON.parse(value);
      const own = next[user.id] || allPermissions;
      if (!own.includes('settings.security.edit') || !own.includes('settings.edit')) throw new Error('You cannot remove your own settings recovery access.');
      for (const [id, permissions] of Object.entries(next)) if (JSON.stringify(old[id]) !== JSON.stringify(permissions) && permissions.some(permission => !permissionsFor(user).includes(permission))) throw new Error('Cannot grant permissions you do not hold.');
      for (const id of Object.keys(old)) if (!next[id] && permissionsFor(user).length !== allPermissions.length) throw new Error('Cannot restore permissions you do not hold.');
    }
  }
}
