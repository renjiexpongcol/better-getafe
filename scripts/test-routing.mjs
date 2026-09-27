import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { matchRoutes } from 'react-router-dom'
import { MODULE_REGISTRY, resolveModuleAccess } from '../src/applicationModuleRegistry.js'
import { buildPageRouteManifest, getProtectedRouteState, LEGACY_REDIRECTS, resolveResourceResponse } from '../src/routeConfig.js'
import { adminLocation, legacyAdminTarget, legacyAppTarget, legacyStaffTarget, normalizePathname, ownedSearch, ROUTES } from '../src/routeRegistry.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pagesRoot = path.join(root, 'src', 'pages')
const routeStatusSource = await readFile(path.join(root, 'src', 'components', 'RouteStatusPages.jsx'), 'utf8')
const serverSource = await readFile(path.join(root, 'server', 'index.js'), 'utf8')

async function collectPageFiles(directory = pagesRoot) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectPageFiles(entryPath)
    if (!entry.name.endsWith('.jsx')) return []
    return [`./pages/${path.relative(pagesRoot, entryPath).split(path.sep).join('/')}`]
  }))
  return nested.flat()
}

const manifest = buildPageRouteManifest(await collectPageFiles())
const adminSource = await readFile(path.join(root, 'src', 'pages', 'admin', 'Admin.jsx'), 'utf8')
const settingsSource = await readFile(path.join(root, 'src', 'components', 'AdminSettings.jsx'), 'utf8')
const settingsRoutesSource = await readFile(path.join(root, 'server', 'src', 'services', 'settingsRoutes.js'), 'utf8')
const appRoutes = [
  ...manifest.map(({ path: routePath }) => ({ path: routePath })),
  ...LEGACY_REDIRECTS.map(([from]) => ({ path: from })),
  { path: '/app' },
  { path: '/app/staff/requests/:id' },
  { path: '/app/staff/requests' },
  { path: '/app/staff/notifications' },
  { path: '/app/staff/settings' },
  { path: '/app/staff/help' },
  { path: '/app/*' },
  { path: '/admin/*' },
  { path: '*' },
]

function matchedPath(url, routes = appRoutes) {
  const pathname = new URL(url, 'http://getafe.test').pathname
  return matchRoutes(routes, pathname)?.at(-1)?.route.path || null
}

test('public pages and dynamic routes resolve to their registered page', () => {
  const cases = [
    ['/', '/'],
    ['/news', '/news'],
    ['/news/example-article', '/news/:slug'],
    ['/news/engineering', '/news/:slug'],
    ['/events', '/events'],
    ['/services', '/services'],
    ['/barangays', '/barangays'],
    ['/barangays/alumar', '/barangays/:id'],
    ['/barangays/alumar/official', '/barangays/:id/official'],
    ['/barangays/alumar/officials', '/barangays/:id/officials'],
    ['/barangays/alumar/officials/sample-official', '/barangays/:id/officials/:officialSlug'],
    ['/services/offices/health', '/services/offices/:slug'],
    ['/officials', '/officials'],
    ['/officials/municipal-mayor', '/officials/:id'],
    ['/services/health', '/services/health'],
    ['/info/about', '/info/about'],
    ['/contact', '/contact'],
    ['/data', '/data'],
    ['/data/datasets/example-dataset', '/data/datasets/:id'],
    ['/accessibility', '/accessibility'],
  ]
  for (const [url, expected] of cases) assert.equal(matchedPath(url), expected, url)
})

test('resident, staff, and admin canonical paths are registered', () => {
  assert.equal(matchedPath('/app'), '/app')
  assert.equal(matchedPath('/app/requests'), '/app/requests')
  assert.equal(matchedPath('/app/staff'), '/app/staff')
  assert.equal(matchedPath('/app/staff/requests'), '/app/staff/requests')
  assert.equal(matchedPath('/app/staff/requests/request-123'), '/app/staff/requests/:id')
  assert.equal(matchedPath('/admin'), '/admin')
  assert.equal(matchedPath('/admin/settings/database'), '/admin/*')
  assert.equal(matchedPath('/admin/discover'), '/admin/*')
  assert.equal(matchedPath('/admin/media'), '/admin/*')
  assert.equal(manifest.some(route => route.path === '/app/profile'), true)
  assert.equal(manifest.some(route => route.path === '/app/settings'), true)
  assert.equal(matchedPath('/app/requests/new'), '/app/requests/new')
  assert.equal(matchedPath('/app/requests/reference-123'), '/app/requests/:id')
  assert.equal(matchedPath('/app/staff-syparm'), '/app/staff-syparm')
  assert.equal(matchedPath('/app/staff-syparm/unrecognized'), '/app/*')
})

