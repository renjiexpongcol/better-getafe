import { readPreferences } from './cookiePreferences.js'

const enabled = import.meta.env.PROD === true && import.meta.env.VITE_WEBSITE_ANALYTICS_ENABLED !== 'false'
const MAX_QUEUE = 100
const MAX_BATCH = 20
const MAX_ATTEMPTS = 3
const FLUSH_INTERVAL = 5000
const MAX_BACKOFF = 60000
const MAX_BATCH_BYTES = 8192
const encoder = new TextEncoder()
const queue = []
let timer = null
let flushing = null
let activeRequest = null
let collectionEnabled = false
let consecutiveFailures = 0
let retryAt = 0
let installed = false
let entrySourceCaptured = false
let pendingPageView = null
let lastPageVisitId = null
const serviceJourneyState = new Map()
const contentViewVisits = new Set()

// Analytics is on for new visitors by default. A saved false preference is a
// persistent opt-out and continues to stop collection on later visits.
const mayCollect = () => enabled && collectionEnabled && (readPreferences()?.analytics ?? true)
function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  if (!globalThis.crypto?.getRandomValues) return null
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
function viewportCategory() {
  const width = Number(window.innerWidth)
  if (!Number.isFinite(width) || width <= 0) return 'unknown'
  // Portal responsive breakpoints: mobile <=720px; tablet 721-1120px; desktop >1120px.
  return width <= 720 ? 'mobile' : width <= 1120 ? 'tablet' : 'desktop'
}
function classifyEntrySource() {
  try {
    const referrer = document.referrer
    if (!referrer) return 'direct_or_unknown'
    const source = new URL(referrer)
    if (source.origin === window.location.origin) return 'internal'
    if (/(^|\.)(google|bing|yahoo|duckduckgo|baidu|yandex)\./i.test(source.hostname)) return 'search'
    return 'external'
  } catch { return 'direct_or_unknown' }
}

function cancelFlush() {
  if (timer !== null) window.clearTimeout(timer)
  timer = null
}
function scheduleFlush(delay = FLUSH_INTERVAL) {
  if (timer !== null || flushing || !queue.length || !mayCollect()) return
  const wait = Math.max(delay, retryAt - Date.now())
  timer = window.setTimeout(() => { timer = null; void flush() }, Math.min(wait, 2147483647))
}
function discardQueuedEvents() {
  queue.length = 0
  cancelFlush()
  activeRequest?.abort()
}
function recordPendingPageView() {
  if (!mayCollect() || !pendingPageView) return
  const { routeKey, visitId } = pendingPageView
  pendingPageView = null
  trackPublicPageView(routeKey, visitId)
}
export function configureWebsiteAnalytics(serverEnabled) {
  collectionEnabled = serverEnabled === true
  if (collectionEnabled) recordPendingPageView()
  else discardQueuedEvents()
}
function installListeners() {
  if (!installed) {
    installed = true
    window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(true) })
    window.addEventListener('pagehide', () => { void flush(true) })
    window.addEventListener('website-analytics-consent-changed', () => {
      if (!(readPreferences()?.analytics ?? true)) {
        pendingPageView = null
        discardQueuedEvents()
      } else {
        recordPendingPageView()
      }
    })
  }
}
function enqueue(event) {
  if (!mayCollect()) return false
  installListeners()
  if (queue.length >= MAX_QUEUE) return false
  const eventId = randomId()
  if (!eventId) return false
  queue.push({ ...event, eventId, attempts: 0 })
  if (queue.length >= MAX_BATCH) void flush()
  else scheduleFlush()
  return true
}

function retryAfterMs(response) {
  const value = response?.headers.get('Retry-After')
  if (!value) return 0
  const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now()
  return Number.isFinite(delay) ? Math.max(0, delay) : 0
}

