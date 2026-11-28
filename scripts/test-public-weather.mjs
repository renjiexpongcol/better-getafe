import assert from 'node:assert/strict'
import test from 'node:test'
import { createPublicWeatherHandler, createWeatherService, parsePagasaAlerts } from '../server/src/services/publicWeather.js'

const currentFixture = {
  current: { time: 1795852800, temperature_2m: 29, apparent_temperature: 33, relative_humidity_2m: 74, dew_point_2m: 23, weather_code: 2, is_day: 1, cloud_cover: 50, visibility: 10000, uv_index: 5, wind_speed_10m: 14.4, wind_direction_10m: 90, wind_gusts_10m: 21.6, precipitation: 0, rain: 0, pressure_msl: 1011, surface_pressure: 1010 },
  hourly: { time: [1795852800, 1795856400], precipitation_probability: [20, 30] },
  daily: { time: ['2026-11-28'], temperature_2m_min: [25], temperature_2m_max: [31], sunrise: [1795815600], sunset: [1795858800] },
}
const metFixture = { properties: { timeseries: [
  { time: '2026-11-28T08:00:00Z', data: { instant: { details: { air_temperature: 28, relative_humidity: 80, wind_speed: 3, wind_from_direction: 120 } }, next_1_hours: { summary: { symbol_code: 'lightrain' }, details: { precipitation_amount: 0.2 } } } },
  { time: '2026-11-28T09:00:00Z', data: { instant: { details: { air_temperature: 27, relative_humidity: 84, wind_speed: 4, wind_from_direction: 130 } }, next_1_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: 1.2 } } } },
] } }
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => typeof value === 'string' ? value : JSON.stringify(value) })

test('primary current weather uses fixed Getafe coordinates and requests no seven-day forecast', async () => {
  const urls = []
  const weather = createWeatherService({ fetchImpl: async url => { urls.push(new URL(url)); return response(currentFixture) } })
  const result = await weather.current()
  assert.equal(result.location.name, 'Getafe, Bohol')
  assert.equal(result.location.latitude, 10.1496)
  assert.equal(result.location.longitude, 124.1534)
  assert.equal(result.current.temperature, 29)
  assert.equal(result.current.observationTime, null)
  assert.equal(result.providers.type, 'model_forecast')
  assert.equal(urls.length, 1)
  assert.equal(urls[0].searchParams.get('forecast_days'), '1')
  assert.equal(urls[0].searchParams.has('hourly'), true)
  assert.equal(urls[0].searchParams.has('daily'), true)
  assert.equal(urls[0].searchParams.has('models'), false)
})

test('concurrent requests share one provider call', async () => {
  let calls = 0
  const weather = createWeatherService({ fetchImpl: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 20)); return response(currentFixture) } })
  const [first, second] = await Promise.all([weather.current(), weather.current()])
  assert.equal(calls, 1)
  assert.deepEqual(first, second)
})

test('MET Norway takes over when Open-Meteo fails and receives an identifying User-Agent', async () => {
  const requests = []
  const weather = createWeatherService({ fetchImpl: async (url, options) => {
    requests.push({ url: new URL(url), headers: options.headers })
    return requests.at(-1).url.hostname === 'api.open-meteo.com' ? response({}, 503) : response(metFixture)
  } })
  const result = await weather.current()
  assert.equal(result.providers.name, 'MET Norway')
  assert.equal(result.current.temperature, 28)
  assert.equal(result.current.description, 'Light rain')
  const metRequest = requests.find(request => request.url.hostname === 'api.met.no')
  assert.ok(metRequest)
  assert.match(metRequest.headers['User-Agent'], /^BetterGetafePortal\/1\.0/)
})

test('configured OpenWeatherMap is the final forecast fallback', async () => {
  const hosts = []
  const weather = createWeatherService({ openWeatherApiKey: 'test-only-key', fetchImpl: async url => {
    const parsed = new URL(url)
    hosts.push(parsed.hostname)
    if (parsed.hostname !== 'api.openweathermap.org') return response({}, 503)
    assert.equal(parsed.searchParams.get('appid'), 'test-only-key')
    return response({ main: { temp: 27, feels_like: 31, humidity: 82, pressure: 1009 }, weather: [{ description: 'partly cloudy' }], wind: { speed: 2, deg: 90 }, dt: 1795852800 })
  } })
  const result = await weather.current()
  assert.deepEqual(hosts, ['api.open-meteo.com', 'api.open-meteo.com', 'api.met.no', 'api.met.no', 'api.openweathermap.org'])
  assert.equal(result.providers.name, 'OpenWeatherMap')
  assert.equal(result.current.temperature, 27)
  assert.equal(JSON.stringify(result).includes('test-only-key'), false)
})

