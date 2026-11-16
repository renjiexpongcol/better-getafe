import { lazy } from 'react'
import { buildPageRouteManifest } from './routeConfig'
import { registerAuthDestinationRoutes } from './authNavigation'

// ============================================================
// Single source of truth for the app's routes.
// Every file in src/pages/<category>/<Name>.jsx is auto-discovered
// and becomes a lazy-loaded route, so the folder structure maps
// 1:1 to the URL structure. App.jsx, the Sitemap page, and the
// page titles all read from this module.
// ============================================================

// Discover only the route modules owned by the current application surface.
// Keeping these globs explicit prevents a public build from pulling resident
// and admin page chunks into its asset graph while preserving the root build's
// all-surface rollback path.
const allPageModules = import.meta.glob('./pages/**/*.jsx')
const publicPageModules = import.meta.glob([
  './pages/auth/**/*.jsx',
  './pages/community/**/*.jsx',
  './pages/data/**/*.jsx',
  './pages/departments/**/*.jsx',
  './pages/discover/**/*.jsx',
  './pages/events/**/*.jsx',
  './pages/home/**/*.jsx',
  './pages/info/**/*.jsx',
  './pages/legal/**/*.jsx',
  './pages/news/**/*.jsx',
  './pages/search/**/*.jsx',
  './pages/services/**/*.jsx',
  './pages/tourism/**/*.jsx',
  './pages/weather/**/*.jsx',
])
const residentPageModules = import.meta.glob([
  './pages/app/Application.jsx',
  './pages/app/Appointments.jsx',
  './pages/app/Documents.jsx',
  './pages/app/Ebilling.jsx',
  './pages/app/Epayment.jsx',
  './pages/app/Erequest.jsx',
  './pages/app/Erequests.jsx',
  './pages/app/Eservice.jsx',
  './pages/app/Help.jsx',
  './pages/app/Notifications.jsx',
  './pages/app/Payments.jsx',
  './pages/app/Requests.jsx',
  './pages/app/Services.jsx',
  './pages/app/Settings.jsx',
  './pages/app/Setup.jsx',
  './pages/auth/**/*.jsx',
  './pages/dashboard/Dashboard.jsx',
  './pages/dashboard/Profile.jsx',
  './pages/dashboard/RequestDocument.jsx',
])
const adminPageModules = import.meta.glob([
  './pages/admin/**/*.jsx',
  './pages/auth/**/*.jsx',
  './pages/app/StaffSysparm.jsx',
])

const surface = import.meta.env.VITE_APP_SURFACE || 'all'
const pageModules = surface === 'public'
  ? publicPageModules
  : surface === 'resident'
    ? residentPageModules
    : surface === 'admin'
      ? adminPageModules
      : allPageModules

// A tab can keep an older entry bundle open after a new build removes its
// hashed route chunks. Recover once by reloading the current document so it
// receives the latest asset manifest instead of crashing on a stale import.
const CHUNK_RECOVERY_KEY = 'getafe-portal:chunk-recovery'
const loadPageModule = (loader) => async () => {
  try {
    const module = await loader()
    try { window.sessionStorage.removeItem(CHUNK_RECOVERY_KEY) } catch { /* storage may be unavailable */ }
    return module
  } catch (error) {
    try {
      if (!window.sessionStorage.getItem(CHUNK_RECOVERY_KEY)) {
        window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, '1')
        window.location.reload()
      }
    } catch { /* preserve the original import error if recovery is unavailable */ }
    throw error
  }
}

