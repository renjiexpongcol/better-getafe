import { focusContentTarget } from '../services/focusManagement'
import { useErrorActivity } from '../context/RouteActivity'
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useOptionalAuth } from '../context/AuthContext'
import { useErrorHistory } from '../context/ErrorNavigation'
import { getErrorNavigationContext, isSafeErrorDestination } from '../services/errorNavigation'
import { ROUTES } from '../routeRegistry'
import { reportClientError } from '../services/publicError'

const retryAction = { label: 'Try Again', onClick: () => window.location.reload() }

const ERROR_STATES = {
  '400': {
    title: 'Bad request',
    message: "We couldn't process this request. Please check the information provided and try again.",  },
  '401': {
    title: 'Sign in required',
    message: 'You need to sign in to access this page.',  },
  '403': {
    title: 'Access denied',
    message: "Your account doesn't have permission to access this page.",  },
  '404': {
    title: 'Page not found',
    message: "The page you're looking for may have been moved, removed, or the address may be incorrect.",    contact: true,
  },
  '408': {
    title: 'Request timed out',
    message: 'The request took too long to complete. Please check your connection and try again.',  },
  '409': {
    title: 'Conflict',
    message: 'This request conflicts with the current state. Refresh the page and try again.',  },
  '410': {
    title: 'This page is no longer available',
    message: 'The content you requested has been permanently removed.',  },
  '422': {
    title: 'Invalid request',
    message: "We couldn't process the information provided. Please review it and try again.",  },
  '429': {
    title: 'Too many requests',
    message: "You've made several requests in a short period. Please wait a moment before trying again.",  },
  '500': {
    title: 'Something went wrong',
    message: 'We encountered an unexpected problem while processing your request.',
    detail: 'Please try again. If the problem continues, contact the Municipality of Getafe for assistance.',  },
  '502': {
    title: 'Service connection problem',
    message: "We're having trouble connecting to one of our services.",  },
  '503': {
    title: 'Service temporarily unavailable',
    message: 'This service is temporarily unavailable. Please try again shortly.',  },
  '504': {
    title: 'Service took too long to respond',
    message: 'The service did not respond in time. Please try again.',  },
  offline: {
    title: "You're offline",
    message: 'Check your internet connection and try again.',  },
  application: {
    title: 'Something went wrong',
    message: 'We encountered an unexpected problem while processing your request.',  },
}

const RESOURCE_STATES = {
  article: {
    title: 'Article not found',
    message: "The article you're looking for may have been removed or is no longer available.",
    browseLabel: 'Browse News',
    browseTo: '/news',  },
  event: {
    title: 'Event not found',
    message: "The event you're looking for may have been removed or is no longer available.",
    browseLabel: 'Browse Events',
    browseTo: '/events',  },
  service: {
    title: 'Service not found',
    message: "The service you're looking for may have been moved or is no longer available.",
    browseLabel: 'Browse Services',
    browseTo: '/services',  },
  official: {
    title: 'Official not found',
    message: "The official profile you're looking for may have been removed or is no longer available.",
    browseLabel: 'Browse Officials',
    browseTo: '/officials',
  },
  barangay: {
    title: 'Barangay not found',
    message: "The barangay profile you're looking for may have been moved or is no longer available.",
    browseLabel: 'Browse Barangays',
    browseTo: '/barangays',
  },
  document: {
    title: 'Document not found',
    message: "The document you're looking for may have been removed or is no longer available.",
    browseLabel: 'Browse Documents',
    browseTo: '/app/documents',  },
}

function useAvailablePageHeight(pageRef) {
  useLayoutEffect(() => {
    const page = pageRef.current
    const header = document.querySelector('.topbar')
    if (!page) return undefined

    const updateHeaderHeight = () => {
      const headerHeight = header?.getBoundingClientRect().height || 0
      page.style.setProperty('--route-status-header-height', `${headerHeight}px`)
    }
    updateHeaderHeight()
    if (!header) return undefined

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateHeaderHeight)
    observer?.observe(header)
    window.addEventListener('resize', updateHeaderHeight)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateHeaderHeight)
    }
  }, [pageRef])
}

