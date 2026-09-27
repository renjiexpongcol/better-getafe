import { Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ResidentPreferencesProvider } from './context/ResidentPreferencesContext'
import Header from './components/Header'
import Footer from './components/Footer'
import RelatedPages from './components/RelatedPages'
import PageTitleManager from './components/PageTitleManager'
import { PublicConfigProvider } from './context/PublicConfig'
import { usePublicConfig } from './context/PublicConfig'
import { useAuth } from './context/AuthContext'
import MaintenancePage from './components/MaintenancePage'
import CookieCacheBanner from './components/CookieCacheBanner'
import BackToTop from './components/BackToTop'
import { pageRoutes } from './routes'
import { AccessDeniedPage, ErrorBoundaryPreview, ErrorPage, ErrorStatusPreview, NotFoundPage, ResourceNotFoundPreview, RouteErrorBoundary } from './components/RouteStatusPages'
import { getProtectedRouteState, LEGACY_REDIRECTS } from './routeConfig'
import { legacyAdminTarget, legacyAppTarget, legacyStaffTarget, normalizePathname, ownedSearch, ROUTES, settingsCategoryKey } from './routeRegistry'
import speechNarrationService from './services/speechNarrationService'

// ============================================================
// ScrollToTop: whenever the route changes, instantly jump back to
// the top of the page so navigation always shows the page header
// (fixes the browser retaining scroll position between routes).
// ============================================================
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

// ============================================================
// Route paths are built from the page manifest in src/routeConfig.js.
// App adds the authentication boundaries, legacy aliases, and 404 states.
// ============================================================

function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-label="Loading page">
      <span className="page-loader-spinner" />
    </div>
  )
}

function App() {
  return <PublicConfigProvider><AuthProvider><ResidentPreferencesProvider><AppContent /></ResidentPreferencesProvider></AuthProvider></PublicConfigProvider>
}

function RouteLayout({ children }) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  if ((pathname === '/app' || pathname.startsWith('/app/')) && pathname !== '/app/setup' && user?.role === 'resident' && user.setupRequired) return <Navigate to="/app/setup" replace />
  return <RouteErrorBoundary resetKey={pathname}><Suspense fallback={<PageLoader />}>{children}</Suspense></RouteErrorBoundary>
}

