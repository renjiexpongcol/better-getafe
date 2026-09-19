import { clearPrivateCache } from './requestCache.js'

export async function citizenApi(path, options = {}) {
  const response = await fetch(`/api/citizen${path}`, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal', ...options.headers } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Your information could not be loaded. Please try again.')
  if (!['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) clearPrivateCache()
  return body
}
export const statusKey = value => String(value || 'draft').toLowerCase().replace(/[\s-]+/g, '_')
export const needsAction = item => ['action_required', 'additional_information_required', 'additional_documents_required', 'requires_action'].includes(statusKey(item.status))
export const isActive = item => !['completed', 'rejected', 'cancelled', 'released', 'draft'].includes(statusKey(item.status))
export const paymentDue = item => ['pending', 'unpaid', 'due', 'required', 'overdue'].includes(statusKey(item.status))
export const parseDate = value => value ? new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`) : null
export function dateLabel(value, options = {}) {
  const date = parseDate(value)
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', ...options }) : 'Date unavailable'
}
export const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0)
export const upcomingAppointments = items => items.filter(item => ['scheduled', 'confirmed', 'requested'].includes(statusKey(item.status)) && parseDate(item.appointment_at)?.getTime() > Date.now()).sort((a, b) => parseDate(a.appointment_at) - parseDate(b.appointment_at))
export function notificationLink(item) {
  if (item.application_id) return `/app/requests/${encodeURIComponent(item.application_id)}`
  if (item.document_id) return `/app/documents?document=${encodeURIComponent(item.document_id)}`
  return `/app/notifications?notification=${encodeURIComponent(item.id)}`
}