function retryDeadlineFor(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Date.now() + Math.max(0, seconds) * 1000
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function formatRetryDelay(seconds) {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

function Action({ action, kind, disabled = false }) {
  const className = `error-action error-action-${kind}`
  if (!action) return null
  if (action.to) {
    return <Link className={className} to={action.to} onClick={action.onClick}>{action.label}</Link>
  }
  return <button className={className} type="button" disabled={disabled || action.disabled} onClick={action.onClick}>{action.label}</button>
}

export function ErrorPage({
  code,
  title,
  message,
  detail,
  retryAfter,
  primaryAction,
  secondaryAction,
  showContact,
  showActions = true,
  compact = false,
  showCode = !['application', 'offline'].includes(String(code).toLowerCase()),
}) {
  useErrorActivity()
  const codeKey = String(code || 'application').toLowerCase()
  const state = ERROR_STATES[codeKey] || ERROR_STATES.application
  const auth = useOptionalAuth()
  const location = useLocation()
  const previous = useErrorHistory()
  const navigation = getErrorNavigationContext(location.pathname, auth, previous)
  const pageRef = useRef(null)
  const headingRef = useRef(null)
  const pageTitle = title || state.title
  const retryDeadline = useMemo(() => codeKey === '429' ? retryDeadlineFor(retryAfter) : null, [codeKey, retryAfter])
  const [clock, setClock] = useState(Date.now)
  const retrySeconds = retryDeadline === null ? null : Math.max(0, Math.ceil((retryDeadline - clock) / 1000))
  const retryPending = retrySeconds !== null && retrySeconds > 0

  useAvailablePageHeight(pageRef)

  useLayoutEffect(() => {
    focusContentTarget(headingRef.current)
    document.title = `Municipality of Getafe | ${pageTitle}`
  }, [codeKey, pageTitle])

  useEffect(() => {
    if (retryDeadline === null) return undefined
    setClock(Date.now())
    if (retryDeadline <= Date.now()) return undefined
    const timer = window.setInterval(() => {
      const now = Date.now()
      setClock(now)
      if (now >= retryDeadline) window.clearInterval(timer)
    }, 250)
    return () => window.clearInterval(timer)
  }, [retryDeadline])

  const safeAction = { label: navigation.label, to: navigation.destination }
  const retryable = (['408', '500', '502', '503', '504', 'offline', 'application'].includes(codeKey) || (codeKey === '429' && retryDeadline !== null))
  const accepted = action => action && !action.back && (action.onClick || isSafeErrorDestination(action.to, auth)) ? action : null
  const effectivePrimaryAction = accepted(primaryAction) || (codeKey === '401' && !auth.user ? {label:'Sign In',to:ROUTES.auth.login} : retryable ? retryAction : null)
  const candidateSecondaryAction = (navigation.showBack && effectivePrimaryAction?.to === safeAction.to ? {label:'Go Back',to:navigation.backDestination} : accepted(secondaryAction)) || (effectivePrimaryAction && effectivePrimaryAction.to !== safeAction.to ? safeAction : navigation.showBack ? {label:'Go Back',to:navigation.backDestination} : null)
  const effectiveSecondaryAction = candidateSecondaryAction?.to && (candidateSecondaryAction.to === effectivePrimaryAction.to || candidateSecondaryAction.to === location.pathname) ? null : candidateSecondaryAction
  const contactVisible = showContact ?? true
  const Container = compact ? 'section' : 'main'

  return (
    <Container ref={pageRef} className={`route-status-page${compact ? ' route-status-page-compact' : ''}`} aria-labelledby="error-page-title" aria-describedby="error-page-message">
      
      <section className="route-status-content">

        
        {showCode && <p className="route-status-code">{code}</p>}
        <h1 id="error-page-title" ref={headingRef} tabIndex={-1}>{pageTitle}</h1>
        <p className="route-status-message" id="error-page-message">{message || state.message}</p>
        {(detail || state.detail) && <p className="route-status-detail">{detail || state.detail}</p>}
        {retrySeconds !== null && retryPending && <p className="route-status-retry" aria-live="off">Try again in {formatRetryDelay(retrySeconds)}.</p>}
        {retryDeadline !== null && !retryPending && <p className="route-status-retry">You can try again now.</p>}
        {retryDeadline !== null && !retryPending && <span className="sr-only" role="status" aria-live="polite">Retry is available now.</span>}
        {showActions && <div className="route-status-actions">
          <Action action={effectivePrimaryAction} kind="primary" disabled={retryPending && Boolean(effectivePrimaryAction.onClick)} />
          <Action action={effectiveSecondaryAction} kind="secondary" />
        </div>}
        {contactVisible && <p className="route-status-help">Need help? <Link to={navigation.helpDestination}>{navigation.helpDestination === ROUTES.public.contact ? 'Contact the Municipality' : 'Help & Support'}</Link></p>}
      </section>
    </Container>
  )
}

export function ErrorStatusPreview() {
  const { code = '404' } = useParams()
  const [searchParams] = useSearchParams()
  const normalized = code.toLowerCase()
  if (!ERROR_STATES[normalized]) return <NotFoundPage />
  return <ErrorPage code={normalized} retryAfter={searchParams.get('retryAfter')}  />
}

export function ResourceNotFound({ type = 'article', title, message, browseLabel, browseTo, compact = false }) {
  const state = RESOURCE_STATES[type] || RESOURCE_STATES.article
  return (
    <ErrorPage
      code="404"
      title={title || state.title}
      message={message || state.message}
      compact={compact}
      showCode
      secondaryAction={{ label: browseLabel || state.browseLabel, to: browseTo || state.browseTo }}
    />
  )
}

export function ResourceNotFoundPreview() {
  const { type = 'article' } = useParams()
  return <ResourceNotFound type={Object.hasOwn(RESOURCE_STATES, type) ? type : 'article'} />
}

export function NotFoundPage() {
  return <ErrorPage code="404" />
}

export function AccessDeniedPage() {
  return <ErrorPage code="403" />
}

export function ModuleNotFoundPage({ home = '/admin' }) {
  const label = home.startsWith('/app/staff') ? 'Return to the staff dashboard' : home.startsWith('/app') ? 'Return to the citizen dashboard' : 'Return to the admin dashboard'
  return <ResourceNotFound type="service" title="Module not found" message="The requested application module is not available." browseLabel={label} browseTo={home} />
}

export function ModuleAccessDeniedPage() {
  return <ErrorPage code="403" title="Access restricted" message="Your account does not have permission to open this module. Ask an administrator to review your group membership." />
}

export function RouteLoadErrorPage({ onRetry }) {
  return <ErrorPage code="application" primaryAction={{ label: 'Try Again', onClick: onRetry || retryAction.onClick }} />
}

function BoundaryPreviewCrash() {
  throw new Error('Intentional development preview for the route error boundary.')
}

export function ErrorBoundaryPreview() {
  return <BoundaryPreviewCrash />
}

export class RouteErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    reportClientError(error, info)
    if (import.meta.env.DEV) console.error('Unhandled route rendering error:', error, info)
  }

  componentDidUpdate(previousProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    return this.state.hasError ? <RouteLoadErrorPage onRetry={() => window.location.reload()} /> : this.props.children
  }
}
