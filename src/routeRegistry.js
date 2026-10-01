const freeze = value => Object.freeze(value)

export const ROUTES = freeze({
  public: freeze({
    home: '/',
    services: '/services',
    news: '/news',
    events: '/events',
    discover: '/discover',
    officials: '/officials',
    barangays: '/barangays',
    contact: '/contact',
    accessibility: '/accessibility',
  }),
  auth: freeze({
    login: '/auth/login',
    forgotPassword: '/auth/forgot-password',
  }),
  app: freeze({
    root: '/app',
    requests: '/app/requests',
    appointments: '/app/appointments',
    documents: '/app/documents',
    payments: '/app/payments',
    notifications: '/app/notifications',
    services: '/app/services',
    profile: '/app/profile',
    settings: '/app/settings',
    help: '/app/help',
    newRequest: '/app/requests/new',
    request: id => `/app/requests/${encodeURIComponent(id)}`,
  }),
  staff: freeze({
    root: '/app/staff',
    requests: '/app/staff/requests',
    request: id => `/app/staff/requests/${encodeURIComponent(id)}`,
    notifications: '/app/staff/notifications',
    settings: '/app/staff/settings',
    help: '/app/staff/help',
  }),
  admin: freeze({
    root: '/admin',
    news: '/admin/news',
    editor: '/admin/editor',
    categories: '/admin/categories',
    discover: '/admin/discover',
    departments: '/admin/departments',
    media: '/admin/media',
    officials: '/admin/officials',
    barangays: '/admin/barangays',
    users: '/admin/users',
    access: '/admin/access',
    groups: '/admin/access/groups',
    permissions: '/admin/access/permissions',
    policies: '/admin/access/policies',
    audit: '/admin/audit',
    errors: '/admin/system/errors',
    privacy: '/admin/privacy',
    settings: '/admin/settings',
    setting: category => `/admin/settings/${settingsCategorySlug(category)}`,
  }),
})

export const ADMIN_MODULE_PATHS = freeze({
  'service-catalog': '/admin/service-catalog',
  dashboard: ROUTES.admin.root,
  news: ROUTES.admin.news,
  editor: ROUTES.admin.editor,
  categories: ROUTES.admin.categories,
  discover: ROUTES.admin.discover,
  departments: ROUTES.admin.departments,
  media: ROUTES.admin.media,
  officials: ROUTES.admin.officials,
  barangays: ROUTES.admin.barangays,
  users: ROUTES.admin.users,
  access: ROUTES.admin.access,
  groups: ROUTES.admin.groups,
  permissions: ROUTES.admin.permissions,
  policies: ROUTES.admin.policies,
  audit: ROUTES.admin.audit,
  errors: ROUTES.admin.errors,
  privacy: ROUTES.admin.privacy,
  settings: '/admin/settings/general',
  'system-settings': '/admin/settings/general',
})

export const STAFF_MODULE_PATHS = freeze({
  'e-service-requests': '/app/staff/e-requests',
  requests: '/app/staff/e-requests',
  dashboard: ROUTES.staff.root,
  'request-management': ROUTES.staff.requests,
  notifications: ROUTES.staff.notifications,
  'system-settings': ROUTES.staff.settings,
  help: ROUTES.staff.help,
})

export const APP_MODULE_PATHS = freeze({
  'my-requests': '/app/e-requests',
  dashboard: ROUTES.app.root,
  requests: ROUTES.app.requests,
  appointments: ROUTES.app.appointments,
  documents: ROUTES.app.documents,
  profile: ROUTES.app.profile,
  notifications: ROUTES.app.notifications,
  services: ROUTES.app.services,
  payments: ROUTES.app.payments,
  help: ROUTES.app.help,
  settings: ROUTES.app.settings,
})

