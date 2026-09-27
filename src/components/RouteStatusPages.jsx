import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Clock3,
  FileQuestion,
  FileText,
  Gauge,
  LockKeyhole,
  MapPin,
  SearchX,
  ServerOff,
  ShieldX,
  TriangleAlert,
  UserRound,
  WifiOff,
} from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

const homeAction = { label: 'Back to Home', to: '/' }
const retryAction = { label: 'Try Again', onClick: () => window.location.reload() }

const ERROR_STATES = {
  '400': {
    title: 'Bad request',
    message: "We couldn't process this request. Please check the information provided and try again.",
    icon: FileQuestion,
    primaryAction: { label: 'Go Back', back: true },
    secondaryAction: homeAction,
  },
  '401': {
    title: 'Sign in required',
    message: 'You need to sign in to access this page.',
    icon: LockKeyhole,
    primaryAction: { label: 'Sign In', to: '/auth/login' },
    secondaryAction: homeAction,
  },
  '403': {
    title: 'Access denied',
    message: "Your account doesn't have permission to access this page.",
    icon: ShieldX,
    primaryAction: { label: 'Back to Dashboard', to: '/app' },
    secondaryAction: homeAction,
  },
  '404': {
    title: 'Page not found',
    message: "The page you're looking for may have been moved, removed, or the address may be incorrect.",
    icon: SearchX,
    primaryAction: homeAction,
    secondaryAction: { label: 'Go Back', back: true },
    contact: true,
  },
  '408': {
    title: 'Request timed out',
    message: 'The request took too long to complete. Please check your connection and try again.',
    icon: Clock3,
    primaryAction: retryAction,
    secondaryAction: homeAction,
  },
  '409': {
    title: 'Conflict',
    message: 'This request conflicts with the current state. Refresh the page and try again.',
    icon: TriangleAlert,
    primaryAction: retryAction,
    secondaryAction: homeAction,
  },
  '410': {
    title: 'This page is no longer available',
    message: 'The content you requested has been permanently removed.',
    icon: FileQuestion,
    primaryAction: homeAction,
    secondaryAction: { label: 'Go Back', back: true },
  },
  '422': {
    title: 'Invalid request',
    message: "We couldn't process the information provided. Please review it and try again.",
    icon: FileQuestion,
    primaryAction: retryAction,
    secondaryAction: homeAction,
  },
  '429': {
    title: 'Too many requests',
    message: "You've made several requests in a short period. Please wait a moment before trying again.",
    icon: Gauge,
    primaryAction: retryAction,
    secondaryAction: homeAction,
  },
  '500': {
    title: 'Something went wrong',
    message: 'We encountered an unexpected problem while processing your request.',
    detail: 'Please try again. If the problem continues, contact the Municipality of Getafe for assistance.',
    icon: TriangleAlert,
    primaryAction: retryAction,
    secondaryAction: homeAction,
  },
  '502': {
    title: 'Service connection problem',
    message: "We're having trouble connecting to one of our services.",
    icon: ServerOff,
    primaryAction: retryAction,
    secondaryAction: homeAction,
  },
  '503': {
    title: 'Service temporarily unavailable',
    message: 'This service is temporarily unavailable. Please try again shortly.',
    icon: ServerOff,
    primaryAction: retryAction,
    secondaryAction: homeAction,
  },
  '504': {
    title: 'Service took too long to respond',
    message: 'The service did not respond in time. Please try again.',
    icon: Clock3,
    primaryAction: retryAction,
    secondaryAction: homeAction,
  },
  offline: {
    title: "You're offline",
    message: 'Check your internet connection and try again.',
    icon: WifiOff,
    primaryAction: retryAction,
    secondaryAction: { label: 'Continue browsing', onClick: () => window.location.assign('/') },
  },
  application: {
    title: 'Something went wrong',
    message: 'We encountered an unexpected problem while processing your request.',
    icon: TriangleAlert,
    primaryAction: retryAction,
    secondaryAction: homeAction,
  },
}

const RESOURCE_STATES = {
  article: {
    title: 'Article not found',
    message: "The article you're looking for may have been removed or is no longer available.",
    browseLabel: 'Browse News',
    browseTo: '/news',
    icon: FileText,
  },
  event: {
    title: 'Event not found',
    message: "The event you're looking for may have been removed or is no longer available.",
    browseLabel: 'Browse Events',
    browseTo: '/events',
    icon: CalendarDays,
  },
  service: {
    title: 'Service not found',
    message: "The service you're looking for may have been moved or is no longer available.",
    browseLabel: 'Browse Services',
    browseTo: '/services',
    icon: Building2,
  },
  official: {
    title: 'Official not found',
    message: "The official profile you're looking for may have been removed or is no longer available.",
    browseLabel: 'Browse Officials',
    browseTo: '/officials',
    icon: UserRound,
  },
  barangay: {
    title: 'Barangay not found',
    message: "The barangay profile you're looking for may have been moved or is no longer available.",
    browseLabel: 'Browse Barangays',
    browseTo: '/barangays',
    icon: MapPin,
  },
  document: {
    title: 'Document not found',
    message: "The document you're looking for may have been removed or is no longer available.",
    browseLabel: 'Browse Documents',
    browseTo: '/app/documents',
    icon: FileText,
  },
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
  const navigate = useNavigate()
  const className = `error-action error-action-${kind}`
  if (!action) return null
  if (action.to) {
    return <Link className={className} to={action.to} onClick={action.onClick}>{action.label}<ArrowRight size={16} aria-hidden="true" /></Link>
  }
  return <button className={className} type="button" disabled={disabled || action.disabled} onClick={action.onClick || (action.back ? () => navigate(-1) : undefined)}>{action.back && <ArrowLeft size={16} aria-hidden="true" />}{action.label}</button>
}

