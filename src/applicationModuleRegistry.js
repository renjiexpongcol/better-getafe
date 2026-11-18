// Trusted application-module registry. Module identifiers select only known
// entries, and their canonical paths come from the shared route registry.
import { ROUTES } from './routeRegistry.js'
import { hasPermission } from '@getafe/auth-client'

export const MODULE_REGISTRY = {
  app: {
    'my-requests': {path:'/app/e-requests',permission:'requests.own.view',title:'My requests'},
    dashboard: { path: ROUTES.app.root, permission: 'portal.dashboard.view', title: 'Dashboard' },
    requests: { path: ROUTES.app.requests, permission: 'requests.own.view', title: 'My applications' },
    appointments: { path: ROUTES.app.appointments, permission: 'appointments.own.view', title: 'Appointments' },
    documents: { path: ROUTES.app.documents, permission: 'documents.own.view', title: 'My documents' },
    profile: { path: ROUTES.app.profile, permission: 'profile.own.view', title: 'My profile' },
    notifications: { path: ROUTES.app.notifications, permission: 'notifications.own.view', title: 'Notifications' },
    services: { path: ROUTES.app.services, permission: 'services.view', title: 'Municipal services' },
    payments: { path: ROUTES.app.payments, permission: 'payments.own.view', title: 'Payments' },
    help: { path: ROUTES.app.help, permission: 'help.view', title: 'Help and support' },
    settings: { path: ROUTES.app.settings, permission: 'settings.own.view', title: 'Account settings' },
  },
  staff: {
    profile: {path: ROUTES.staff.profile, title:'My profile'},
    security: {path: ROUTES.staff.security, title:'Account security'},
    'e-service-requests': { path: '/app/staff/e-requests', permission: 'requests.department.view', title: 'E-service requests' },
    dashboard: { path: ROUTES.staff.root, permission: 'staff.dashboard.view', title: 'Staff dashboard' },
    'request-management': { path: ROUTES.staff.requests, permission: 'requests.view', title: 'Request management' },
    appointments: { path: ROUTES.staff.root, permission: 'appointments.view', title: 'Appointments' },
    'document-processing': { path: ROUTES.staff.root, permission: 'documents.process', title: 'Document processing' },
    reports: { path: ROUTES.staff.root, permission: 'reports.view', title: 'Reports' },
    notifications: { path: ROUTES.staff.notifications, permission: 'notifications.view', title: 'Notifications' },
    help: { path: ROUTES.staff.help, permission: 'help.view', title: 'Help and support' },
    'system-settings': { path: ROUTES.staff.settings, permission: 'system.settings.manage', title: 'System parameters' },
  },
  admin: {
    'public-content': { permission: 'content.news.manage', title: 'Public content' },
    integrations: { permission: 'integrations.view', anyPermissions: ['integrations.api_keys.view', 'integrations.api_keys.manage'], title: 'Integrations' },
    'service-catalog': { permission: 'services.catalog.view', title: 'Service catalog' },
    search: { permission: 'search.manage', title: 'Search management' },
    'website-analytics': { permission: 'analytics.view', title: 'Website Analytics' },
    discover: { permission: 'content.news.manage', title: 'Discover Getafe' },
    dashboard: { permission: 'admin.dashboard.view', title: 'Dashboard' },
    users: { permission: 'users.view', title: 'Users' },
    groups: { permission: 'groups.manage', title: 'Groups' },
    permissions: { permission: 'permissions.manage', title: 'Permissions' },
    policies: { permission: 'policies.manage', anyPermissions: ['policies.edit'], title: 'Policies' },
    audit: { permission: 'audit.view', title: 'Audit log' },
    errors: { permission: 'system.errors.view', title: 'Error Center' },
    'roles-permissions': { permission: 'permissions.manage', title: 'Roles and permissions' },
    departments: { permission: 'departments.manage', title: 'Departments' },
    'audit-logs': { permission: 'audit.view', title: 'Audit logs' },
    'system-settings': { permission: 'system.settings.manage', title: 'System settings' },
    news: { permission: 'content.news.manage', title: 'News and events' },
    categories: { permission: 'content.categories.manage', title: 'Categories' },
    media: { permission: 'content.media.manage', title: 'Media library' },
    officials: { permission: 'directory.manage', title: 'Officials' },
    barangays: { permission: 'directory.manage', title: 'Barangays' },
    privacy: { permission: 'privacy.manage', title: 'Privacy requests' },
    access: { permission: 'users.view', title: 'Access management' },
    editor: { permission: 'content.news.manage', title: 'Content editor' },
    settings: { permission: 'system.settings.manage', title: 'Settings' },
  },
}

export function resolveModule(shell, objectId = 'dashboard') {
  const modules = MODULE_REGISTRY[shell] || {}
  return modules[objectId] || null
}

export function hasModulePermission(module, user) {
  if (!module) return false
  if (module.permission && hasPermission(user, module.permission)) return true
  return Boolean(module.anyPermissions?.some(permission => hasPermission(user, permission)))
}

export function resolveModuleAccess(shell, objectId = 'dashboard', user) {
  const module = resolveModule(shell, objectId)
  if (!module) return { state: 'not-found', module: null }
  const adminStaffAccess = shell === 'staff' && ['admin', 'super_admin'].includes(user?.role)
  if (shell !== 'app' && !adminStaffAccess && !hasModulePermission(module, user)) {
    return { state: 'forbidden', module }
  }
  return { state: 'allowed', module }
}

export function moduleIds(shell) {
  return Object.keys(MODULE_REGISTRY[shell] || {})
}
