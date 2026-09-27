import { clearPrivateCache } from './requestCache.js'
import { ROUTES } from '../routeRegistry.js'
import { formatResidentDate } from './residentPreferences.js'

const API_BASE = '/api'

export class ApiRequestError extends Error {
  constructor(message, status, body = {}) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.body = body
  }
}

async function requestApi(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal', ...options.headers } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('auth-session-expired'))
    throw new ApiRequestError(body.error || 'Your information could not be loaded. Please try again.', response.status, body)
  }
  if (!['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) clearPrivateCache()
  return body
}

export function citizenApi(path, options = {}) {
  return requestApi(`/citizen${path}`, options)
}

export const notificationPreferencesApi = {
  get: () => requestApi('/users/me/notification-preferences'),
  update: preferences => requestApi('/users/me/notification-preferences', { method: 'PATCH', body: JSON.stringify(preferences) }),
}

export const residentPreferencesApi = {
  get: () => requestApi('/users/me/preferences'),
  update: preferences => requestApi('/users/me/preferences', { method: 'PATCH', body: JSON.stringify(preferences) }),
}

export function residentPreferencesError(error, action = 'load') {
  if (error?.status === 401) return 'Your session has expired. Please sign in again.'
  if (error?.status === 403) return 'Complete your account setup before changing these preferences.'
  if (error?.status === 400 || error?.status === 422) return 'Those preference values are not supported. Choose another option and try again.'
  if (error?.status === 429) return 'Too many attempts. Please wait a moment and try again.'
  return action === 'update' ? "We couldn't save your preferences. Try again." : "We couldn't load your preferences. Try again."
}

export function notificationPreferencesError(error, action = 'load') {
  if (error?.status === 401) return 'Your session has expired. Please sign in again.'
  if (error?.status === 403) return 'You do not have permission to manage these notification settings.'
  if (error?.status === 429) return 'Too many attempts. Please wait a moment and try again.'
  return action === 'update' ? "Couldn't update this notification preference. Try again." : "We couldn't load your notification settings."
}

export const statusKey = value => String(value || 'draft').toLowerCase().replace(/[\s-]+/g, '_')
export const needsAction = item => ['action_required', 'additional_information_required', 'additional_documents_required', 'requires_action'].includes(statusKey(item.status))
export const isActive = item => !['completed', 'rejected', 'cancelled', 'released', 'draft'].includes(statusKey(item.status))
export const paymentDue = item => ['pending', 'unpaid', 'due', 'required', 'overdue'].includes(statusKey(item.status))
export const parseDate = value => value ? new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`) : null
export function dateLabel(value, options = {}) {
  const date = parseDate(value)
  if (!date || Number.isNaN(date.getTime())) return 'Date unavailable'
  // Formatting is shared with resident preferences so dates in notifications,
  // requests, appointments, and documents stay consistent.
  return formatResidentDate(date, options)
}
export const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0)
export const upcomingAppointments = items => items.filter(item => ['scheduled', 'confirmed', 'requested'].includes(statusKey(item.status)) && parseDate(item.appointment_at)?.getTime() > Date.now()).sort((a, b) => parseDate(a.appointment_at) - parseDate(b.appointment_at))
export function notificationLink(item) {
  if (item.application_id) return ROUTES.app.request(item.application_id)
  if (item.document_id) return `${ROUTES.app.documents}?document=${encodeURIComponent(item.document_id)}`
  return `${ROUTES.app.notifications}?notification=${encodeURIComponent(item.id)}`
}