test('stale weather is returned only within its bounded stale window', async () => {
  let clock = 1_800_000_000_000
  let fail = false
  const weather = createWeatherService({ now: () => clock, fetchImpl: async url => {
    if (fail) return response({}, 503)
    return response(new URL(url).hostname === 'api.open-meteo.com' ? currentFixture : metFixture)
  } })
  const fresh = await weather.current()
  clock += 6 * 60 * 1000
  fail = true
  const stale = await weather.current()
  assert.equal(stale.stale, true)
  assert.equal(stale.fetchedAt, fresh.fetchedAt)
  clock += 3 * 60 * 60 * 1000
  await assert.rejects(weather.current(), /temporarily unavailable/)
})

test('PAGASA CAP parser excludes expired, cancelled, and unbounded alerts', () => {
  const now = Date.parse('2026-11-28T08:00:00Z')
  const xml = `<feed>
    <alert><status>Actual</status><msgType>Alert</msgType><info><event>Tropical Cyclone Warning</event><headline>Active warning</headline><severity>Severe</severity><effective>2026-11-28T07:00:00Z</effective><expires>2026-11-28T10:00:00Z</expires><area><areaDesc>Getafe, Bohol</areaDesc></area></info></alert>
    <alert><status>Actual</status><msgType>Alert</msgType><info><headline>Expired warning</headline><expires>2026-11-28T07:00:00Z</expires></info></alert>
    <alert><status>Actual</status><msgType>Cancel</msgType><info><headline>Cancelled warning</headline><expires>2026-11-28T10:00:00Z</expires></info></alert>
    <alert><status>Actual</status><msgType>Alert</msgType><info><headline>No expiry</headline></info></alert>
  </feed>`
  const alerts = parsePagasaAlerts(xml, now)
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].headline, 'Active warning')
  assert.equal(alerts[0].official, true)
})

test('weather endpoints are public, cached, fixed-location, and independent of caller parameters', async () => {
  const calls = []
  const sample = { location: { name: 'Getafe, Bohol' }, current: { temperature: 29 }, daily: [], hourly: [], providers: { name: 'Open-Meteo', sources: ['Open-Meteo'] }, fetchedAt: 1 }
  const weather = { current: async () => { calls.push('current'); return sample }, hourly: async () => ({ hourly: [] }), forecast: async () => ({ daily: [] }), advisories: async () => ({ alerts: [], status: 'available' }) }
  const handler = createPublicWeatherHandler(weather)
  const result = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value }, end(body) { this.body = body } }
  assert.equal(await handler({ method: 'GET', url: '/api/public/weather/current?lat=0&lon=0&url=https://example.com' }, result), true)
  assert.equal(result.statusCode, 200)
  assert.match(result.headers['vercel-cdn-cache-control'], /s-maxage=300/)
  assert.equal(JSON.parse(result.body).location.name, 'Getafe, Bohol')
  assert.deepEqual(calls, ['current'])
})

test('weather paths reject mutating methods without initializing other services', async () => {
  const handler = createPublicWeatherHandler({})
  const result = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value }, end(body) { this.body = body } }
  assert.equal(await handler({ method: 'POST', url: '/api/public/weather/current' }, result), true)
  assert.equal(result.statusCode, 405)
  assert.equal(result.headers.allow, 'GET, HEAD')
})

test('provider outage returns a generic non-cacheable response; PAGASA is independently available', async () => {
  const unavailable = createPublicWeatherHandler({
    current: async () => { throw new Error('private provider details') },
  })
  const failed = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value }, end(body) { this.body = body } }
  await unavailable({ method: 'GET', url: '/api/public/weather/current' }, failed)
  assert.equal(failed.statusCode, 503)
  assert.match(failed.headers['cache-control'], /no-store/)
  assert.equal(failed.body.includes('private provider details'), false)

  const handler = createPublicWeatherHandler({ advisories: async () => ({ status: 'available', alerts: [], source: 'DOST-PAGASA' }) })
  const advisories = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value }, end(body) { this.body = body } }
  await handler({ method: 'GET', url: '/api/public/weather/advisories' }, advisories)
  assert.equal(advisories.statusCode, 200)
  assert.equal(JSON.parse(advisories.body).status, 'available')
  assert.match(advisories.headers['cache-control'], /s-maxage=60/)
  assert.doesNotMatch(advisories.headers['cache-control'], /stale-while-revalidate/)
})
