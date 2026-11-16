const ENDPOINT = 'https://api.frankfurter.dev/v2/providers/ecb/rates?base=eur&quotes=php,usd,jpy'
const REFRESH_MS = 60 * 60 * 1000
const RETRY_MS = 5 * 60 * 1000
const FALLBACK_MS = 72 * REFRESH_MS
let cache
let pending
let retryAfter = 0

async function loadRates() {
  const response = await fetch(ENDPOINT, {
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error('Exchange rate provider unavailable')
  const rows = await response.json()
  if (!Array.isArray(rows)) throw new Error('Invalid exchange rate payload')
  const newest = currency => rows.filter(row => row?.base === 'EUR' && row.quote === currency
    && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.rate) && row.rate > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  const php = newest('PHP')
  if (!php) throw new Error('Philippine peso reference rate unavailable')

  const rates = { EUR: php.rate }
  for (const currency of ['USD', 'JPY']) {
    const row = newest(currency)
    if (row?.date === php.date) rates[currency] = php.rate / row.rate
  }
  const data = { date: php.date, rates }
  cache = { data, fetchedAt: Date.now() }
  return data
}

export async function getHeaderExchangeRates() {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < REFRESH_MS) return cache.data
  if (now >= retryAfter) {
    pending ??= loadRates().catch(() => {
      retryAfter = Date.now() + RETRY_MS
      return null
    }).finally(() => { pending = undefined })
    const data = await pending
    if (data) return data
  }
  if (cache && now - cache.fetchedAt < FALLBACK_MS) return { ...cache.data, stale: true }
  throw new Error('Exchange rates are temporarily unavailable')
}
