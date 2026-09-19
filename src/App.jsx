import { Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
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
  ['/app/settings', '/app/dashboard'],
  ['/app/profile', '/app/dashboard?profile=1'],
  ['/hotlines', '/services/hotlines'],
  ['/news/article', '/news'],
  ['/news/civil-registry', '/services/certificates'],
  ['/news/pandanon-island', '/tourism/pandanon'],
  ['/news/corte-paradise-resort', '/tourism/corte-paradise'],
  ['/news/handumon-marine-sanctuary', '/tourism/handumon'],
  ['/accessibility', '/info/accessibility'],
]

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
  if (pathname.startsWith('/app/') && pathname !== '/app/setup' && user?.setupRequired) return <Navigate to="/app/setup" replace />
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

function ProtectedRoute({ children, admin = false }) {
  const { user, loading, validateSession } = useAuth()
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
  if (!user) return <Navigate to={`/auth/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (admin && !['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user.role)) return <Navigate to="/" replace />
  return children
}

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const isAuthPage = location.pathname.startsWith('/auth') || location.pathname.startsWith('/admin')
  const isCitizenDashboard = location.pathname === '/app' || location.pathname.startsWith('/app/')
  const settings = usePublicConfig()
  const { user, loading } = useAuth()
  useEffect(() => {
    if (!loading && isCitizenDashboard && !user) navigate('/auth/login', { replace: true })
  }, [loading, isCitizenDashboard, user, navigate])
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
  const maintenance = !isAuthPage && !loading && settings['maintenance.enabled'] === true && !(user && ['admin', 'super_admin'].includes(user.role))

  return (
      <div className="page-shell" onContextMenu={event => { if (event.target instanceof HTMLImageElement) event.preventDefault(); }}>
        {maintenance && <MaintenancePage />}
        {!maintenance && <>
        <ScrollToTop />
        <PageTitleManager />
        {!isAuthPage && !isCitizenDashboard && <Header />}
        <RouteLayout>
          <Routes>
            <Route path="/services/barangays/:id" element={<BarangayDetailRoute />} />
            <Route path="/services/barangays/:id/official" element={<BarangayOfficialRoute />} />
            <Route path="/info/officials/:id" element={<OfficialProfileRoute />} />
            {pageRoutes.map(({ path, Component }) => (
              <Route key={path} path={path} element={path.startsWith('/app/') || path.startsWith('/admin') ? <ProtectedRoute admin={path.startsWith('/admin')}><Component /></ProtectedRoute> : <Component />} />
            ))}
            {redirects.map(([from, to]) => (
              <Route key={from} path={from} element={<Navigate to={to} replace />} />
            ))}
            <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
            <Route path="/app/*" element={<ProtectedRoute><Navigate to="/app/dashboard" replace /></ProtectedRoute>} />
            <Route path="/admin/*" element={<ProtectedRoute admin><Navigate to="/admin" replace /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RouteLayout>
        {!isAuthPage && !isCitizenDashboard && <RelatedPages />}
        {!isAuthPage && <BackToTop />}
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
