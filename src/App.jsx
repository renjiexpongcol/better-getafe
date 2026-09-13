import { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Header from './components/Header'
import Footer from './components/Footer'
import RelatedPages from './components/RelatedPages'
import PageTitleManager from './components/PageTitleManager'
import BackToTop from './components/BackToTop'
import { PublicConfigProvider } from './context/PublicConfig'
import { usePublicConfig } from './context/PublicConfig'
import { useAuth } from './context/AuthContext'
import MaintenancePage from './components/MaintenancePage'
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
  ['/hotlines', '/services/hotlines'],
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

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const isAuthPage = location.pathname.startsWith('/auth') || location.pathname.startsWith('/admin')
  const isCitizenDashboard = location.pathname === '/app' || location.pathname.startsWith('/app/')
  const settings = usePublicConfig()
  const { user, loading } = useAuth()
  useEffect(() => {
    if (!loading && user && location.pathname === '/' && !new URLSearchParams(location.search).has('municipal')) {
      navigate(['admin', 'super_admin'].includes(user.role) ? '/admin' : '/app/dashboard', { replace: true })
    }
  }, [user, loading, location.pathname, location.search, navigate])
  if (!settings.ready) return <div className="configuration-loader" aria-busy="true" />
  const maintenance = !isAuthPage && !loading && settings['maintenance.enabled'] === true && !(user && ['admin', 'super_admin'].includes(user.role))

  return (
      <div className="page-shell">
        {maintenance && <MaintenancePage />}
        {!maintenance && <>
        <ScrollToTop />
        <PageTitleManager />
        {!isAuthPage && !isCitizenDashboard && <Header />}
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/services/barangays/:id" element={<BarangayDetailRoute />} />
            <Route path="/services/barangays/:id/official" element={<BarangayOfficialRoute />} />
            <Route path="/news/:slug" element={<ArticleRoute />} />
            <Route path="/info/officials/:id" element={<OfficialProfileRoute />} />
            {pageRoutes.map(({ path, Component }) => (
              <Route key={path} path={path} element={<Component />} />
            ))}
            {redirects.map(([from, to]) => (
              <Route key={from} path={from} element={<Navigate to={to} replace />} />
            ))}
            <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        {!isAuthPage && !isCitizenDashboard && <RelatedPages />}
        {!isAuthPage && !isCitizenDashboard && <Footer />}
        <BackToTop />
        </>}
      </div>
  )
}

function ArticleRoute() {
  const Article = pageRoutes.find((route) => route.path === '/news/article')?.Component
  return Article ? <Article /> : null
}

function OfficialProfileRoute() {
  const OfficialProfile = pageRoutes.find((route) => route.path === '/info/official-profile')?.Component
  return OfficialProfile ? <OfficialProfile /> : null
}

function BarangayDetailRoute() {
  const BarangayDetail = pageRoutes.find((route) => route.path === '/services/barangay-detail')?.Component
  return BarangayDetail ? <BarangayDetail /> : null
}

function BarangayOfficialRoute() {
  const BarangayOfficial = pageRoutes.find((route) => route.path === '/services/barangay-official')?.Component
  return BarangayOfficial ? <BarangayOfficial /> : null
}

export default App
