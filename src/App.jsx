import { Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
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
import { resolveModule } from './applicationModuleRegistry'

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
// Routing is defined in src/routes.js, which auto-discovers every
// file in src/pages/<category>/<Name>.jsx (via import.meta.glob)
// and builds lazy-loaded routes from the folder structure.
// Add a page by dropping a file into the right folder — no route
// registration required here.
// ============================================================

// Legacy aliases -> new grouped routes.
const redirects = [
  ['/login', '/auth/login'],
  ['/dashboard', '/app/dashboard'],
  ['/dashboard/profile', '/app/profile'],
  ['/dashboard/request-document', '/app/requests/new'],
  ['/account', '/app/profile'],
  ['/settings', '/app/settings'],
  ['/app/settings', '/app?sysparm_object_id=profile'],
  ['/app/profile', '/app?sysparm_object_id=profile'],
  ['/app/dashboard', '/app?sysparm_object_id=dashboard'],
  ['/app/requests', '/app?sysparm_object_id=requests'],
  ['/app/appointments', '/app?sysparm_object_id=appointments'],
  ['/app/documents', '/app?sysparm_object_id=documents'],
  ['/app/notifications', '/app?sysparm_object_id=notifications'],
  ['/app/services', '/app?sysparm_object_id=services'],
  ['/app/payments', '/app?sysparm_object_id=payments'],
  ['/app/help', '/app?sysparm_object_id=help'],
  ['/app/staff-syparm', '/app/staff?sysparm_object_id=dashboard'],
  ['/hotlines', '/services/hotlines'],
  ['/news/article', '/news'],
  ['/news/civil-registry', '/services/certificates'],
  ['/news/pandanon-island', '/tourism/pandanon'],
  ['/news/corte-paradise-resort', '/tourism/corte-paradise'],
  ['/news/handumon-marine-sanctuary', '/tourism/handumon'],
  ['/accessibility', '/info/accessibility'],
]
const legacyApplicationPaths = new Set(['/app/dashboard', '/app/requests', '/app/appointments', '/app/documents', '/app/notifications', '/app/services', '/app/payments', '/app/help'])

function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-label="Loading page">
      <span className="page-loader-spinner" />
    </div>
  )
}

function App() {
  return <PublicConfigProvider><AuthProvider><AppContent /></AuthProvider></PublicConfigProvider>
}

function RouteLayout({ children }) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  if ((pathname === '/app' || pathname.startsWith('/app/')) && pathname !== '/app/setup' && user?.setupRequired) return <Navigate to="/app/setup" replace />
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