function ProtectedRoute({ children, admin = false, citizen = false, staff = false }) {
  const { user, sessionUnavailable, validateSession } = useAuth()
  const location = useLocation()
  const [checkedKey, setCheckedKey] = useState(null)
  useEffect(() => {
    let active = true
    validateSession().finally(() => { if (active) setCheckedKey(location.key) })
    return () => { active = false }
  }, [location.key, validateSession])
  if (checkedKey !== location.key) return <PageLoader />
  if (!user && sessionUnavailable) return <div className="page-loader" role="status" aria-live="polite">Restoring your secure session…</div>
  const requiredRole = admin ? 'admin' : staff ? 'staff' : citizen ? 'citizen' : null
  const access = getProtectedRouteState({ user, requiredRole })
  if (access === 'unauthenticated') return <Navigate to={`/auth/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (access === 'forbidden') {
    const dashboardTo = ['admin', 'super_admin'].includes(user?.role)
      ? '/admin'
      : ['staff', 'it_support', 'content_manager'].includes(user?.role)
        ? ROUTES.staff.root
        : user?.role === 'resident'
          ? ROUTES.app.root
          : '/'
    return <AccessDeniedPage dashboardTo={dashboardTo} />
  }
  return children
}

function LegacyRedirect({ to }) {
  const location = useLocation()
  const target = new URL(to, window.location.origin)
  return <Navigate to={`${target.pathname}${target.search || ownedSearch(target.pathname, location.search)}${target.hash || location.hash}`} replace />
}

function LegacyPatternRedirect({ build }) {
  const params = useParams()
  const location = useLocation()
  const target = build(params)
  return <Navigate to={`${target}${ownedSearch(target, location.search)}${location.hash}`} replace />
}

function CanonicalRoute({ scope, children }) {
  const location = useLocation()
  let legacyTarget = null
  const legacyParams = new URLSearchParams(location.search)
  if (scope === 'admin' && location.pathname === ROUTES.admin.root) {
    legacyTarget = legacyAdminTarget(location.search)
    if (!legacyTarget && (legacyParams.has('sysparm_object_id') || legacyParams.has('tab'))) legacyTarget = `/admin/${encodeURIComponent(legacyParams.get('sysparm_object_id') || legacyParams.get('tab') || 'invalid-module')}`
  }
  if (scope === 'app' && location.pathname === ROUTES.app.root) {
    legacyTarget = legacyAppTarget(location.search)
    if (!legacyTarget && legacyParams.has('sysparm_object_id')) legacyTarget = `/app/${encodeURIComponent(legacyParams.get('sysparm_object_id') || 'invalid-module')}`
  }
  if (scope === 'staff' && location.pathname === ROUTES.staff.root) {
    legacyTarget = legacyStaffTarget(location.search)
    if (!legacyTarget && legacyParams.has('sysparm_object_id')) legacyTarget = `/app/staff/${encodeURIComponent(legacyParams.get('sysparm_object_id') || 'invalid-module')}`
  }
  if (scope === 'admin' && location.pathname === ROUTES.admin.settings) {
    const requested = new URLSearchParams(location.search).get('category')
    const category = requested && (settingsCategoryKey(requested) || requested)
    legacyTarget = ROUTES.admin.setting(category || 'general')
  }
  if (legacyTarget) return <Navigate to={legacyTarget} replace />
  const canonicalSearch = ownedSearch(location.pathname, location.search)
  if (canonicalSearch !== location.search) return <Navigate to={`${location.pathname}${canonicalSearch}`} replace />
  return children
}

function AppContent() {
  const location = useLocation()
  const normalizedPathname = normalizePathname(location.pathname)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [browseOffline, setBrowseOffline] = useState(false)
  const isAuthPage = location.pathname.startsWith('/auth') || location.pathname.startsWith('/admin')
  const isCitizenDashboard = location.pathname === '/app' || location.pathname.startsWith('/app/')
  const settings = usePublicConfig()
  const { user, loading, sessionUnavailable } = useAuth()
  useEffect(() => {
    speechNarrationService.stop()
  }, [location.pathname])
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); setBrowseOffline(false) }
    const onOffline = () => { setIsOnline(false); setBrowseOffline(false) }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])
  useEffect(() => {
    const root = document.getElementById('root')
    const hideProtectedPage = () => {
      if (isCitizenDashboard || location.pathname.startsWith('/admin')) root.style.visibility = 'hidden'
    }
    const restoreGuard = event => {
      if (event.persisted) window.location.reload()
      else root.style.visibility = ''
    }
    window.addEventListener('pagehide', hideProtectedPage)
    window.addEventListener('pageshow', restoreGuard)
    return () => {
      window.removeEventListener('pagehide', hideProtectedPage)
      window.removeEventListener('pageshow', restoreGuard)
    }
  }, [isCitizenDashboard, location.pathname])
  if (normalizedPathname !== location.pathname) return <Navigate to={`${normalizedPathname}${location.search}${location.hash}`} replace />
  if (!settings.ready) return <div className="configuration-loader" aria-busy="true" />
  const maintenance = !isAuthPage && !loading && settings['maintenance.enabled'] === true && !(user && ['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user.role))

  return (
      <div className="page-shell" onContextMenu={event => { if (event.target instanceof HTMLImageElement) event.preventDefault(); }}>
        {maintenance && <MaintenancePage />}
        {!maintenance && <>
        <ScrollToTop />
        <PageTitleManager />
        {!isAuthPage && !isCitizenDashboard && <Header />}
        <RouteLayout>
        {!isOnline && !browseOffline ? <ErrorPage code="offline" secondaryAction={{ label: 'Continue browsing', onClick: () => setBrowseOffline(true) }} /> : <Routes>
            {import.meta.env.DEV && <Route path="/errors/resource/:type" element={<ResourceNotFoundPreview />} />}
            {import.meta.env.DEV && <Route path="/errors/boundary" element={<ErrorBoundaryPreview />} />}
            {import.meta.env.DEV && <Route path="/errors/:code" element={<ErrorStatusPreview />} />}
            <Route path="/errors" element={<Navigate to="/" replace />} />
            <Route path="/errors/*" element={<Navigate to="/" replace />} />
            {(() => {
              const Dashboard = pageRoutes.find(({ path }) => path === '/app/dashboard')?.Component
              const Staff = pageRoutes.find(({ path }) => path === '/app/staff')?.Component
              const Admin = pageRoutes.find(({ path }) => path === '/admin')?.Component
              return <>
                <Route path="/app" element={<ProtectedRoute citizen><CanonicalRoute scope="app">{Dashboard && <Dashboard />}</CanonicalRoute></ProtectedRoute>} />
                <Route path="/app/staff" element={<ProtectedRoute staff><CanonicalRoute scope="staff">{Staff && <Staff />}</CanonicalRoute></ProtectedRoute>} />
                <Route path="/app/staff/requests" element={<ProtectedRoute staff>{Staff && <Staff />}</ProtectedRoute>} />
                <Route path="/app/staff/requests/:id" element={<ProtectedRoute staff>{Staff && <Staff />}</ProtectedRoute>} />
                <Route path="/app/staff/notifications" element={<ProtectedRoute staff>{Staff && <Staff />}</ProtectedRoute>} />
                <Route path="/app/staff/settings" element={<ProtectedRoute staff>{Staff && <Staff />}</ProtectedRoute>} />
                <Route path="/app/staff/help" element={<ProtectedRoute staff>{Staff && <Staff />}</ProtectedRoute>} />
                <Route path="/admin/*" element={<ProtectedRoute admin><CanonicalRoute scope="admin">{Admin && <Admin />}</CanonicalRoute></ProtectedRoute>} />
              </>
            })()}
            {pageRoutes.filter(({ path }) => !['/admin', '/app/dashboard', '/app/staff'].includes(path)).map(({ path, Component }) => (
              <Route key={path} path={path} element={path.startsWith('/app/') ? <ProtectedRoute citizen><CanonicalRoute scope="app"><Component /></CanonicalRoute></ProtectedRoute> : <Component />} />
            ))}
            {LEGACY_REDIRECTS.map(([from, to]) => (
              <Route key={from} path={from} element={<LegacyRedirect to={to} />} />
            ))}
            <Route path="/info/officials/:id" element={<LegacyPatternRedirect build={({ id }) => `/officials/${encodeURIComponent(id)}`} />} />
            <Route path="/services/barangays/:id" element={<LegacyPatternRedirect build={({ id }) => `/barangays/${encodeURIComponent(id)}`} />} />
            <Route path="/services/barangays/:id/official" element={<LegacyPatternRedirect build={({ id }) => `/barangays/${encodeURIComponent(id)}/official`} />} />
            <Route path="/services/barangays/:id/officials" element={<LegacyPatternRedirect build={({ id }) => `/barangays/${encodeURIComponent(id)}/officials`} />} />
            <Route path="/services/barangays/:id/officials/:officialSlug" element={<LegacyPatternRedirect build={({ id, officialSlug }) => `/barangays/${encodeURIComponent(id)}/officials/${encodeURIComponent(officialSlug)}`} />} />
            <Route path="/app/staff/*" element={<ProtectedRoute staff><NotFoundPage /></ProtectedRoute>} />
            <Route path="/app/*" element={<ProtectedRoute citizen><NotFoundPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>}
        </RouteLayout>
        {!isAuthPage && !isCitizenDashboard && <RelatedPages />}
        {!isAuthPage && !isCitizenDashboard && <BackToTop />}
        {!isAuthPage && !isCitizenDashboard && <Footer />}
        </>}
        {!loading && !user && location.pathname === '/' && <CookieCacheBanner />}
      </div>
  )
}

export default App
