import assert from 'node:assert/strict'
import test from 'node:test'

test('Vercel public weather route works without database or application secrets', async () => {
  const previous = { VERCEL: process.env.VERCEL, VERCEL_ENV: process.env.VERCEL_ENV }
  process.env.VERCEL = '1'
  process.env.VERCEL_ENV = 'production'
  for (const name of ['DATABASE_URL', 'CMS_SUPABASE_DATABASE_URL', 'SUPABASE_DATABASE_URL', 'SETTINGS_ENCRYPTION_KEY', 'AUTH_SESSION_SECRET']) delete process.env[name]
  const primary = globalThis.fetch
  globalThis.fetch = async url => {
    assert.equal(new URL(url).hostname, 'api.open-meteo.com')
    return { ok: true, status: 200, text: async () => JSON.stringify({ current: { time: 1795852800, temperature_2m: 29, apparent_temperature: 33, relative_humidity_2m: 74, dew_point_2m: 23, weather_code: 2, is_day: 1 }, hourly: { time: [1795852800], precipitation_probability: [20] }, daily: { time: ['2026-11-28'], temperature_2m_min: [25], temperature_2m_max: [31] } }) }
  }
  try {
    const { default: handler } = await import(`../api/index.js?weather-isolation=${Date.now()}`)
    const res = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value }, end(body) { this.body = body } }
    await handler({ method: 'GET', url: '/api/public/weather/current' }, res)
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).current.temperature, 29)
    assert.match(res.headers['vercel-cdn-cache-control'], /s-maxage=300/)
    assert.equal(res.headers['cache-control'].includes('no-store'), false)
  } finally {
    globalThis.fetch = primary
    if (previous.VERCEL === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous.VERCEL
    if (previous.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous.VERCEL_ENV
  }
})
