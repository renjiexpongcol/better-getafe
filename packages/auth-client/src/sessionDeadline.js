export function sessionDeadline({ lastActivityAt, idleMinutes, absoluteExpiresAt }) {
  const idleDeadline = Number(lastActivityAt) + Number(idleMinutes) * 60_000
  const absoluteDeadline = Number(absoluteExpiresAt)
  if (!Number.isFinite(idleDeadline) || !Number.isFinite(absoluteDeadline)) return null
  return Math.min(idleDeadline, absoluteDeadline)
}

export function sessionWarningMinutes(idleMinutes, configured = 5) {
  const idle = Math.max(2, Number(idleMinutes) || 2)
  return Math.max(1, Math.min(30, idle - 1, Number(configured) || 5))
}

export function sessionWarningStartsAt(expiresAt, warningMinutes) {
  return Number(expiresAt) - Number(warningMinutes) * 60_000
}

export function formatSessionCountdown(milliseconds, now = Date.now()) {
  const totalSeconds = Math.max(0, Math.ceil((Number(milliseconds) - now) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