// Cleaner URL overrides for pages whose route should not match
// their kebab-cased filename.
// Human-readable titles used by the sitemap and the document title.
export const routeTitles = {
  '/': 'Home',
  '/search': 'Search the Getafe website',
  '/data/supabase-todos': 'Supabase Todos',
  '/info/about': 'About Us',
  '/accessibility': 'Accessibility Statement',
  '/info/history': 'History, Seal & Hymn',
  '/officials': 'Municipal Officials',
  '/officials/:id': 'Official Profile',
  '/info/sitemap': 'Sitemap',
  '/contact': 'Contact Us',
  '/legal/privacy': 'Privacy Policy',
  '/legal/terms': 'Terms of Use',
  '/legal/cookies': 'Cookies & Cache',
  '/departments': 'Departments & Offices',
  '/departments/:slug': 'Municipal Department',
  '/services': 'Municipal Services',
  '/services/barangay/:id': 'Barangay Services',
  '/services/e-services/:slug': 'Service Details',
  '/services/directory': 'Services & Departments',
  '/barangays': 'Barangays of Getafe',
  '/services/hotlines': 'Emergency Hotlines',
  '/services/business-trade': 'Business & Trade',
  '/services/certificates': 'Certificates & IDs',
  '/services/barangay-clearance': 'Barangay Clearance Guide',
  '/services/education': 'Education & Scholarships',
  '/services/health': 'Health Services',
  '/services/offices/:slug': 'Municipal Office',
  '/barangays/:id': 'Barangay Profile',
  '/barangays/:id/official': 'Barangay Official',
  '/barangays/:id/officials': 'Barangay Officials',
  '/barangays/:id/officials/:officialSlug': 'Barangay Official Profile',
  '/news': 'News & Updates',
  '/news/:slug': 'News Article',
  '/events/:slug': 'Event',
  '/tourism': 'Tourism in Getafe',
  '/discover': 'Discover Getafe',
  '/discover/:slug': 'Destination',
  '/events': 'Gallery of Events',
  '/weather': 'Weather Updates',
  '/community/civictech': 'Getafe CivicTech Community',
  '/dashboard': 'Citizen Dashboard',
  '/app/dashboard': 'Citizen Dashboard',
  '/app': 'Resident Portal',
  '/app/profile': 'My Profile',
  '/app/setup': 'Set Up Account',
  '/app/services': 'Municipal Services',
  '/app/services/:slug': 'Service Details',
  '/app/e-requests': 'Your Service Requests',
  '/app/e-requests/:id': 'Service Request Details',
  '/app/e-payment/:id': 'Payment Details',
  '/app/e-billing/:type': 'Billing and Payment Orders',
  '/app/requests/:id': 'Application Details',
  '/app/requests': 'My Applications',
  '/app/notifications': 'Notifications',
  '/app/documents': 'My Documents',
  '/app/appointments': 'Appointments',
  '/app/payments': 'Payments',
  '/app/settings': 'Account Settings',
  '/app/help': 'Help & Support',
  '/app/requests/new': 'New Request',
  '/app/staff': 'Staff workspace',
  '/app/staff/requests': 'Staff service requests',
  '/app/staff/e-requests': 'Staff Service Queue',
  '/app/staff/e-requests/:id': 'Staff Service Request Details',
  '/app/staff/requests/:id': 'Staff request details',
  '/app/staff/notifications': 'Staff notifications',
  '/app/staff/settings': 'Staff system parameters',
  '/app/staff/help': 'Staff help',
  '/admin': 'Admin Portal',
  '/admin/news': 'Admin · News & Events',
  '/admin/editor': 'Admin · Content Editor',
  '/admin/departments': 'Admin · Departments',
  '/admin/service-catalog': 'Admin · Service Catalog',
  '/admin/categories': 'Admin · Categories',
  '/admin/discover': 'Admin · Discover Getafe',
  '/admin/media': 'Admin · Media Library',
  '/admin/officials': 'Admin · Officials',
  '/admin/barangays': 'Admin · Barangays',
  '/admin/users': 'Admin · Users',
  '/admin/access': 'Admin · Access Management',
  '/admin/access/groups': 'Admin · Groups',
  '/admin/access/permissions': 'Admin · Permissions',
  '/admin/access/policies': 'Admin · Policies',
  '/admin/audit': 'Admin · Audit Log',
  '/admin/system/errors': 'Admin · Error Center',
  '/admin/system/integrations': 'Admin · Integrations',
  '/admin/privacy': 'Admin · Privacy Requests',
  '/admin/settings/:category': 'Admin · System Settings',
  '/auth/login': 'Log In',
  '/auth/forgot-password': 'Reset Password',
  '/data': 'Philippines Open Data & Statistics',
  '/data/datasets': 'Dataset Explorer',
  '/data/barangays': 'Barangay Statistics',
}

// Routes that must NOT appear in the public sitemap (e.g. auth,
// private/draft pages). Add any future hidden route here.
const HIDDEN_ROUTES = ['/auth/login', '/admin', '/app/profile', '/app/settings']

// Build { path, Component, folder, name, title } for every page file.
const routeManifest = buildPageRouteManifest(Object.keys(pageModules))
registerAuthDestinationRoutes(routeManifest)
export const pageRoutes = routeManifest.map(({ file, path }) => {
  const loader = pageModules[file]
  const Component = lazy(loadPageModule(loader))
  const [folder, name] = file.replace('./pages/', '').replace(/\.jsx$/, '').split('/')
  return {
    path,
    Component,
    folder,
    name,
    title: routeTitles[path] || name,
  }
})

// Public pages only (excludes hidden/private routes).
export const publicRoutes = pageRoutes.filter((r) => !r.path.includes(':') && !HIDDEN_ROUTES.includes(r.path) && !r.path.startsWith('/app/') && !r.path.startsWith('/auth/') && !r.path.startsWith('/admin'))

// Display labels + order for the sitemap groups.
const groupOrder = ['home', 'info', 'services', 'data', 'weather', 'dashboard', 'app', 'tourism', 'discover', 'events', 'news', 'legal']
const groupLabels = {
  home: 'Home',
  info: 'Information',
  services: 'Services',
  data: 'Data & Statistics',
  weather: 'Weather',
  dashboard: 'Citizen Dashboard',
  app: 'Citizen Portal',
  news: 'News & Updates',
  tourism: 'Tourism guides',
  discover: 'Discover Getafe',
  events: 'Gallery of Events',
  legal: 'Legal',
}

// Sitemap: public pages plus resident portal entry points grouped by category.
const sitemapRoutes = pageRoutes.filter((r) => !r.path.includes(':') && !HIDDEN_ROUTES.includes(r.path) && (
  publicRoutes.some((publicRoute) => publicRoute.path === r.path) || ['dashboard', 'app'].includes(r.folder)
))
export const sitemapGroups = groupOrder
  .map((folder) => ({
    folder,
    label: groupLabels[folder] || folder,
    links: sitemapRoutes
      .filter((r) => r.folder === folder)
      .map((r) => ({ path: r.path, title: r.title })),
  }))
  .filter((g) => g.links.length > 0)

export default pageRoutes
