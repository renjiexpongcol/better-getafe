import { focusContentTarget } from './services/focusManagement'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useParams, matchPath } from 'react-router-dom'
import { RouteActivityProvider, useRouteActivity } from './context/RouteActivity'
import { AuthProvider } from './context/AuthContext'
import { ResidentPreferencesProvider } from './context/ResidentPreferencesContext'
const Header = lazy(() => import('./components/Header'))
const Footer = lazy(() => import('./components/Footer'))
const ResidentAiAssistant = lazy(() => import('./components/ResidentAiAssistant'))
import PageTitleManager from './components/PageTitleManager'
import { PublicConfigProvider } from './context/PublicConfig'
import { usePublicConfig } from './context/PublicConfig'
import { useAuth } from './context/AuthContext'
import CookieCacheBanner from './components/CookieCacheBanner'
import BackToTop from './components/BackToTop'
import { pageRoutes } from './routes'
import { AccessDeniedPage, ErrorBoundaryPreview, ErrorPage, ErrorStatusPreview, NotFoundPage, ResourceNotFoundPreview, RouteErrorBoundary } from './components/RouteStatusPages'
import { getProtectedRouteState, LEGACY_REDIRECTS } from './routeConfig'
import { legacyAdminTarget, legacyAppTarget, legacyStaffTarget, normalizePathname, ownedSearch, ROUTES, canonicalSettingsTarget } from './routeRegistry'
import speechNarrationService from './services/speechNarrationService'
import { isAuthenticatedSurface } from './services/securitySurfaces'
import { loginDestination, setPendingReturnUrl } from './authNavigation'
import StartupScreen from './components/StartupScreen'
import { surfaceAllowsPath } from './surfacePolicy'
import { trackPublicPageView, observeNavigationPlacements } from './services/websiteAnalytics'

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
  const { pathname } = useLocation()
  const known = pageRoutes.some(route => matchPath(route.path, pathname)) || LEGACY_REDIRECTS.some(([path]) => matchPath(path, pathname)) || ['/auth/callback', '/auth/callback/'].includes(pathname) || /^\/(app|admin)(\/|$)/.test(pathname)
  const needsPublicConfig = known && !pathname.startsWith('/errors') && !pathname.startsWith('/admin')
  return <RouteActivityProvider><PublicConfigProvider enabled={needsPublicConfig}>{isAuthenticatedSurface(pathname) && known
    ? <AuthProvider><AuthenticatedSurface /></AuthProvider>
    : <AppContent />}</PublicConfigProvider></RouteActivityProvider>
}

function AuthenticatedSurface() {
  const auth = useAuth()
  const { pathname } = useLocation()
  const content = <AppContent auth={auth} />
  const residentPage = pathname === '/app' || pageRoutes.some(route => route.path.startsWith('/app/') && !route.path.startsWith('/app/staff') && matchPath(route.path, pathname))
  return auth.user?.role === 'resident' && residentPage && !pathname.startsWith('/app/staff')
    ? <ResidentPreferencesProvider>{content}</ResidentPreferencesProvider>
    : content
}

function RouteLayout({ children }) {
  const { pathname } = useLocation()
  return <RouteErrorBoundary resetKey={pathname}><Suspense fallback={<PageLoader />}>{children}</Suspense></RouteErrorBoundary>
}

function SetupRedirect({ intended }) {
  useEffect(() => { setPendingReturnUrl(intended) }, [intended])
  return <Navigate to="/app/setup" replace />
}

function GoogleOAuthCallbackRedirect() {
  useEffect(() => {
    // Google returns to the browser callback. Keep this bridge same-origin so
    // the Vite /api proxy forwards the code and preserves the API state cookie.
    window.location.replace(`/api/auth/google/callback${window.location.search}`)
  }, [])
  return <PageLoader />
}

