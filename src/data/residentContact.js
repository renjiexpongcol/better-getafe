// Shared by setup, profile editing, onboarding and SMS verification.
export function normalizeMobile(value) {
  const compact = String(value ?? '').trim().replace(/[\s().\-\u2010-\u2015]/g, '')
  // Keep Philippine numbers in the local format used by appointment forms.
  if (/^\+?639\d{9}$/.test(compact)) return `0${compact.replace(/^\+/, '').slice(2)}`
  return compact
}

export const validMobile = value => /^\+?\d{10,15}$/.test(normalizeMobile(value))