async function flush(keepalive = false) {
  if (flushing || !queue.length || !mayCollect()) return flushing
  if (Date.now() < retryAt) { scheduleFlush(0); return }
  cancelFlush()

  const batch = queue.slice(0, MAX_BATCH)
  const serialize = () => JSON.stringify({ version: 1, events: batch.map(({ attempts, ...event }) => event) })
  let body = serialize()
  while (batch.length > 1 && encoder.encode(body).length > MAX_BATCH_BYTES) {
    batch.pop()
    body = serialize()
  }
  const ids = new Set(batch.map(event => event.eventId))
  const controller = new AbortController()
  activeRequest = controller
  const timeout = window.setTimeout(() => controller.abort(), 15000)
  let response
  flushing = (async () => {
    try {
      response = await fetch('/api/analytics/events', {
        method: 'POST', credentials: 'omit', cache: 'no-store', keepalive,
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal' },
        body, signal: controller.signal,
      })
      const result = await response.json().catch(() => null)
      if (result?.code === 'ANALYTICS_DISABLED') {
        configureWebsiteAnalytics(false)
        return
      }
      const acknowledged = response.ok && (result?.committed === true || result?.excluded === batch.length)
      const permanentFailure = response.status >= 400 && response.status < 500 && ![408, 425, 429].includes(response.status)
      if (!acknowledged && !permanentFailure) throw new Error('Analytics batch not acknowledged.')
      for (let index = queue.length - 1; index >= 0; index--) {
        if (ids.has(queue[index].eventId)) queue.splice(index, 1)
      }
      consecutiveFailures = 0
      retryAt = 0
    } catch {
      if (mayCollect()) {
        consecutiveFailures = Math.min(consecutiveFailures + 1, 5)
        const backoff = Math.min(MAX_BACKOFF, FLUSH_INTERVAL * 2 ** (consecutiveFailures - 1))
        retryAt = Date.now() + Math.max(backoff, retryAfterMs(response))
        for (let index = queue.length - 1; index >= 0; index--) {
          const event = queue[index]
          if (ids.has(event.eventId) && ++event.attempts >= MAX_ATTEMPTS) queue.splice(index, 1)
        }
      }
    } finally {
      window.clearTimeout(timeout)
      activeRequest = null
      flushing = null
      scheduleFlush(0)
    }
  })()
  return flushing
}

export function trackPublicPageView(routeKey, visitId = routeKey) {
  if (typeof routeKey !== 'string' || !routeKey || !enabled) return false
  if (visitId === lastPageVisitId) return false
  installListeners()
  if (!mayCollect()) { pendingPageView = { routeKey, visitId }; return false }
  pendingPageView = null
  lastPageVisitId = visitId
  const entrySource = entrySourceCaptured ? 'none' : classifyEntrySource()
  entrySourceCaptured = true
  return enqueue({ type: 'page_view', routeKey, viewport: viewportCategory(), entrySource })
}

export function trackPublicAction(action) {
  if (!['browse_services_click', 'report_concern_click', 'open_data_xlsx_request'].includes(action)) return false
  return enqueue({ type: 'action', action })
}

