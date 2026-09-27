export const RESIDENT_PREFERENCE_DEFAULTS = Object.freeze({
  appearance: Object.freeze({
    theme: 'system',
    contrast: 'standard',
    textScale: 'default',
    reduceMotion: false,
    density: 'comfortable',
  }),
  locale: Object.freeze({
    language: 'en',
    region: 'PH',
    timezone: 'Asia/Manila',
    dateFormat: 'long',
    timeFormat: '12h',
    weekStart: 'sunday',
  }),
})

const cloneDefaults = () => ({
  appearance: { ...RESIDENT_PREFERENCE_DEFAULTS.appearance },
  locale: { ...RESIDENT_PREFERENCE_DEFAULTS.locale },
})

const allowedAppearance = {
  theme: new Set(['light', 'dark', 'system']),
  contrast: new Set(['standard', 'high']),
  textScale: new Set(['small', 'default', 'large']),
  reduceMotion: 'boolean',
  density: new Set(['comfortable', 'compact']),
}
const allowedLocale = {
  language: new Set(['en', 'ceb']),
  region: new Set(['PH']),
  timezone: new Set(['Asia/Manila']),
  dateFormat: new Set(['long', 'medium', 'dayMonth', 'numeric']),
  timeFormat: new Set(['12h', '24h']),
  weekStart: new Set(['sunday', 'monday']),
}

const normalizeSection = (value, allowed) => Object.fromEntries(
  Object.keys(allowed)
    .filter(key => Object.hasOwn(value || {}, key))
    .filter(key => allowed[key] === 'boolean' ? typeof value[key] === 'boolean' : allowed[key].has(value[key]))
    .map(key => [key, value[key]]),
)

export function normalizeResidentPreferences(value = {}) {
  const defaults = cloneDefaults()
  const appearance = value?.appearance && typeof value.appearance === 'object' && !Array.isArray(value.appearance) ? value.appearance : {}
  const locale = value?.locale && typeof value.locale === 'object' && !Array.isArray(value.locale) ? value.locale : {}
  return {
    appearance: {
      ...defaults.appearance,
      ...normalizeSection(appearance, allowedAppearance),
    },
    locale: {
      ...defaults.locale,
      ...normalizeSection(locale, allowedLocale),
    },
  }
}

export function residentPreferencesPatch(saved, draft) {
  const current = normalizeResidentPreferences(saved)
  const next = normalizeResidentPreferences(draft)
  const patch = {}
  for (const section of ['appearance', 'locale']) {
    const changes = Object.fromEntries(Object.entries(next[section]).filter(([key, value]) => current[section][key] !== value))
    if (Object.keys(changes).length) patch[section] = changes
  }
  return patch
}

let activePreferences = normalizeResidentPreferences()

export function setActiveResidentPreferences(value) {
  activePreferences = normalizeResidentPreferences(value)
  return activePreferences
}

export function getActiveResidentPreferences() {
  return activePreferences
}

export const RESIDENT_DATE_FORMATS = [
  { value: 'long', label: 'September 27, 2026' },
  { value: 'medium', label: 'Sep 27, 2026' },
  { value: 'dayMonth', label: '27 September 2026' },
  { value: 'numeric', label: '09/27/2026' },
]

const localeFor = preferences => preferences?.locale?.language === 'ceb' ? 'ceb-PH' : 'en-PH'
const timeZoneFor = preferences => preferences?.locale?.timezone || 'Asia/Manila'

export function formatResidentDate(value, options = {}, preferences = activePreferences) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  const locale = localeFor(preferences)
  const dateFormat = preferences?.locale?.dateFormat || 'long'
  const defaults = dateFormat === 'medium'
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : dateFormat === 'dayMonth'
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : dateFormat === 'numeric'
        ? { month: '2-digit', day: '2-digit', year: 'numeric' }
        : { month: 'long', day: 'numeric', year: 'numeric' }
  return new Intl.DateTimeFormat(locale, { timeZone: timeZoneFor(preferences), ...defaults, ...options }).format(date)
}

export function formatResidentTime(value, options = {}, preferences = activePreferences) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat(localeFor(preferences), {
    timeZone: timeZoneFor(preferences),
    hour: 'numeric',
    minute: '2-digit',
    hour12: preferences?.locale?.timeFormat !== '24h',
    ...options,
  }).format(date)
}

export function formatResidentDateTime(value, options = {}, preferences = activePreferences) {
  return `${formatResidentDate(value, options.date || {}, preferences)} ${formatResidentTime(value, options.time || {}, preferences)}`
}

export function residentWeekStart(preferences = activePreferences) {
  return preferences?.locale?.weekStart === 'monday' ? 1 : 0
}
