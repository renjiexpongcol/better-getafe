export const COOKIE_KEY = 'getafe-cookie-cache-preferences-v2'
export const CONSENT_VERSION = 3
export const defaultPreferences = Object.freeze({ functional: false, publicCache: false, analytics: true })
export function readPreferences() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(COOKIE_KEY) || 'null')
    if (!saved || typeof saved !== 'object') return null
    const choices = { functional: saved.functional === true, publicCache: saved.publicCache === true, analytics: saved.analytics === true }
    return { ...choices, acknowledged: saved.acknowledged === true && saved.consentVersion === CONSENT_VERSION }
  } catch { return null }
}