function ProtectedRoute({ children, admin = false, citizen = false, staff = false }) {
  const { user, loading, sessionUnavailable, signedOut } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
  if (!user && sessionUnavailable) return <div className="page-loader" role="status" aria-live="polite">Restoring your secure session…</div>
  const requiredRole = admin ? 'admin' : staff ? 'staff' : citizen ? 'citizen' : null
  const access = getProtectedRouteState({ user, requiredRole })
  if (access === 'unauthenticated') return <Navigate to={signedOut ? ROUTES.auth.login : loginDestination(location.pathname + location.search + location.hash)} replace />
  if (access === 'forbidden') {
    return <AccessDeniedPage />
  }
  if (citizen && location.pathname !== '/app/setup' && user.setupRequired) return <SetupRedirect intended={location.pathname + location.search + location.hash} />
  return children
}

function AppEntry({ children }) {
  const { user } = useAuth()
  if (!user) return <ProtectedRoute citizen>{children}</ProtectedRoute>
  if (['admin', 'super_admin'].includes(user.role)) return <Navigate to="/admin" replace />
  if (['staff', 'it_support', 'content_manager'].includes(user.role)) return <Navigate to={ROUTES.staff.root} replace />
  return <ProtectedRoute citizen>{children}</ProtectedRoute>
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
    // Keep the settings landing page stable. Legacy category query links still
    // resolve to their direct category route, but ordinary clicks stay in-page.
    if (legacyParams.has('category')) {
      legacyTarget = canonicalSettingsTarget(location.search, location.hash)
      if (!legacyTarget) return <NotFoundPage />
    }
  }
  if (legacyTarget) return <Navigate to={legacyTarget} replace />
  // Preserve the complete URL selected by the authenticated destination
  // resolver. Query ownership still cleans unrelated ordinary navigation.
  if (location.state?.authDestination === location.pathname + location.search + location.hash) return children
  const canonicalSearch = ownedSearch(location.pathname, location.search)
  if (canonicalSearch !== location.search) return <Navigate to={`${location.pathname}${canonicalSearch}${location.hash}`} replace />
  return children
}

