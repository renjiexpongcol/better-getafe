const routeOverrides = {
  './pages/discover/Destination.jsx': '/discover/:slug',
  './pages/admin/Admin.jsx': '/admin',
  './pages/news/Article.jsx': '/news/:slug',
  './pages/events/EventArticle.jsx': '/events/:slug',
  './pages/info/Officials.jsx': '/officials',
  './pages/info/OfficialProfile.jsx': '/officials/:id',
  './pages/info/Accessibility.jsx': '/accessibility',
  './pages/tourism/Banacon.jsx': '/tourism/banacon',
  './pages/info/AboutUs.jsx': '/info/about',
  './pages/dashboard/Dashboard.jsx': '/app/dashboard',
  './pages/app/Application.jsx': '/app/requests/:id',
  './pages/dashboard/Profile.jsx': '/app/profile',
  './pages/app/Setup.jsx': '/app/setup',
  './pages/dashboard/RequestDocument.jsx': '/app/requests/new',
  './pages/info/Contact.jsx': '/contact',
  './pages/community/CivicTechCommunity.jsx': '/community/civictech',
  './pages/legal/PrivacyPolicy.jsx': '/legal/privacy',
  './pages/legal/TermsOfUse.jsx': '/legal/terms',
  './pages/services/EmergencyHotlines.jsx': '/services/hotlines',
  './pages/services/OfficeDetail.jsx': '/services/offices/:slug',
  './pages/services/Barangays.jsx': '/barangays',
  './pages/services/BarangayDetail.jsx': '/barangays/:id',
  './pages/services/BarangayOfficial.jsx': '/barangays/:id/official',
  './pages/services/BarangayOfficials.jsx': '/barangays/:id/officials',
  './pages/services/BarangayOfficialProfile.jsx': '/barangays/:id/officials/:officialSlug',
  './pages/data/Data.jsx': '/data',
  './pages/data/Datasets.jsx': '/data/datasets',
  './pages/data/DatasetDetail.jsx': '/data/datasets/:id',
  './pages/data/Barangays.jsx': '/data/barangays',
  './pages/data/BarangayStatistics.jsx': '/data/barangays/:slug',
  './pages/app/StaffSysparm.jsx': '/app/staff',
}

const nonPageFiles = new Set([
  './pages/app/AppPage.jsx',
  './pages/app/FulfillmentNoteModal.jsx',
  './pages/app/StaffRequestModal.jsx',
])

const toKebab = (str) => str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

export function pagePathForFile(file) {
  const normalizedFile = file.replaceAll('\\', '/')
  if (routeOverrides[normalizedFile]) return routeOverrides[normalizedFile]
  const [, folder, name] = normalizedFile.match(/^\.\/pages\/([^/]+)\/([^/]+)\.jsx$/) || []
  if (!folder || !name) return null
  const kebab = toKebab(name)
  return folder === 'home' ? '/' : kebab === folder ? `/${folder}` : `/${folder}/${kebab}`
}

export function buildPageRouteManifest(files) {
  const routes = files
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file.startsWith('./pages/') && file.endsWith('.jsx') && !nonPageFiles.has(file))
    .map((file) => ({ file, path: pagePathForFile(file) }))
    .filter((route) => route.path)

  const paths = new Set()
  for (const route of routes) {
    if (paths.has(route.path)) throw new Error(`Duplicate page route: ${route.path}`)
    paths.add(route.path)
  }
  return routes
}

export function getProtectedRouteState({ user, requiredRole }) {
  if (!user) return 'unauthenticated'
  const role = user.role
  if (requiredRole === 'admin') return ['admin', 'super_admin'].includes(role) ? 'allowed' : 'forbidden'
  if (requiredRole === 'staff') return ['staff', 'it_support', 'content_manager'].includes(role) ? 'allowed' : 'forbidden'
  if (requiredRole === 'citizen') return role === 'resident' ? 'allowed' : 'forbidden'
  return 'allowed'
}

export function resolveResourceResponse(status) {
  if (status >= 200 && status < 300) return 'found'
  if (status === 404) return 'not-found'
  if (status === 400) return 'bad-request'
  if (status === 401) return 'authentication-required'
  if (status === 403) return 'access-denied'
  if (status === 408) return 'timed-out'
  if (status === 409) return 'conflict'
  if (status === 410) return 'gone'
  if (status === 422) return 'invalid-request'
  if (status === 429) return 'rate-limited'
  if (status === 502) return 'bad-gateway'
  if (status === 503) return 'service-unavailable'
  if (status === 504) return 'gateway-timeout'
  if (status >= 500) return 'server-error'
  return 'error'
}

export const LEGACY_REDIRECTS = [
  ['/login', '/auth/login'],
  ['/dashboard', '/app'],
  ['/dashboard/profile', '/app/profile'],
  ['/dashboard/request-document', '/app/requests/new'],
  ['/account', '/app/profile'],
  ['/settings', '/app/settings'],
  ['/app/dashboard', '/app'],
  ['/app/staff-syparm', '/app/staff'],
  ['/hotlines', '/services/hotlines'],
  ['/info/accessibility', '/accessibility'],
  ['/info/officials', '/officials'],
  ['/services/barangays', '/barangays'],
]