test('every Settings category has a canonical route and route-derived active state', () => {
  const categories = [
    ['general', 'general'],
    ['database', 'database'],
    ['portal-database', 'portalDatabase'],
    ['google-cloud', 'google'],
    ['storage', 'storage'],
    ['authentication', 'authentication'],
    ['email', 'email'],
    ['security', 'security'],
    ['notifications', 'notifications'],
    ['integrations', 'integrations'],
    ['weather', 'weather'],
    ['public-data', 'publicData'],
    ['feature-flags', 'features'],
    ['maintenance', 'maintenance'],
    ['legal-policies', 'legal'],
    ['advanced', 'advanced'],
    ['system-status', 'status'],
    ['audit-history', 'history'],
  ]
  for (const [slug, key] of categories) {
    assert.equal(ROUTES.admin.setting(key), `/admin/settings/${slug}`)
    assert.deepEqual(adminLocation(`/admin/settings/${slug}`), { module: 'settings', category: key })
  }
  assert.match(settingsSource, /navigate\(ROUTES\.admin\.setting\(next\)\)/)
  assert.match(adminSource, /adminLocation\(location\.pathname\)/)
  assert.doesNotMatch(settingsSource, /window\.location\.(?:href|assign|replace|reload)/)
})

test('Settings category reads and writes are scoped and secrets remain masked', () => {
  assert.match(settingsRoutesSource, /app\.get\('\/api\/admin\/settings\/:category', permission\('settings\.view'\)/)
  assert.match(settingsRoutesSource, /body\.values = Object\.fromEntries\(Object\.entries\(body\.values\)/)
  assert.match(settingsRoutesSource, /app\.put\('\/api\/admin\/settings\/:category', save\)/)
  assert.match(settingsRoutesSource, /const snapshot = user => \(\{ \.\.\.config\.snapshot\(\)/)
  assert.match(settingsSource, /request\(`\/\$\{activeTab\}`.*method: 'PUT'/)
  assert.match(settingsSource, /definition\.secret \? <SecretInput/)
})

test('legacy module URLs migrate to one canonical pathname and discard unrelated state', () => {
  assert.equal(legacyAdminTarget('?sysparm_object_id=discover&category=database'), ROUTES.admin.discover)
  assert.equal(legacyAdminTarget('?category=database&sysparm_object_id=system-settings'), '/admin/settings/database')
  assert.equal(legacyAdminTarget('?sysparm_object_id=media-library'), ROUTES.admin.media)
  assert.equal(legacyAdminTarget('?sysparm_object_id=media'), ROUTES.admin.media)
  assert.equal(legacyAppTarget('?sysparm_object_id=requests&sysparm_record_id=abc%20123&submitted=1'), '/app/requests/abc%20123?submitted=1')
  assert.equal(legacyStaffTarget('?sysparm_object_id=request-management'), ROUTES.staff.requests)
})

test('route ownership removes unsupported query parameters and normalizes path garbage', () => {
  assert.equal(ownedSearch('/admin/discover', '?category=database&search=old'), '')
  assert.equal(ownedSearch('/admin/media', '?category=database&search=beach&page=2&sort=newest'), '?search=beach&page=2&sort=newest')
  assert.equal(ownedSearch('/admin/settings/database', '?category=database&config=primary-database'), '?config=primary-database')
  assert.equal(normalizePathname('/admin//settings//database/'), '/admin/settings/database')
  assert.deepEqual(adminLocation('/admin/settings/portal-database'), { module: 'settings', category: 'portalDatabase' })
  assert.equal(adminLocation('/admin/settings/random-garbage'), null)
})

test('unknown paths use the final 404 route and unknown admin modules remain module errors', () => {
  assert.equal(matchedPath('/not-a-real-page'), '*')
  assert.equal(matchedPath('/admin/a-real-invalid-path'), '/admin/*')
  assert.ok(routeStatusSource.includes("title: 'Page not found'"))
  assert.ok(routeStatusSource.includes("The page you're looking for may have been moved, removed, or the address may be incorrect."))
  assert.ok(routeStatusSource.includes("label: 'Back to Home'"))
  assert.ok(routeStatusSource.includes("label: 'Go Back'"))
  assert.ok(routeStatusSource.includes('<ErrorPage code="404" />'))
  assert.equal(resolveModuleAccess('admin', 'not-a-module', { role: 'admin', permissions: [] }).state, 'not-found')
  assert.equal(resolveModuleAccess('admin', 'system-settings', { role: 'admin', permissions: ['system.settings.manage'] }).state, 'allowed')
  assert.equal(resolveModuleAccess('admin', 'system-settings', { role: 'admin', permissions: [] }).state, 'forbidden')
  assert.equal(MODULE_REGISTRY.admin['system-settings'].permission, 'system.settings.manage')
})

test('dynamic resources distinguish missing records, request limits, and service failures', () => {
  assert.equal(matchedPath('/news/missing-article-slug'), '/news/:slug')
  assert.equal(matchedPath('/events/missing-event-slug'), '/events/:slug')
  assert.equal(resolveResourceResponse(200), 'found')
  assert.equal(resolveResourceResponse(404), 'not-found')
  assert.equal(resolveResourceResponse(400), 'bad-request')
  assert.equal(resolveResourceResponse(401), 'authentication-required')
  assert.equal(resolveResourceResponse(403), 'access-denied')
  assert.equal(resolveResourceResponse(408), 'timed-out')
  assert.equal(resolveResourceResponse(409), 'conflict')
  assert.equal(resolveResourceResponse(410), 'gone')
  assert.equal(resolveResourceResponse(422), 'invalid-request')
  assert.equal(resolveResourceResponse(429), 'rate-limited')
  assert.equal(resolveResourceResponse(500), 'server-error')
  assert.equal(resolveResourceResponse(502), 'bad-gateway')
  assert.equal(resolveResourceResponse(503), 'service-unavailable')
  assert.equal(resolveResourceResponse(504), 'gateway-timeout')
})

test('protected route decisions distinguish sign-in from insufficient access', () => {
  assert.equal(getProtectedRouteState({ user: null, requiredRole: 'citizen' }), 'unauthenticated')
  assert.equal(getProtectedRouteState({ user: { role: 'resident' }, requiredRole: 'citizen' }), 'allowed')
  assert.equal(getProtectedRouteState({ user: { role: 'resident' }, requiredRole: 'admin' }), 'forbidden')
  assert.equal(getProtectedRouteState({ user: { role: 'staff' }, requiredRole: 'citizen' }), 'forbidden')
  assert.equal(getProtectedRouteState({ user: { role: 'staff' }, requiredRole: 'staff' }), 'allowed')
})

test('production fallback preserves API and asset 404s before serving the SPA', () => {
  const apiFallback = serverSource.indexOf("app.use('/api'")
  const assetStatic = serverSource.indexOf("app.use('/assets'")
  const spaFallback = serverSource.indexOf("res.sendFile(path.join(distDirectory, 'index.html'))")
  assert.ok(apiFallback >= 0)
  assert.ok(assetStatic > apiFallback)
  assert.ok(spaFallback > assetStatic)
  assert.ok(serverSource.includes("if (path.extname(req.path)) return res.status(404)"))
  assert.ok(serverSource.includes("if (!['GET', 'HEAD'].includes(req.method) || !req.accepts('html'))"))
})

test('static internal navigation targets point to registered routes or server files', async () => {
  const files = []
  async function collectSource(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) await collectSource(entryPath)
      else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(entryPath)
    }
  }
  await collectSource(path.join(root, 'src'))
  const routeIndex = [...manifest.map(route => ({ path: route.path })), ...LEGACY_REDIRECTS.map(([from]) => ({ path: from })), { path: '/app' }]
  const brokenTargets = []
  const targetPattern = /\b(?:to|href)\s*=\s*["'](\/[^"']*)["']/g

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(targetPattern)) {
      const target = match[1]
      const pathname = new URL(target, 'http://getafe.test').pathname
      if (path.extname(pathname)) continue
      if (!matchRoutes(routeIndex, pathname)) brokenTargets.push(`${path.relative(root, file)} -> ${target}`)
    }
  }
  assert.deepEqual(brokenTargets, [])
})
