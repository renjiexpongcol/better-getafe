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
  './pages/info/AboutUs.jsx': '/info/about',
  './pages/info/Contact.jsx': '/contact',
  './pages/legal/PrivacyPolicy.jsx': '/legal/privacy',
  './pages/legal/TermsOfUse.jsx': '/legal/terms',
  './pages/services/EmergencyHotlines.jsx': '/services/hotlines',
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
  '/services': 'Municipal Services',
  '/services/barangays': 'Barangays of Getafe',
  '/services/hotlines': 'Emergency Hotlines',
  '/services/business-trade': 'Business & Trade',
  '/services/certificates': 'Certificates & IDs',
  '/services/education': 'Education & Scholarships',
  '/services/health': 'Health Services',
  '/news': 'News & Updates',
  '/auth/login': 'Log In',
}

// Routes that must NOT appear in the public sitemap (e.g. auth,
// private/draft pages). Add any future hidden route here.
const HIDDEN_ROUTES = ['/auth/login']

const toKebab = (str) => str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

// Build { path, Component, folder, name, title } for every page file.
export const pageRoutes = Object.entries(pageModules).map(([file, loader]) => {
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
export const publicRoutes = pageRoutes.filter((r) => !HIDDEN_ROUTES.includes(r.path))

// Display labels + order for the sitemap groups.
const groupOrder = ['home', 'info', 'services', 'news', 'legal']
const groupLabels = {
  home: 'Home',
  info: 'Information',
  services: 'Services',
  news: 'News & Updates',
  legal: 'Legal',
}

// Sitemap: public pages grouped by category (folder), ready to render.
export const sitemapGroups = groupOrder
  .map((folder) => ({
    folder,
    label: groupLabels[folder] || folder,
    links: publicRoutes
      .filter((r) => r.folder === folder)
      .map((r) => ({ path: r.path, title: r.title })),
  }))
  .filter((g) => g.links.length > 0)

export default pageRoutes
