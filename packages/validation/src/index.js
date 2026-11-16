export function assertNonEmpty(value, label = 'value') {
  if (!String(value || '').trim()) throw new Error(`${label} is required`)
  return value
}
