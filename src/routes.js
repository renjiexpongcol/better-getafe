import { lazy } from 'react'

// ============================================================
// Single source of truth for the app's routes.
// Every file in src/pages/<category>/<Name>.jsx is auto-discovered
// and becomes a lazy-loaded route, so the folder structure maps
// 1:1 to the URL structure. App.jsx, the Sitemap page, and the
// page titles all read from this module.
// ============================================================

// Discover all pages under src/pages/<category>/<Name>.jsx
const pageModules = import.meta.glob('./pages/**/*.jsx')

// Cleaner URL overrides for pages whose route should not match
// their kebab-cased filename.
const routeOverrides = {
  './pages/news/Article.jsx': '/news/:slug',
  './pages/info/OfficialProfile.jsx': '/info/official-profile',
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
  './pages/services/BarangayDetail.jsx': '/services/barangays/:id',
  './pages/services/BarangayOfficial.jsx': '/services/barangays/:id/official',
  './pages/services/BarangayOfficials.jsx': '/services/barangays/:id/officials',
  './pages/services/BarangayOfficialProfile.jsx': '/services/barangays/:id/officials/:officialSlug',
}

// Human-readable titles used by the sitemap and the document title.
export const routeTitles = {
  '/': 'Home',
  '/info/about': 'About Us',
  '/info/accessibility': 'Accessibility Statement',
  '/info/history': 'History, Seal & Hymn',
  '/info/officials': 'Municipal Officials',
  '/info/sitemap': 'Sitemap',
  '/contact': 'Contact Us',
  '/legal/privacy': 'Privacy Policy',
  '/legal/terms': 'Terms of Use',
  '/legal/cookies': 'Cookies & Cache',
  '/services': 'Municipal Services',
  '/services/directory': 'Services & Departments',
  '/services/barangays': 'Barangays of Getafe',
  '/services/hotlines': 'Emergency Hotlines',
  '/services/business-trade': 'Business & Trade',
  '/services/certificates': 'Certificates & IDs',
  '/services/barangay-clearance': 'Barangay Clearance Guide',
  '/services/education': 'Education & Scholarships',
  '/services/health': 'Health Services',
  '/news': 'News & Updates',
  '/tourism': 'Discover Getafe',
  '/events': 'Gallery of Events',
  '/weather': 'Weather Updates',
  '/community/civictech': 'Getafe CivicTech Community',
  '/dashboard': 'Citizen Dashboard',
  '/app/dashboard': 'Citizen Dashboard',
  '/app/profile': 'My Profile',
  '/app/setup': 'Set Up Account',
  '/app/services': 'Municipal Services',
  '/app/requests': 'My Applications',
  '/app/documents': 'My Documents',
  '/app/appointments': 'Appointments',
  '/app/payments': 'Payments',
  '/app/settings': 'Account Settings',
  '/app/help': 'Help & Support',
  '/app/requests/new': 'New Request',
  '/auth/login': 'Log In',
}

// Routes that must NOT appear in the public sitemap (e.g. auth,
// private/draft pages). Add any future hidden route here.
const HIDDEN_ROUTES = ['/auth/login', '/admin']

const toKebab = (str) => str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

// Build { path, Component, folder, name, title } for every page file.
export const pageRoutes = Object.entries(pageModules).filter(([file]) => !file.endsWith('/AppPage.jsx') && !file.endsWith('/Notifications.jsx') && !file.endsWith('/app/Settings.jsx') && !file.endsWith('/dashboard/Profile.jsx')).map(([file, loader]) => {
  const Component = lazy(loader)
  const [folder, name] = file.replace('./pages/', '').replace(/\.jsx$/, '').split('/')
  const kebab = toKebab(name)
  const path =
    routeOverrides[file] ||
    (folder === 'home' ? '/' : kebab === folder ? `/${folder}` : `/${folder}/${kebab}`)
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
const groupOrder = ['home', 'info', 'services', 'weather', 'dashboard', 'app', 'tourism', 'events', 'news', 'legal']
const groupLabels = {
  home: 'Home',
  info: 'Information',
  services: 'Services',
  weather: 'Weather',
  dashboard: 'Citizen Dashboard',
  app: 'Citizen Portal',
  news: 'News & Updates',
  tourism: 'Discover Getafe',
  events: 'Gallery of Events',
  legal: 'Legal',
}

// Sitemap: public pages plus resident portal entry points grouped by category.
const sitemapRoutes = pageRoutes.filter((r) => !r.path.includes(':') && (
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
