const NAMESPACE = 'getafe:announcement-dismissal:'
const DEFAULT_DURATION_HOURS = 24
const configuredHours = Number(import.meta.env.VITE_ANNOUNCEMENT_DISMISS_DURATION_HOURS)
const DURATION_MS = Number.isFinite(configuredHours) && configuredHours > 0
  ? configuredHours * 60 * 60 * 1000
  : DEFAULT_DURATION_HOURS * 60 * 60 * 1000

const keyFor = (id, version) => `${NAMESPACE}${encodeURIComponent(String(id))}:v${encodeURIComponent(String(version))}`

function validRecord(record, id, version, now = Date.now()) {
  return Boolean(record && typeof record === 'object' &&
    record.announcementId === String(id) &&
    record.version === String(version) &&
    Number.isSafeInteger(record.dismissedAt) &&
    Number.isSafeInteger(record.expiresAt) &&
    record.expiresAt > record.dismissedAt &&
    record.expiresAt > now)
}

export function clearExpiredAnnouncementDismissals(now = Date.now()) {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(NAMESPACE)) continue
      try {
        const record = JSON.parse(localStorage.getItem(key))
        if (!validRecord(record, record?.announcementId, record?.version, now)) localStorage.removeItem(key)
      } catch {
        localStorage.removeItem(key)
      }
    }
  } catch { /* Storage is optional; announcements must never break the page. */ }
}

export function isAnnouncementDismissed(id, version, now = Date.now()) {
  if (!id || version === undefined || version === null) return false
  const key = keyFor(id, version)
  try {
    const record = JSON.parse(localStorage.getItem(key))
    if (!validRecord(record, id, version, now)) {
      if (record) localStorage.removeItem(key)
      return false
    }
    return true
  } catch {
    try { localStorage.removeItem(key) } catch { /* Ignore unavailable storage. */ }
    return false
  }
}

export function dismissAnnouncement(id, version, durationMs = DURATION_MS) {
  if (!id || version === undefined || version === null) return
  const dismissedAt = Date.now()
  const safeDuration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : DURATION_MS
  const record = { announcementId: String(id), version: String(version), dismissedAt, expiresAt: dismissedAt + safeDuration }
  try { localStorage.setItem(keyFor(id, version), JSON.stringify(record)) } catch { /* UX preference only. */ }
}

export { DURATION_MS as ANNOUNCEMENT_DISMISS_DURATION_MS }