function ProtectedRoute({ children, admin = false, citizen = false }) {
  const { user, loading, sessionUnavailable, validateSession } = useAuth()
  const location = useLocation()
  const [checkedKey, setCheckedKey] = useState(null)
  useEffect(() => {
    let active = true
    validateSession().then(() => { if (active) setCheckedKey(location.key) })
    return () => { active = false }
  }, [location.key, validateSession])
  // Only block the initial protected-page render. Revalidating the session on
  // navigation should not replace the whole page with a flash of loader UI.
  if (checkedKey === null) return <PageLoader />
  if (!user && sessionUnavailable) return <div className="page-loader" role="status" aria-live="polite">Restoring your secure session…</div>
  if (!user) return <Navigate to={`/auth/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (admin && !['admin', 'super_admin'].includes(user.role)) return <Navigate to={['staff', 'it_support', 'content_manager'].includes(user.role) ? '/app/staff?sysparm_object_id=dashboard' : '/'} replace />
  if (citizen && user.role !== 'resident') return <Navigate to={['admin', 'super_admin'].includes(user.role) ? '/admin' : '/app/staff?sysparm_object_id=dashboard'} replace />
  return children
}

function StaffRoute({ children }) {
  const { user } = useAuth()
  if (!['staff', 'it_support', 'content_manager'].includes(user?.role)) {
    return <Navigate to={user?.role === 'admin' || user?.role === 'super_admin' ? '/admin' : '/'} replace />
  }
  return children
}

function ModuleNotFound() {
  return <main className="page-not-found" role="alert"><h1>Module not found</h1><p>The requested application module is not available.</p></main>
}

function ModuleAccessDenied() {
  return <main className="page-not-found" role="alert"><h1>Access restricted</h1><p>Your account does not have permission to open this module. Ask an administrator to review your group membership.</p></main>
}

function LegacyRedirect({ to }) {
  const location = useLocation()
  const target = new URL(to, window.location.origin)
  const current = new URLSearchParams(location.search)
  current.forEach((value, key) => { if (!target.searchParams.has(key)) target.searchParams.set(key, value) })
  return <Navigate to={`${target.pathname}${target.search}`} replace />
}

function ApplicationModuleRoute({ shell }) {
  const { user } = useAuth()
  const location = useLocation()
  const [params] = useSearchParams()
  const objectId = params.get('sysparm_object_id') || 'dashboard'
  const module = resolveModule(shell, objectId)
  if (!params.has('sysparm_object_id')) {
    const next = new URLSearchParams(params)
    next.set('sysparm_object_id', objectId)
    return <Navigate to={`${location.pathname}?${next.toString()}`} replace />
  }
  if (!module) return <ModuleNotFound />
  if (shell !== 'app' && Array.isArray(user?.permissions) && !user.permissions.includes(module.permission)) return <ModuleAccessDenied />
  const routePath = objectId === 'requests' && params.get('sysparm_view') === 'new' ? '/app/requests/new' : params.get('sysparm_record_id') && objectId === 'requests' ? '/app/requests/:id' : module.legacyPath
  const route = pageRoutes.find(item => item.path === routePath)
  if (!route) return <ModuleNotFound />
  const Component = route.Component
  return <Component />
}

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const isAuthPage = location.pathname.startsWith('/auth') || location.pathname.startsWith('/admin')
  const isCitizenDashboard = location.pathname === '/app' || location.pathname.startsWith('/app/')
  const settings = usePublicConfig()
  const { user, loading, sessionUnavailable } = useAuth()
  useEffect(() => {
    if (!loading && !sessionUnavailable && isCitizenDashboard && !user) navigate('/auth/login', { replace: true })
  }, [loading, sessionUnavailable, isCitizenDashboard, user, navigate])
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
          <Routes>
            <Route path="/app" element={<ProtectedRoute citizen><ApplicationModuleRoute shell="app" /></ProtectedRoute>} />
            <Route path="/app/staff" element={<ProtectedRoute><StaffRoute><ApplicationModuleRoute shell="staff" /></StaffRoute></ProtectedRoute>} />
            <Route path="/services/barangays/:id" element={<BarangayDetailRoute />} />
            <Route path="/services/barangays/:id/official" element={<BarangayOfficialRoute />} />
            <Route path="/info/officials/:id" element={<OfficialProfileRoute />} />
            {pageRoutes.filter(({ path }) => path !== '/app/staff' && !legacyApplicationPaths.has(path)).map(({ path, Component }) => (
              <Route key={path} path={path} element={path.startsWith('/app/staff-syparm') ? <ProtectedRoute><StaffRoute><Component /></StaffRoute></ProtectedRoute> : path.startsWith('/app/') || path.startsWith('/admin') ? <ProtectedRoute admin={path.startsWith('/admin')} citizen={path.startsWith('/app/')}><Component /></ProtectedRoute> : <Component />} />
            ))}
            {redirects.map(([from, to]) => (
              <Route key={from} path={from} element={<LegacyRedirect to={to} />} />
            ))}
            <Route path="/app/staff-syparm/*" element={<Navigate to="/app/staff?sysparm_object_id=dashboard" replace />} />
            <Route path="/app/*" element={<ProtectedRoute citizen><Navigate to="/app?sysparm_object_id=dashboard" replace /></ProtectedRoute>} />
            <Route path="/admin/*" element={<ProtectedRoute admin><Navigate to="/admin" replace /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RouteLayout>
        {!isAuthPage && !isCitizenDashboard && <RelatedPages />}
        {!isAuthPage && !isCitizenDashboard && <BackToTop />}
        {!isAuthPage && !isCitizenDashboard && <Footer />}
        </>}
        {!loading && !user && location.pathname === '/' && <CookieCacheBanner />}
      </div>
  )
}

function OfficialProfileRoute() {
  const OfficialProfile = pageRoutes.find((route) => route.path === '/info/official-profile')?.Component
  return OfficialProfile ? <OfficialProfile /> : null
}

function BarangayDetailRoute() {
  const BarangayDetail = pageRoutes.find((route) => route.name === 'BarangayDetail')?.Component
  return BarangayDetail ? <BarangayDetail /> : null
}

function BarangayOfficialRoute() {
  const BarangayOfficial = pageRoutes.find((route) => route.name === 'BarangayOfficial')?.Component
  return BarangayOfficial ? <BarangayOfficial /> : null
}

export default App