export function trackServiceJourneyStep(serviceId, stage) {
  const allowed = ['service_viewed', 'requirements_opened', 'service_form_download_clicked', 'service_apply_clicked']
  const id = String(serviceId || '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._~:-]{0,191}$/.test(id) || !allowed.includes(stage) || !mayCollect()) return false
  let completed = serviceJourneyState.get(id)
  if (!completed) { completed = new Set(); serviceJourneyState.set(id, completed) }
  if (completed.has(stage)) return false
  if (stage !== 'service_viewed' && !completed.has('service_viewed')) return false
  completed.add(stage)
  return enqueue({ type: 'service_journey', serviceId: id, stage, viewport: viewportCategory() })
}

export function trackSearchResultClick({ submissionId, topicId = null, source, resultType, resultId, positionBucket }) {
  if (!mayCollect() || !submissionId) return false
  return enqueue({ type: 'search_result_click', submissionId, topicId, source, resultType, resultId, positionBucket })
}

export function trackOpenDataActivity(datasetId, activity) {
  const id = String(datasetId || '')
  if (!mayCollect() || !/^[A-Za-z0-9][A-Za-z0-9._~:-]{0,191}$/.test(id)) return false
  if (!['dataset_view', 'query_request', 'csv_download_click', 'xlsx_download_click'].includes(activity)) return false
  return enqueue({ type: 'open_data', datasetId: id, activity })
}

export function trackContentView(contentId, contentType, visitId) {
  const id = String(contentId || '')
  if (!mayCollect() || !/^[A-Za-z0-9][A-Za-z0-9._~:-]{0,191}$/.test(id) || !['news', 'announcement', 'event', 'meeting', 'service'].includes(contentType)) return false
  const visitKey = `${visitId || ''}\u001f${contentType}\u001f${id}`
  if (contentViewVisits.has(visitKey)) return false
  const accepted = enqueue({ type: 'content_view', contentId: id, contentType })
  if (!accepted) return false
  contentViewVisits.add(visitKey)
  if (contentViewVisits.size > 250) contentViewVisits.delete(contentViewVisits.values().next().value)
  return true
}

export function trackAnnouncementInteraction(interaction, articleId, impressionId) {
  const id = String(articleId || '')
  if (!mayCollect() || !/^[A-Za-z0-9][A-Za-z0-9._~:-]{0,191}$/.test(id) || !['impression', 'open', 'dismiss'].includes(interaction)) return null
  const receiptId = impressionId || (interaction === 'impression' ? randomId() : null)
  if (!receiptId) return null
  return enqueue({ type: 'announcement', articleId: id, interaction, impressionId: receiptId }) ? receiptId : null
}

export function trackNavigationInteraction(interaction, { placementKey, destinationId, slotPosition = 0, impressionId = null }) {
  if (!mayCollect() || !['impression', 'click'].includes(interaction)) return null
  const viewport = viewportCategory()
  const receiptId = impressionId || (interaction === 'impression' ? randomId() : null)
  if (interaction === 'impression' && !receiptId) return null
  const accepted = enqueue({ type: 'navigation', interaction, placementKey, destinationId, slotPosition, viewport, impressionId: receiptId })
  return accepted ? receiptId : null
}

export function navigationDestinationId(value) {
  try {
    const url = new URL(String(value || ''), window.location.origin)
    if (url.origin !== window.location.origin) return 'external'
    const root = url.pathname.replace(/\/{2,}/g, '/').split('/').filter(Boolean)[0]?.toLowerCase()
    const roots = new Set(['accessibility', 'barangays', 'community', 'contact', 'data', 'departments', 'discover', 'events', 'info', 'legal', 'news', 'newsletter', 'officials', 'search', 'services', 'tourism', 'weather'])
    return root && roots.has(root) ? `/${root}` : url.pathname === '/' ? '/' : '/other'
  } catch { return '/other' }
}

export function observeNavigationPlacements() {
  if (!enabled || !mayCollect() || !document?.body) return () => {}
  const targets = new WeakMap()
  const observed = new WeakSet()
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || entry.intersectionRatio <= 0) continue
      const target = entry.target
      const attrs = target.dataset
      const impressionId = trackNavigationInteraction('impression', { placementKey: attrs.analyticsPlacement, destinationId: attrs.analyticsDestination, slotPosition: Number(attrs.analyticsPosition) || 0 })
      if (impressionId) targets.set(target, impressionId)
      observer.unobserve(target)
    }
  }, { threshold: 0.01 }) : null
  const scan = root => {
    if (root.nodeType === 1 && root.matches?.('[data-analytics-placement][data-analytics-destination]') && !observed.has(root)) {
      observed.add(root)
      if (observer) observer.observe(root)
      else {
        const impressionId = trackNavigationInteraction('impression', { placementKey: root.dataset.analyticsPlacement, destinationId: root.dataset.analyticsDestination, slotPosition: Number(root.dataset.analyticsPosition) || 0 })
        if (impressionId) targets.set(root, impressionId)
      }
    }
    root.querySelectorAll?.('[data-analytics-placement][data-analytics-destination]').forEach(target => {
      if (observed.has(target)) return
      observed.add(target)
      if (observer) observer.observe(target)
      else {
        const impressionId = trackNavigationInteraction('impression', { placementKey: target.dataset.analyticsPlacement, destinationId: target.dataset.analyticsDestination, slotPosition: Number(target.dataset.analyticsPosition) || 0 })
        if (impressionId) targets.set(target, impressionId)
      }
    })
  }
  const onClick = event => {
    const target = event.target.closest?.('[data-analytics-placement][data-analytics-destination]')
    if (!target) return
    let impressionId = targets.get(target) || null
    if (!impressionId) {
      impressionId = trackNavigationInteraction('impression', { placementKey: target.dataset.analyticsPlacement, destinationId: target.dataset.analyticsDestination, slotPosition: Number(target.dataset.analyticsPosition) || 0 })
      if (impressionId) targets.set(target, impressionId)
    }
    trackNavigationInteraction('click', { placementKey: target.dataset.analyticsPlacement, destinationId: target.dataset.analyticsDestination, slotPosition: Number(target.dataset.analyticsPosition) || 0, impressionId })
  }
  scan(document.body)
  const mutation = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(scan)))
  mutation.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('click', onClick, true)
  return () => { mutation.disconnect(); observer?.disconnect(); document.removeEventListener('click', onClick, true) }
}

export function analyticsConsentChanged() {
  window.dispatchEvent(new Event('website-analytics-consent-changed'))
}

export function shouldRecordSearchSubmission() { return mayCollect() }