function AppContent({ auth = { user: null, loading: false } }) {
  const activity = useRouteActivity()
  const location = useLocation()
  const normalizedPathname = normalizePathname(location.pathname)
  const surface = import.meta.env.VITE_APP_SURFACE || 'all'
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const analyticsRouteRef = useRef({ pathname: null, visit: 0 })
  const [browseOffline, setBrowseOffline] = useState(false)
  const isAuthPage = location.pathname.startsWith('/auth') || location.pathname.startsWith('/admin')
  const isCitizenDashboard = location.pathname === '/app' || location.pathname.startsWith('/app/')
  const isPublicPage = !isAuthPage && !isCitizenDashboard
  const settings = usePublicConfig()
  const { user, loading } = auth
  const appSignIn = isCitizenDashboard && !loading && !user
  const maintenance = !isAuthPage && !appSignIn && !loading && settings['maintenance.enabled'] === true && !(user && ['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user.role))
  useEffect(() => {
    if (isPublicPage) import('./public-pages.css')
  }, [isPublicPage])
  useEffect(() => {
    speechNarrationService.stop()
  }, [location.pathname])
  useEffect(() => {
    if (!settings.ready || !isPublicPage || maintenance || !pageRoutes.length || !surfaceAllowsPath(surface, location.pathname)) return
    if (analyticsRouteRef.current.pathname === location.pathname) return
    const route = pageRoutes.find(candidate => matchPath({ path: candidate.path, end: true }, location.pathname))
    if (!route || /^\/(?:admin|auth|app|staff)(?:\/|$)/i.test(route.path)) return
    if (route.path === '/newsletter/subscribe/:token' || route.path === '/newsletter/unsubscribe/:token') return
    analyticsRouteRef.current = { pathname: location.pathname, visit: analyticsRouteRef.current.visit + 1 }
    trackPublicPageView(route.path.toLocaleLowerCase('en-US'), analyticsRouteRef.current.visit)
  }, [isPublicPage, maintenance, location.pathname, settings.ready, surface])
  useEffect(() => {
    if (!settings.ready || !isPublicPage || maintenance || !surfaceAllowsPath(surface, location.pathname)) return undefined
    return observeNavigationPlacements()
  }, [isPublicPage, maintenance, location.pathname, settings.ready, settings['analytics.collectionEnabled'], surface])
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
  if (!surfaceAllowsPath(surface, location.pathname)) return <NotFoundPage />
  if (normalizedPathname !== location.pathname) return <Navigate to={`${normalizedPathname}${location.search}${location.hash}`} replace />
  if (!settings.ready) return <StartupScreen setup={location.pathname === '/app/setup'} />
  if (settings.unavailable && (maintenance || isAuthPage || isCitizenDashboard)) return <ErrorPage code="503" title="Unable to connect to the portal" message="The portal could not load its settings. Please try again." primaryAction={{ label: 'Try again', onClick: () => window.dispatchEvent(new Event('configuration-changed')) }} />

  return (
      <div className="page-shell" onContextMenu={event => { if (event.target instanceof HTMLImageElement) event.preventDefault(); }}>
        {maintenance && <ErrorPage code="503" title="Municipality of Getafe is temporarily unavailable" message="The portal is undergoing maintenance. Please try again later." showContact={false} />}
        {!maintenance && <>
        <ScrollToTop />
        <PageTitleManager />
        {!isAuthPage && !isCitizenDashboard && <a className="public-skip-link" href="#main-content" onClick={event => { const main = document.querySelector('main'); if (!main) return; event.preventDefault(); focusContentTarget(main); main.scrollIntoView({ behavior:'instant', block:'start' }); }}>Skip to main content</a>}
        {isPublicPage && <Suspense fallback={null}><Header featuresEnabled={isOnline && !location.pathname.startsWith('/errors') && pageRoutes.some(route => matchPath(route.path, location.pathname))} /></Suspense>}
        <RouteLayout>
        {!isOnline && !browseOffline ? <ErrorPage code="offline" secondaryAction={{ label: 'Continue browsing', onClick: () => setBrowseOffline(true) }} /> : <Routes>
            {import.meta.env.DEV && <Route path="/errors/resource/:type" element={<ResourceNotFoundPreview />} />}
            {import.meta.env.DEV && <Route path="/errors/boundary" element={<ErrorBoundaryPreview />} />}
            {import.meta.env.DEV && <Route path="/errors/:code" element={<ErrorStatusPreview />} />}
            <Route path="/auth/callback" element={<GoogleOAuthCallbackRedirect />} />
            <Route path="/errors" element={<Navigate to="/" replace />} />
            <Route path="/errors/*" element={<Navigate to="/" replace />} />
            {(() => {
              const Dashboard = pageRoutes.find(({ path }) => path === '/app/dashboard')?.Component
              const Staff = pageRoutes.find(({ path }) => path === '/app/staff')?.Component
              const Admin = pageRoutes.find(({ path }) => path === '/admin')?.Component
              return <>
                <Route path="/app" element={<ProtectedRoute><AppEntry><CanonicalRoute scope="app">{Dashboard && <Dashboard />}</CanonicalRoute></AppEntry></ProtectedRoute>} />
                <Route path="/app/staff" element={<ProtectedRoute staff><CanonicalRoute scope="staff">{Staff && <Staff />}</CanonicalRoute></ProtectedRoute>} />
                <Route path="/app/staff/requests" element={<ProtectedRoute staff>{Staff && <Staff />}</ProtectedRoute>} />
                <Route path="/app/staff/profile" element={<ProtectedRoute staff>{Staff && <Staff />}</ProtectedRoute>} />
                <Route path="/app/staff/security" element={<ProtectedRoute staff>{Staff && <Staff />}</ProtectedRoute>} />
                <Route path="/app/staff/e-requests" element={<ProtectedRoute staff>{Staff && <Staff />}</ProtectedRoute>} />
                <Route path="/app/staff/e-requests/:id" element={<ProtectedRoute staff>{Staff && <Staff />}</ProtectedRoute>} />
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
        {!isAuthPage && !isCitizenDashboard && <BackToTop />}
        {isPublicPage && !maintenance && !location.pathname.startsWith('/errors') && <Suspense fallback={null}><ResidentAiAssistant /></Suspense>}
        {isPublicPage && <Suspense fallback={null}><Footer /></Suspense>}
        </>}
        {isPublicPage && !maintenance && !location.pathname.startsWith('/errors') && <CookieCacheBanner />}
      </div>
  )
}

export default App
