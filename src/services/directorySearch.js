const aliases = {
  bplo: 'business permit', mcr: 'civil registry', lcr: 'civil registry', rhu: 'health',
  mswdo: 'social welfare', pwd: 'disability', philhealth: 'health', cedula: 'community tax',
  'business licence': 'business permit', 'business license': 'business permit',
  'birth cert': 'birth certificate', 'brgy': 'barangay',
}
export function normalizedSearch(value) {
  let result = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-/]/g, ' ')
  for (const [alias, replacement] of Object.entries(aliases)) result = result.replace(new RegExp(`\\b${alias}\\b`, 'g'), replacement)
  return result.replace(/\s+/g, ' ').trim()
}
export function matchesDirectory(value, query) {
  const words = normalizedSearch(query).split(' ').filter(Boolean)
  const text = normalizedSearch(value)
  return words.every(word => text.includes(word))
}