const SETTINGS_SLUGS = freeze({
  general: 'general',
  database: 'database',
  portalDatabase: 'portal-database',
  google: 'google-cloud',
  storage: 'storage',
  authentication: 'authentication',
  email: 'email',
  security: 'security',
  notifications: 'notifications',
  integrations: 'integrations',
  weather: 'weather',
  publicData: 'public-data',
  features: 'feature-flags',
  maintenance: 'maintenance',
  legal: 'legal-policies',
  advanced: 'advanced',
  status: 'system-status',
  history: 'audit-history',
})

const SETTINGS_KEYS_BY_SLUG = freeze(Object.fromEntries(
  Object.entries(SETTINGS_SLUGS).map(([key, slug]) => [slug, key]),
))

export const settingsCategorySlug = category => SETTINGS_SLUGS[category] || String(category || '')
export const settingsCategoryKey = slug => SETTINGS_KEYS_BY_SLUG[slug] || null
export const isSettingsCategorySlug = slug => Boolean(settingsCategoryKey(slug))

export function adminLocation(pathname) {
  if (pathname === ROUTES.admin.root) return { module: 'dashboard', category: null }
  if (pathname === ROUTES.admin.settings) return { module: 'settings', category: 'general', redirect: '/admin/settings/general' }
  if (pathname.startsWith(`${ROUTES.admin.settings}/`)) {
    const slug = pathname.slice(ROUTES.admin.settings.length + 1)
    const category = settingsCategoryKey(slug)
    return category ? { module: 'settings', category } : null
  }
  const entry = Object.entries(ADMIN_MODULE_PATHS)
    .filter(([module]) => !['dashboard', 'settings', 'system-settings'].includes(module))
    .find(([, path]) => path === pathname)
  return entry ? { module: entry[0], category: null } : null
}

export function staffLocation(pathname) {
  if (pathname === '/app/staff/e-requests' || pathname.startsWith('/app/staff/e-requests/')) return { module: 'e-service-requests', recordId: pathname.split('/')[4] || null };
  if (pathname === ROUTES.staff.root) return { module: 'dashboard', recordId: null }
  if (pathname.startsWith(`${ROUTES.staff.requests}/`)) {
    const record = pathname.slice(ROUTES.staff.requests.length + 1)
    if (!record || record.includes('/')) return null
    try { return { module: 'request-management', recordId: decodeURIComponent(record) } } catch { return null }
  }
  const entry = Object.entries(STAFF_MODULE_PATHS).find(([, path]) => path === pathname)
  return entry ? { module: entry[0], recordId: null } : null
}

const QUERY_OWNERS = [
  [/^\/app\/(staff\/)?e-requests$/, new Set(['page','status','search','assigned','service_id','department_id','from','to'])],
  [/^\/barangays$/, new Set(['brgy'])],
  [/^\/services$/, new Set(['category', 'search', 'page', 'sort'])],
  [/^\/admin\/media$/, new Set(['page', 'limit', 'search', 'usage', 'sort'])],
  [/^\/admin\/news$/, new Set(['page', 'status', 'search', 'category'])],
  [/^\/admin\/audit$/, new Set(['page', 'actor', 'action', 'from', 'to'])],
  [/^\/admin\/settings\/[a-z0-9-]+$/, new Set(['config'])],
  [/^\/app\/requests$/, new Set(['page', 'status', 'search'])],
  [/^\/app\/requests\/new$/, new Set(['service'])],
  [/^\/app\/requests\/[^/]+$/, new Set(['submitted'])],
  [/^\/app\/appointments$/, new Set(['book'])],
  [/^\/app\/documents$/, new Set(['document', 'application', 'view'])],
  [/^\/app\/payments$/, new Set(['settlement'])],
  [/^\/app\/notifications$/, new Set(['page', 'status', 'notification'])],
  [/^\/app\/services$/, new Set(['category', 'search'])],
  [/^\/app\/help$/, new Set(['report'])],
]

