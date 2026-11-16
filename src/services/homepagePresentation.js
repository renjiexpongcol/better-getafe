export const municipalDate = (value, options = {}) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', ...options,
  }).format(date)
}

export function municipalDayKey(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = type => parts.find(part => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

// Only public identity and a restrictive maintenance signal survive an outage.
// Never restore authentication, CAPTCHA, feature flags, or admin configuration.
export function degradedPublicConfig(previous = {}) {
  const safe = {
    'general.name': 'Municipality of Getafe',
    'general.company': 'Municipality of Getafe',
    'general.logo': '/assets/getafe-seal.png',
    'general.timezone': 'Asia/Manila', 'general.locale': 'en-PH',
  }
  if (previous['maintenance.enabled'] === true) safe['maintenance.enabled'] = true
  return safe
}

export const noticeVersion = notice => notice.version || notice.updated_at || JSON.stringify([
  notice.title, notice.excerpt, notice.event_start_at, notice.event_end_at, notice.featured_image, notice.published_at,
])

export function noticeKind(notice) {
  const category = String(notice.category?.slug || '').toLowerCase()
  if (['emergency', 'emergency-alerts'].includes(category)) return 'Emergency alert'
  if (['advisory', 'advisories', 'service-advisory'].includes(category)) return 'Service advisory'
  return notice.is_important ? 'Important announcement' : 'Announcement'
}
