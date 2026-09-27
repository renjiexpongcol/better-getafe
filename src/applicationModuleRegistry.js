// Trusted application-module registry. Module identifiers select only known
// entries, and their canonical paths come from the shared route registry.
import { ROUTES } from './routeRegistry.js'

export const MODULE_REGISTRY = {
  app: {
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
    dashboard: { path: ROUTES.staff.root, permission: 'staff.dashboard.view', title: 'Staff dashboard' },
    'request-management': { path: ROUTES.staff.requests, permission: 'requests.view', title: 'Request management' },
    appointments: { path: ROUTES.staff.root, permission: 'appointments.view', title: 'Appointments' },
    'document-processing': { path: ROUTES.staff.root, permission: 'documents.process', title: 'Document processing' },
    reports: { path: ROUTES.staff.root, permission: 'reports.view', title: 'Reports' },
    notifications: { path: ROUTES.staff.notifications, permission: 'notifications.view', title: 'Notifications' },
    help: { path: ROUTES.staff.help, permission: 'help.view', title: 'Help and support' },
    'system-settings': { path: ROUTES.staff.settings, permission: 'settings.view', title: 'System parameters' },
  },
  admin: {
    discover: { permission: 'content.news.manage', title: 'Discover Getafe' },
    dashboard: { permission: 'admin.dashboard.view', title: 'Dashboard' },
    users: { permission: 'users.view', title: 'Users' },
    groups: { permission: 'groups.manage', title: 'Groups' },
    permissions: { permission: 'permissions.manage', title: 'Permissions' },
    policies: { permission: 'policies.manage', title: 'Policies' },
    audit: { permission: 'audit.view', title: 'Audit log' },
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

export function resolveModuleAccess(shell, objectId = 'dashboard', user) {
  const module = resolveModule(shell, objectId)
  if (!module) return { state: 'not-found', module: null }
  if (shell !== 'app' && Array.isArray(user?.permissions) && !user.permissions.includes(module.permission)) {
    return { state: 'forbidden', module }
  }
  return { state: 'allowed', module }
}

export function moduleIds(shell) {
  return Object.keys(MODULE_REGISTRY[shell] || {})
}
