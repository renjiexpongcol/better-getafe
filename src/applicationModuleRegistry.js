// Trusted application-module registry. URL values are only keys into this
// registry; they are never used as component names or import paths.
export const MODULE_REGISTRY = {
  app: {
    dashboard: { legacyPath: '/app/dashboard', permission: 'portal.dashboard.view', title: 'Dashboard' },
    requests: { legacyPath: '/app/requests', permission: 'requests.own.view', title: 'My applications' },
    appointments: { legacyPath: '/app/appointments', permission: 'appointments.own.view', title: 'Appointments' },
    documents: { legacyPath: '/app/documents', permission: 'documents.own.view', title: 'My documents' },
    profile: { legacyPath: '/app/dashboard', permission: 'profile.own.view', title: 'My profile' },
    notifications: { legacyPath: '/app/notifications', permission: 'notifications.own.view', title: 'Notifications' },
    services: { legacyPath: '/app/services', permission: 'services.view', title: 'Municipal services' },
    payments: { legacyPath: '/app/payments', permission: 'payments.own.view', title: 'Payments' },
    help: { legacyPath: '/app/help', permission: 'help.view', title: 'Help and support' },
    settings: { legacyPath: '/app/settings', permission: 'settings.own.view', title: 'Account settings' },
  },
  staff: {
    dashboard: { legacyPath: '/app/staff', permission: 'staff.dashboard.view', title: 'Staff dashboard' },
    'request-management': { legacyPath: '/app/staff', permission: 'requests.view', title: 'Request management' },
    appointments: { legacyPath: '/app/staff', permission: 'appointments.view', title: 'Appointments' },
    'document-processing': { legacyPath: '/app/staff', permission: 'documents.process', title: 'Document processing' },
    reports: { legacyPath: '/app/staff', permission: 'reports.view', title: 'Reports' },
    notifications: { legacyPath: '/app/staff', permission: 'notifications.view', title: 'Notifications' },
    help: { legacyPath: '/app/staff', permission: 'help.view', title: 'Help and support' },
    'system-settings': { legacyPath: '/app/staff', permission: 'settings.view', title: 'System parameters' },
  },
  admin: {
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

export function moduleIds(shell) {
  return Object.keys(MODULE_REGISTRY[shell] || {})
}