export function ErrorPage({
  code,
  title,
  message,
  detail,
  icon,
  retryAfter,
  primaryAction,
  secondaryAction,
  showContact,
  eyebrow = false,
  compact = false,
  showCode = !['application', 'offline'].includes(String(code).toLowerCase()),
}) {
  const codeKey = String(code || 'application').toLowerCase()
  const state = ERROR_STATES[codeKey] || ERROR_STATES.application
  const Icon = codeKey === '403' ? null : icon === false ? null : icon || state.icon
  const pageRef = useRef(null)
  const headingRef = useRef(null)
  const pageTitle = title || state.title
  const retryDeadline = useMemo(() => codeKey === '429' ? retryDeadlineFor(retryAfter) : null, [codeKey, retryAfter])
  const [clock, setClock] = useState(Date.now)
  const retrySeconds = retryDeadline === null ? null : Math.max(0, Math.ceil((retryDeadline - clock) / 1000))
  const retryPending = retrySeconds !== null && retrySeconds > 0

  useAvailablePageHeight(pageRef)

  useLayoutEffect(() => {
    headingRef.current?.focus()
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

  const effectivePrimaryAction = primaryAction || state.primaryAction
  const effectiveSecondaryAction = secondaryAction || state.secondaryAction
  const contactVisible = showContact ?? Boolean(state.contact)

  return (
    <main ref={pageRef} className={`route-status-page${compact ? ' route-status-page-compact' : ''}`} aria-labelledby="error-page-title" aria-describedby="error-page-message">
      <div className="route-status-decoration" aria-hidden="true" />
      <section className="route-status-content">
        {eyebrow && <p className="route-status-eyebrow">Municipality of Getafe · Bohol</p>}
        {Icon && <div className="error-symbol" aria-hidden="true"><Icon size={26} strokeWidth={1.8} /></div>}
        {showCode && <p className="route-status-code">{code}</p>}
        <h1 id="error-page-title" ref={headingRef} tabIndex={-1}>{pageTitle}</h1>
        <p className="route-status-message" id="error-page-message">{message || state.message}</p>
        {detail && <p className="route-status-detail">{detail}</p>}
        {retrySeconds !== null && retryPending && <p className="route-status-retry" aria-live="off">Try again in {formatRetryDelay(retrySeconds)}.</p>}
        {retryDeadline !== null && !retryPending && <p className="route-status-retry">You can try again now.</p>}
        {retryDeadline !== null && !retryPending && <span className="sr-only" role="status" aria-live="polite">Retry is available now.</span>}
        <div className="route-status-actions">
          <Action action={effectivePrimaryAction} kind="primary" disabled={retryPending} />
          <Action action={effectiveSecondaryAction} kind="secondary" />
        </div>
        {contactVisible && <p className="route-status-help">Need help? <Link to="/contact">Contact the Municipality</Link></p>}
      </section>
    </main>
  )
}

export function ErrorStatusPreview() {
  const { code = '404' } = useParams()
  const [searchParams] = useSearchParams()
  const normalized = code.toLowerCase()
  if (!ERROR_STATES[normalized]) return <NotFoundPage />
  return <ErrorPage code={normalized} retryAfter={searchParams.get('retryAfter')} secondaryAction={normalized === '429' ? { label: 'Browse News', to: '/news' } : undefined} />
}

export function ResourceNotFound({ type = 'article', title, message, browseLabel, browseTo, compact = false }) {
  const state = RESOURCE_STATES[type] || RESOURCE_STATES.article
  return (
    <ErrorPage
      code="resource-not-found"
      title={title || state.title}
      message={message || state.message}
      icon={state.icon}
      eyebrow
      compact={compact}
      showCode={false}
      primaryAction={{ label: browseLabel || state.browseLabel, to: browseTo || state.browseTo }}
      secondaryAction={{ label: 'Back to Home', to: '/' }}
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

export function AccessDeniedPage({ dashboardTo = '/app' }) {
  return <ErrorPage code="403" primaryAction={{ label: 'Back to Dashboard', to: dashboardTo }} />
}

export function ModuleNotFoundPage({ home = '/admin' }) {
  const label = home.startsWith('/app/staff') ? 'Return to the staff dashboard' : home.startsWith('/app') ? 'Return to the citizen dashboard' : 'Return to the admin dashboard'
  return <ResourceNotFound type="service" title="Module not found" message="The requested application module is not available." browseLabel={label} browseTo={home} />
}

export function ModuleAccessDeniedPage() {
  return <ErrorPage code="403" title="Access restricted" message="Your account does not have permission to open this module. Ask an administrator to review your group membership." primaryAction={{ label: 'Back to Dashboard', to: '/app' }} secondaryAction={homeAction} />
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
    console.error('Unhandled route rendering error:', error, info)
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