export function ownedSearch(pathname, search = '') {
  const allowed = QUERY_OWNERS.find(([pattern]) => pattern.test(pathname))?.[1] || new Set()
  const current = new URLSearchParams(search)
  const next = new URLSearchParams()
  current.forEach((value, key) => {
    if (allowed.has(key) && value !== '') next.append(key, value)
  })
  const query = next.toString()
  return query ? `?${query}` : ''
}

export function legacyAdminTarget(search = '') {
  const params = new URLSearchParams(search)
  const requestedObjectId = params.get('sysparm_object_id') || params.get('tab')
  const objectId = { 'media-library': 'media' }[requestedObjectId] || requestedObjectId
  if (!objectId) return null
  if (objectId === 'system-settings' || objectId === 'settings') {
    const rawCategory = params.get('category')
    if (!rawCategory) return ROUTES.admin.setting('general')
    const category = SETTINGS_SLUGS[rawCategory] ? rawCategory : settingsCategoryKey(rawCategory)
    return category ? ROUTES.admin.setting(category) : `/admin/settings/${encodeURIComponent(rawCategory)}`
  }
  return ADMIN_MODULE_PATHS[objectId] || null
}

const ADMIN_ACCESS_NAV_MODULES = new Set(['access', 'users', 'groups', 'permissions', 'policies', 'audit'])

// The sidebar is a view of the current URL, including legacy module URLs that
// are still accepted at /admin before CanonicalRoute redirects them.
export function getAdminActiveModule(location = {}) {
  const pathname = typeof location === 'string' ? location : location.pathname || ''
  const search = typeof location === 'string' ? '' : location.search || ''
  let activePathname = pathname

  if (pathname === ROUTES.admin.root) {
    const legacyParams = new URLSearchParams(search)
    if (legacyParams.has('sysparm_object_id') || legacyParams.has('tab')) {
      const legacyTarget = legacyAdminTarget(search)
      if (!legacyTarget) return null
      activePathname = legacyTarget.split('?')[0]
    }
  }

  const routeState = adminLocation(activePathname)
  if (!routeState) return null
  return ADMIN_ACCESS_NAV_MODULES.has(routeState.module) ? 'access' : routeState.module
}

export function legacyAppTarget(search = '') {
  const params = new URLSearchParams(search)
  const objectId = params.get('sysparm_object_id')
  if (!objectId) return null
  if (objectId === 'requests' && params.get('sysparm_view') === 'new') {
    const next = new URLSearchParams()
    if (params.get('service')) next.set('service', params.get('service'))
    return `${ROUTES.app.newRequest}${next.size ? `?${next}` : ''}`
  }
  if (objectId === 'requests' && params.get('sysparm_record_id')) {
    const next = new URLSearchParams()
    if (params.has('submitted')) next.set('submitted', params.get('submitted'))
    return `${ROUTES.app.request(params.get('sysparm_record_id'))}${next.size ? `?${next}` : ''}`
  }
  if (objectId === 'documents' && params.get('sysparm_record_id')) {
    const next = new URLSearchParams({ application: params.get('sysparm_record_id') })
    if (params.get('sysparm_view') === 'upload') next.set('view', 'upload')
    return `${ROUTES.app.documents}?${next}`
  }
  if (objectId === 'notifications' && params.get('sysparm_record_id')) {
    return `${ROUTES.app.notifications}?notification=${encodeURIComponent(params.get('sysparm_record_id'))}`
  }
  const path = APP_MODULE_PATHS[objectId]
  if (!path) return null
  const allowedSearch = ownedSearch(path, search)
  return `${path}${allowedSearch}`
}

export function legacyStaffTarget(search = '') {
  const params = new URLSearchParams(search)
  const objectId = params.get('sysparm_object_id')
  if (objectId === 'request-management' && params.get('sysparm_record_id')) return ROUTES.staff.request(params.get('sysparm_record_id'))
  return objectId ? STAFF_MODULE_PATHS[objectId] || null : null
}

export function normalizePathname(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return '/'
  const collapsed = pathname.replace(/\/{2,}/g, '/')
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed
}
