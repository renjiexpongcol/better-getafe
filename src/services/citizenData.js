import { clearPrivateCache } from './requestCache.js'
import { ROUTES } from '../routeRegistry.js'
import { formatResidentDate } from './residentPreferences.js'
import { requestJson } from './apiTransport.js'
export { ApiRequestError } from './apiTransport.js'

async function requestApi(path, options = {}) {
  try {
    const body = await requestJson(path, { errorContext: 'services', ...options })
    if (!['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) clearPrivateCache()
    return body
  } catch (error) {
    if (error.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('auth-session-expired'))
    throw error
  }
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
export const needsAction = item => ['needs_information', 'action_required', 'additional_information_required', 'additional_documents_required', 'requires_action'].includes(statusKey(item.status))
export const isActive = item => !['completed', 'rejected', 'cancelled', 'released', 'draft'].includes(statusKey(item.status))
export const paymentDue = item => ['pending', 'unpaid', 'due', 'required', 'overdue'].includes(statusKey(item.status))
export const parseDate = value => {
  if (!value) return null
  if (value instanceof Date || typeof value === 'number') return new Date(value)
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T12:00:00+08:00`)
  return new Date(/Z$|[+-]\d\d:?\d\d$/i.test(text) ? text : `${text.replace(' ', 'T')}Z`)
}
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
