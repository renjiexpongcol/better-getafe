import { getPostgresRuntime } from '../repositories/postgresRuntime.js'
import { now } from './identifiers.js'

export const RESIDENT_PREFERENCE_DEFAULTS = Object.freeze({
  appearance: Object.freeze({ theme: 'system', contrast: 'standard', textScale: 'default', reduceMotion: false, density: 'comfortable' }),
  locale: Object.freeze({ language: 'en', region: 'PH', timezone: 'Asia/Manila', dateFormat: 'long', timeFormat: '12h', weekStart: 'sunday' }),
})

const allowed = {
  appearance: {
    theme: new Set(['light', 'dark', 'system']),
    contrast: new Set(['standard', 'high']),
    textScale: new Set(['small', 'default', 'large']),
    reduceMotion: 'boolean',
    density: new Set(['comfortable', 'compact']),
  },
  locale: {
    language: new Set(['en', 'ceb']),
    region: new Set(['PH']),
    timezone: new Set(['Asia/Manila']),
    dateFormat: new Set(['long', 'medium', 'dayMonth', 'numeric']),
    timeFormat: new Set(['12h', '24h']),
    weekStart: new Set(['sunday', 'monday']),
  },
}

const objectValue = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const parseJson = value => {
  if (typeof value !== 'string') return objectValue(value)
  try { return objectValue(JSON.parse(value)) } catch { return {} }
}

const supportedValues = (section, value) => Object.fromEntries(
  Object.keys(allowed[section])
    .filter(key => Object.hasOwn(value, key))
    .filter(key => allowed[section][key] === 'boolean' ? typeof value[key] === 'boolean' : allowed[section][key].has(value[key]))
    .map(key => [key, value[key]]),
)

export function normalizePreferences(value = {}) {
  const input = objectValue(value)
  const appearance = parseJson(input.appearance)
  const locale = parseJson(input.locale)
  return {
    appearance: { ...RESIDENT_PREFERENCE_DEFAULTS.appearance, ...supportedValues('appearance', appearance) },
    locale: { ...RESIDENT_PREFERENCE_DEFAULTS.locale, ...supportedValues('locale', locale) },
  }
}

export function validatePreferencePatch(input = {}) {
  const body = objectValue(input)
  if (body !== input || Array.isArray(input)) return 'Resident preferences must be a JSON object.'
  const unknownTopLevel = Object.keys(body).filter(key => !['appearance', 'locale'].includes(key))
  if (unknownTopLevel.length) return 'Unsupported resident preference.'
  for (const section of ['appearance', 'locale']) {
    if (body[section] === undefined) continue
    const values = objectValue(body[section])
    if (values !== body[section] || Array.isArray(body[section])) return `${section} preferences must be a JSON object.`
    for (const key of Object.keys(values)) {
      if (!allowed[section][key]) return 'Unsupported resident preference.'
      if (section === 'appearance' && key === 'reduceMotion') {
        if (typeof values[key] !== 'boolean') return 'Reduce motion preference must be a boolean.'
      } else if (!allowed[section][key].has(values[key])) {
        return 'One or more resident preference values are invalid.'
      }
    }
  }
  return null
}

export async function getResidentPreferences(userId) {
  const db = await getPostgresRuntime('portal')
  const row = await db.prepare('SELECT appearance, locale FROM portal_user_preferences WHERE user_id = ?').get(userId)
  return normalizePreferences(row || {})
}

export async function saveResidentPreferences(userId, patch) {
  const error = validatePreferencePatch(patch)
  if (error) throw Object.assign(new Error(error), { statusCode: 400 })
  const input = objectValue(patch)
  const current = await getResidentPreferences(userId)
  const next = normalizePreferences({
    appearance: { ...current.appearance, ...objectValue(input.appearance) },
    locale: { ...current.locale, ...objectValue(input.locale) },
  })
  const timestamp = now()
  const db = await getPostgresRuntime('portal')
  await db.prepare(`INSERT INTO portal_user_preferences (user_id, appearance, locale, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET appearance=excluded.appearance, locale=excluded.locale, updated_at=excluded.updated_at`).run(
    userId, JSON.stringify(next.appearance), JSON.stringify(next.locale), timestamp, timestamp,
  )
  return next
}
