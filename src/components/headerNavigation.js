export const DEFAULT_PUBLIC_MENUS = [
  {
    key: 'services',
    label: 'Services',
    items: [
      { name: 'Service directory', url: '/services/directory', description: 'Browse municipal services and offices', icon: 'Building2' },
      { name: 'Certificates & IDs', url: '/services/certificates', description: 'Civil registry certificates and IDs', icon: 'FileCheck2' },
      { name: 'Business & trade', url: '/services/business-trade', description: 'Permits and business services', icon: 'WalletCards' },
      { name: 'Emergency hotlines', url: '/services/hotlines', description: 'Important local contact numbers', icon: 'Siren' },
      { name: 'Access your Digital National ID', url: 'https://national-id.gov.ph/', description: 'Access the PSA Digital National ID portal', icon: 'FileCheck2', category: 'national-id' },
      { name: 'Frequently Asked Questions', url: 'https://philsys.gov.ph/faq/', description: 'Read official PhilSys answers and guidance', icon: 'Info', category: 'national-id' },
      { name: 'Registration Centers', url: 'https://philsys.gov.ph/registration-center/', description: 'Find National ID registration information', icon: 'Map', category: 'national-id' },
      { name: 'Use Case Bulletin', url: 'https://philsys.gov.ph/use-cases/', description: 'Learn how the National ID can be used', icon: 'BookOpen', category: 'national-id' },
      { name: 'Philippine Digital National Identity Project', url: 'https://ppp.gov.ph/project_advisories/project-information-memorandum-philippine-digital-national-identity-pdni-project/', description: 'View the project information memorandum', icon: 'Landmark', category: 'national-id' },
    ],
  },
  {
    key: 'discover',
    label: 'Discover',
    items: [
      { name: 'Destinations', url: '/discover', description: 'Explore places around Getafe', icon: 'Compass' },
      { name: 'Tourism', url: '/tourism', description: 'Plan a visit to Getafe', icon: 'Map' },
      { name: 'Events & meetings', url: '/events', description: 'See upcoming municipal events', icon: 'CalendarDays' },
    ],
  },
  {
    key: 'municipality',
    label: 'Municipality',
    items: [
      { name: 'About Getafe', url: '/info/about', description: 'Learn about the Municipality', icon: 'Info' },
      { name: 'Municipal officials', url: '/officials', description: 'Meet elected officials and local leaders', icon: 'Users' },
      { name: 'Barangays', url: '/barangays', description: 'Explore Getafe’s barangays', icon: 'Map' },
      { name: 'Contact the Municipality', url: '/contact', description: 'Get in touch with the LGU', icon: 'Mail' },
    ],
  },
]

const ROUTE_GROUP = new Map([
  ['/accessibility', 'municipality'],
  ['/discover', 'discover'],
  ['/tourism', 'discover'],
  ['/events', 'discover'],
  ['/news', 'omit'], // News already has a direct top-level link.
  ['/services/hotlines', 'services'],
])

// Managed content can store escaped ampersands even in plain-text labels.
const navigationText = value => typeof value === 'string' ? value.replace(/&(?:amp|#0*38|#x0*26);/gi, '&') : value

function uniqueByUrl(items) {
  const seen = new Set()
  return items.filter(item => {
    if (!item || typeof item.name !== 'string' || typeof item.url !== 'string') return false
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  }).map(item => ({
    ...item,
    name: navigationText(item.name),
    description: navigationText(item.description),
  }))
}

function addForRoute(menus, item, fallbackGroup) {
  const group = ROUTE_GROUP.get(item.url) || fallbackGroup
  if (group !== 'omit') menus[group].push(item)
}

/** Merge audience/service menus and fold duplicate civic destinations into three clear groups. */
export function buildPublicHeaderMenus(configuredMenus = []) {
  const menus = Object.fromEntries(DEFAULT_PUBLIC_MENUS.map(menu => [menu.key, [...menu.items]]))
  const knownKeys = new Set(['services', 'business', 'residents', 'discover', 'municipality', 'information', 'info', 'explore'])
  const extras = []

  for (const configured of Array.isArray(configuredMenus) ? configuredMenus : []) {
    if (!configured || !Array.isArray(configured.items)) continue
    const key = configured.key
    if (['services', 'business', 'residents'].includes(key)) {
      for (const item of configured.items) addForRoute(menus, item, 'services')
    } else if (['discover', 'explore'].includes(key)) {
      for (const item of configured.items) addForRoute(menus, item, 'discover')
    } else if (['municipality', 'information', 'info'].includes(key)) {
      for (const item of configured.items) addForRoute(menus, item, 'municipality')
    } else if (!knownKeys.has(key)) {
      extras.push({ ...configured, label: navigationText(configured.label), items: uniqueByUrl(configured.items) })
    }
  }

  const canonical = DEFAULT_PUBLIC_MENUS.map(menu => ({ ...menu, items: uniqueByUrl(menus[menu.key]) }))
  return [...canonical, ...extras.filter(menu => menu.items.length)]
}

const SERVICE_MENU_SECTIONS = [
  { key: 'residents', label: 'Resident services' },
  { key: 'offices', label: 'Municipal offices' },
  { key: 'business', label: 'Business & payments' },
  { key: 'national-id', label: 'National ID' },
]

function serviceMenuSection(item) {
  if (item.category === 'national-id' || /national-id\.gov\.ph|philsys\.gov\.ph|national identity project/i.test(`${item.name} ${item.url}`)) return 'national-id'
  if (item.url.startsWith('/departments/')) return 'offices'
  if (/business|billing|payment|realty|water/i.test(`${item.name} ${item.url}`)) return 'business'
  return 'residents'
}

export function groupPublicHeaderMenuItems(menuKey, items = []) {
  if (menuKey !== 'services') return [{ key: 'all', label: '', items }]

  return SERVICE_MENU_SECTIONS
    .map(section => ({ ...section, items: items.filter(item => serviceMenuSection(item) === section.key) }))
    .filter(section => section.items.length > 0)
}

export function getPublicNationalIdItems(configuredMenus = []) {
  const services = buildPublicHeaderMenus(configuredMenus).find(menu => menu.key === 'services')
  return (services?.items || []).filter(item => serviceMenuSection(item) === 'national-id')
}
