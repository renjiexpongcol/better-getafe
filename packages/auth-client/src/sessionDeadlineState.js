export function sessionWarningVisible({ initialized, hasSession, expiresAt, warningMinutes, now }) {
  const deadline = Number(expiresAt)
  const warningMs = Number(warningMinutes) * 60_000
  return Boolean(initialized && hasSession && Number.isFinite(deadline) && deadline > 0
    && Number.isFinite(warningMs) && warningMs > 0 && deadline > now && now >= deadline - warningMs)
}

export const sessionMaximumWarningVisible = sessionWarningVisible

const USER_ACTIVITY_EVENTS = new Set(['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'])
export function shouldSendActivityUpdate({ eventType, isTrusted, visible, lastSentAt, now, throttleMs = 30_000 }) {
  if (!isTrusted || !visible || !USER_ACTIVITY_EVENTS.has(eventType)) return false
  const previous = Number(lastSentAt) || 0
  return previous <= 0 || Number(now) - previous >= throttleMs
}

// Within one authenticated session, stale responses may never shorten the
// server-confirmed deadline. A session transition clears the stored deadline.
export function nextSessionDeadline(current, incoming) {
  const next = Number(incoming)
  if (!Number.isFinite(next) || next <= 0) return current ?? null
  return current != null && next < Number(current) ? Number(current) : next
}
