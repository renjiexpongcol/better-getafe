import { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Header from './components/Header'
import Footer from './components/Footer'
import PageTitleManager from './components/PageTitleManager'
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
  ['/hotlines', '/services/hotlines'],
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
  const location = useLocation()
  const isAuthPage = location.pathname.startsWith('/auth') || location.pathname.startsWith('/admin')

  return (
    <AuthProvider>
      <div className="page-shell">
        <ScrollToTop />
        <PageTitleManager />
        {!isAuthPage && <Header />}
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/news/:slug" element={<ArticleRoute />} />
            {pageRoutes.map(({ path, Component }) => (
              <Route key={path} path={path} element={<Component />} />
            ))}
            {redirects.map(([from, to]) => (
              <Route key={from} path={from} element={<Navigate to={to} replace />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        {!isAuthPage && <Footer />}
        <BackToTop />
      </div>
    </AuthProvider>
  )
}

function ArticleRoute() {
  const Article = pageRoutes.find((route) => route.path === '/news/article')?.Component
  return Article ? <Article /> : null
}

export default App
