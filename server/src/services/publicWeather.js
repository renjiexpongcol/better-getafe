const GETAFE = Object.freeze({
  name: 'Getafe, Bohol', municipality: 'Getafe', province: 'Bohol', region: 'Central Visayas',
  country: 'Philippines', latitude: 10.1496, longitude: 124.1534, timezone: 'Asia/Manila',
})
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const MET_NORWAY = 'https://api.met.no/weatherapi/locationforecast/2.0/compact'
const PAGASA_FEED = 'https://publicalert.pagasa.dost.gov.ph/feeds/'
const PAGASA_HOME = 'https://bagong.pagasa.dost.gov.ph/'
const APP_USER_AGENT = 'BetterGetafePortal/1.0 (+https://better-getafe.vercel.app)'
const WEATHER_CODES = new Map([
  [0, ['Clear', 'Clear skies']], [1, ['Clouds', 'Mainly clear']], [2, ['Clouds', 'Partly cloudy']], [3, ['Clouds', 'Overcast']],
  [45, ['Mist', 'Fog']], [48, ['Mist', 'Depositing rime fog']], [51, ['Drizzle', 'Light drizzle']], [53, ['Drizzle', 'Drizzle']], [55, ['Drizzle', 'Heavy drizzle']],
  [56, ['Drizzle', 'Freezing drizzle']], [57, ['Drizzle', 'Heavy freezing drizzle']], [61, ['Rain', 'Light rain']], [63, ['Rain', 'Rain']], [65, ['Rain', 'Heavy rain']],
  [66, ['Rain', 'Freezing rain']], [67, ['Rain', 'Heavy freezing rain']], [71, ['Snow', 'Light snow']], [73, ['Snow', 'Snow']], [75, ['Snow', 'Heavy snow']],
  [77, ['Snow', 'Snow grains']], [80, ['Rain', 'Rain showers']], [81, ['Rain', 'Rain showers']], [82, ['Rain', 'Heavy rain showers']],
  [85, ['Snow', 'Snow showers']], [86, ['Snow', 'Heavy snow showers']], [95, ['Thunderstorm', 'Thunderstorm']], [96, ['Thunderstorm', 'Thunderstorm with hail']], [99, ['Thunderstorm', 'Heavy thunderstorm with hail']],
])
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null
const epoch = value => {
  const number = finite(value)
  if (number !== null) return number > 10_000_000_000 ? Math.floor(number / 1000) : Math.floor(number)
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
}
const description = code => WEATHER_CODES.get(Number(code)) || ['Clouds', 'Current conditions']
const codeFromText = value => {
  const text = String(value || '').toLowerCase()
  if (/thunder|storm/.test(text)) return 95
  if (/snow|sleet/.test(text)) return 71
  if (/drizzle/.test(text)) return 51
  if (/rain|shower/.test(text)) return 63
  if (/fog|mist/.test(text)) return 45
  if (/clear|sun/.test(text)) return 0
  if (/partly/.test(text)) return 2
  return 3
}
const compass = value => {
  const degree = finite(value)
  return degree === null ? null : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degree / 45) % 8]
}
const dateInManila = value => {
  const time = epoch(value)
  return time === null ? String(value || '').slice(0, 10) || null : new Intl.DateTimeFormat('en-CA', { timeZone: GETAFE.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time * 1000))
}
const cacheSeconds = Object.freeze({ current: 300, hourly: 900, forecast: 1800, advisories: 60 })
const staleSeconds = Object.freeze({ current: 2 * 60 * 60, hourly: 3 * 60 * 60, forecast: 8 * 60 * 60 })

function conditions(code) {
  const [condition, text] = description(code)
  return { condition, description: text, code: Number.isFinite(Number(code)) ? Number(code) : null }
}

function metadata(provider, fetchedAt, dataKind, location = GETAFE) {
  return {
    location,
    providers: { name: provider, sources: [provider], sourceCount: 1, type: dataKind },
    fetchedAt,
    stale: false,
  }
}

function normalizeOpenMeteo(source, kind, fetchedAt, location = GETAFE) {
  if (!source || typeof source !== 'object') throw new Error('Weather provider response is invalid.')
  const output = metadata('Open-Meteo', fetchedAt, 'model_forecast', location)
  if (kind === 'current') {
    const current = source.current || {}
    if (finite(current.temperature_2m) === null) throw new Error('Weather provider current values are missing.')
    const code = finite(current.weather_code)
    const hourIndex = Math.max(0, (source.hourly?.time || []).findIndex(time => epoch(time) >= epoch(current.time)))
    const probability = finite(source.hourly?.precipitation_probability?.[hourIndex])
    const day = (source.daily?.time || []).length ? source.daily : {}
    const weather = conditions(code)
    output.current = {
      temperature: finite(current.temperature_2m), feelsLike: finite(current.apparent_temperature), ...weather,
      isDay: current.is_day === 1 ? true : current.is_day === 0 ? false : null,
      cloudCover: finite(current.cloud_cover), humidity: finite(current.relative_humidity_2m), dewPoint: finite(current.dew_point_2m),
      pressure: finite(current.pressure_msl), surfacePressure: finite(current.surface_pressure), visibility: finite(current.visibility),
      uvIndex: finite(current.uv_index), windSpeed: finite(current.wind_speed_10m) === null ? null : finite(current.wind_speed_10m) / 3.6,
      windDirection: compass(current.wind_direction_10m), windDegrees: finite(current.wind_direction_10m),
      windGust: finite(current.wind_gusts_10m) === null ? null : finite(current.wind_gusts_10m) / 3.6,
      precipitation: finite(current.precipitation) ?? finite(current.rain) ?? finite(current.showers), rain: finite(current.rain),
      precipitationProbability: probability, sunrise: epoch(day.sunrise?.[0]), sunset: epoch(day.sunset?.[0]),
      observationTime: null, modelValidAt: epoch(current.time), lastUpdatedAt: fetchedAt,
      temperatureMin: finite(day.temperature_2m_min?.[0]), temperatureMax: finite(day.temperature_2m_max?.[0]),
    }
    return output
  }
  if (kind === 'hourly') {
    const hourly = source.hourly || {}
    if (!Array.isArray(hourly.time) || !hourly.time.length) throw new Error('Weather provider hourly values are missing.')
    output.hourly = hourly.time.slice(0, 24).map((time, index) => {
      const code = finite(hourly.weather_code?.[index])
      return {
        time: epoch(time), temperature: finite(hourly.temperature_2m?.[index]), feelsLike: finite(hourly.apparent_temperature?.[index]),
        humidity: finite(hourly.relative_humidity_2m?.[index]), dewPoint: finite(hourly.dew_point_2m?.[index]), ...conditions(code),
        isDay: hourly.is_day?.[index] === 1 ? true : hourly.is_day?.[index] === 0 ? false : null,
        precipitationProbability: finite(hourly.precipitation_probability?.[index]), precipitation: finite(hourly.precipitation?.[index]),
        rain: finite(hourly.rain?.[index]), cloudCover: finite(hourly.cloud_cover?.[index]), pressure: finite(hourly.pressure_msl?.[index]),
        visibility: finite(hourly.visibility?.[index]), uvIndex: finite(hourly.uv_index?.[index]),
        windSpeed: finite(hourly.wind_speed_10m?.[index]) === null ? null : finite(hourly.wind_speed_10m[index]) / 3.6,
        windDirection: compass(hourly.wind_direction_10m?.[index]), windDegrees: finite(hourly.wind_direction_10m?.[index]),
        windGust: finite(hourly.wind_gusts_10m?.[index]) === null ? null : finite(hourly.wind_gusts_10m[index]) / 3.6,
      }
    })
    return output
  }
  const daily = source.daily || {}
  if (!Array.isArray(daily.time) || !daily.time.length) throw new Error('Weather provider daily values are missing.')
  output.daily = daily.time.slice(0, 7).map((date, index) => ({
    date, ...conditions(daily.weather_code?.[index]), temperatureMax: finite(daily.temperature_2m_max?.[index]),
    temperatureMin: finite(daily.temperature_2m_min?.[index]), temperatureMean: finite(daily.temperature_2m_mean?.[index]),
    feelsLikeMax: finite(daily.apparent_temperature_max?.[index]), precipitationProbabilityMax: finite(daily.precipitation_probability_max?.[index]),
    precipitation: finite(daily.precipitation_sum?.[index]), rain: finite(daily.rain_sum?.[index]), windSpeedMax: finite(daily.wind_speed_10m_max?.[index]) === null ? null : finite(daily.wind_speed_10m_max[index]) / 3.6,
    windDirection: compass(daily.wind_direction_10m_dominant?.[index]), windDegrees: finite(daily.wind_direction_10m_dominant?.[index]),
    humidityMean: finite(daily.relative_humidity_2m_mean?.[index]), uvIndexMax: finite(daily.uv_index_max?.[index]),
    sunrise: epoch(daily.sunrise?.[index]), sunset: epoch(daily.sunset?.[index]), daylightDuration: finite(daily.daylight_duration?.[index]),
  }))
  return output
}

function metSymbolCode(value) {
  const symbol = String(value || '').toLowerCase().replace(/_(day|night|polartwilight)$/, '')
  if (symbol.includes('thunder')) return 95
  if (symbol.includes('snow') || symbol.includes('sleet')) return 71
  if (symbol.includes('fog')) return 45
  if (symbol.includes('drizzle')) return 51
  if (symbol.includes('heavyrain')) return 65
  if (symbol.includes('lightrain')) return 61
  if (symbol.includes('rain') || symbol.includes('shower')) return 63
  if (symbol.includes('clear')) return 0
  if (symbol.includes('partlycloudy')) return 2
  return 3
}

function normalizeMet(source, kind, fetchedAt, location = GETAFE) {
  const series = source?.properties?.timeseries
  if (!Array.isArray(series) || !series.length) throw new Error('Weather provider forecast is incomplete.')
  const points = series.map(item => {
    const details = item.data?.instant?.details || {}
    const next = item.data?.next_1_hours || item.data?.next_6_hours || item.data?.next_12_hours || {}
    const code = metSymbolCode(next.summary?.symbol_code)
    return {
      time: epoch(item.time), temperature: finite(details.air_temperature), feelsLike: finite(details.air_temperature),
      humidity: finite(details.relative_humidity), pressure: finite(details.air_pressure_at_sea_level),
      cloudCover: finite(details.cloud_area_fraction), uvIndex: finite(details.ultraviolet_index_clear_sky),
      windSpeed: finite(details.wind_speed), windDegrees: finite(details.wind_from_direction), windDirection: compass(details.wind_from_direction),
      precipitation: finite(next.details?.precipitation_amount), ...conditions(code), symbol: next.summary?.symbol_code,
    }
  }).filter(point => point.time !== null)
  const now = Math.floor(Date.now() / 1000)
  const currentPoint = [...points].reverse().find(point => point.time <= now) || points[0]
  const output = metadata('MET Norway', fetchedAt, 'model_forecast', location)
  if (kind === 'current') {
    if (currentPoint.temperature === null) throw new Error('Weather provider current values are missing.')
    output.current = { ...currentPoint, observationTime: null, modelValidAt: currentPoint.time, lastUpdatedAt: fetchedAt, isDay: null }
    return output
  }
  if (kind === 'hourly') {
    output.hourly = points.filter(point => point.time >= now - 3600).slice(0, 24).map(point => ({ ...point, precipitationProbability: null, isDay: null }))
    if (!output.hourly.length) throw new Error('Weather provider hourly values are missing.')
    return output
  }
  const days = new Map()
  for (const point of points) {
    const date = dateInManila(point.time)
    const day = days.get(date) || { date, values: [], conditionCounts: new Map(), precipitation: 0 }
    day.values.push(point)
    day.conditionCounts.set(point.code, (day.conditionCounts.get(point.code) || 0) + 1)
    day.precipitation += point.precipitation || 0
    days.set(date, day)
  }
  output.daily = [...days.values()].slice(0, 7).map(day => {
    const values = day.values.map(point => point.temperature).filter(value => value !== null)
    const code = [...day.conditionCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 3
    return { date: day.date, ...conditions(code), temperatureMax: values.length ? Math.max(...values) : null, temperatureMin: values.length ? Math.min(...values) : null, precipitation: day.precipitation }
  })
  if (!output.daily.length) throw new Error('Weather provider daily values are missing.')
  return output
}

function normalizeOpenWeather(source, kind, fetchedAt, location = GETAFE) {
  const output = metadata('OpenWeatherMap', fetchedAt, kind === 'current' ? 'provider_current' : 'model_forecast', location)
  if (kind === 'current') {
    if (finite(source?.main?.temp) === null) throw new Error('Weather provider current values are missing.')
    const code = codeFromText(source.weather?.[0]?.description)
    output.current = {
      temperature: finite(source.main.temp), feelsLike: finite(source.main.feels_like), ...conditions(code),
      humidity: finite(source.main.humidity), pressure: finite(source.main.pressure), cloudCover: finite(source.clouds?.all),
      windSpeed: finite(source.wind?.speed), windDirection: compass(source.wind?.deg), windDegrees: finite(source.wind?.deg),
      precipitation: finite(source.rain?.['1h']) ?? finite(source.snow?.['1h']), sunrise: epoch(source.sys?.sunrise), sunset: epoch(source.sys?.sunset),
      observationTime: epoch(source.dt), modelValidAt: null, lastUpdatedAt: fetchedAt,
    }
    return output
  }
  if (kind === 'hourly') {
    const items = (source?.list || []).slice(0, 8)
    if (!items.length) throw new Error('Weather provider hourly values are missing.')
    output.hourly = items.map(item => {
      const code = codeFromText(item.weather?.[0]?.description)
      return {
        time: epoch(item.dt), temperature: finite(item.main?.temp), feelsLike: finite(item.main?.feels_like), humidity: finite(item.main?.humidity),
        ...conditions(code), precipitationProbability: finite(item.pop) === null ? null : Number(item.pop) * 100,
        windSpeed: finite(item.wind?.speed), windDegrees: finite(item.wind?.deg), windDirection: compass(item.wind?.deg),
      }
    })
    return output
  }
  const grouped = new Map()
  for (const item of source?.list || []) {
    const date = dateInManila(item.dt)
    const day = grouped.get(date) || { date, highs: [], lows: [], rain: [], codes: new Map() }
    if (finite(item.main?.temp_max ?? item.main?.temp) !== null) day.highs.push(finite(item.main?.temp_max ?? item.main?.temp))
    if (finite(item.main?.temp_min ?? item.main?.temp) !== null) day.lows.push(finite(item.main?.temp_min ?? item.main?.temp))
    if (finite(item.pop) !== null) day.rain.push(Number(item.pop) * 100)
    const code = codeFromText(item.weather?.[0]?.description)
    day.codes.set(code, (day.codes.get(code) || 0) + 1)
    grouped.set(date, day)
  }
  output.daily = [...grouped.values()].slice(0, 5).map(day => {
    const code = [...day.codes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 3
    return { date: day.date, ...conditions(code), temperatureMax: day.highs.length ? Math.max(...day.highs) : null, temperatureMin: day.lows.length ? Math.min(...day.lows) : null, precipitationProbabilityMax: day.rain.length ? Math.max(...day.rain) : null }
  })
  if (!output.daily.length) throw new Error('Weather provider daily values are missing.')
  return output
}

function openMeteoUrl(kind, location = GETAFE) {
  const query = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), timezone: location.timezone || GETAFE.timezone, timeformat: 'unixtime', temperature_unit: 'celsius', wind_speed_unit: 'kmh' })
  if (kind === 'current') {
    query.set('forecast_days', '1')
    query.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,weather_code,is_day,cloud_cover,visibility,uv_index,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,rain,showers,pressure_msl,surface_pressure')
    query.set('hourly', 'precipitation_probability')
    query.set('daily', 'temperature_2m_min,temperature_2m_max,sunrise,sunset')
  } else if (kind === 'hourly') {
    query.set('forecast_hours', '24')
    query.set('hourly', 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,rain,weather_code,is_day,cloud_cover,pressure_msl,visibility,uv_index,wind_speed_10m,wind_direction_10m,wind_gusts_10m')
  } else {
    query.set('forecast_days', '7')
    query.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,apparent_temperature_max,precipitation_probability_max,precipitation_sum,rain_sum,wind_speed_10m_max,wind_direction_10m_dominant,relative_humidity_2m_mean,uv_index_max,sunrise,sunset,daylight_duration')
  }
  return `${OPEN_METEO}?${query}`
}

function metUrl(location = GETAFE) {
  const url = new URL(MET_NORWAY)
  url.searchParams.set('lat', String(location.latitude))
  url.searchParams.set('lon', String(location.longitude))
  return url.toString()
}

async function responseJson(fetchImpl, value, headers = {}) {
  const url = new URL(value)
  const allowed = url.hostname === 'api.open-meteo.com' || url.hostname === 'api.met.no' || url.hostname === 'api.openweathermap.org' || url.hostname === 'publicalert.pagasa.dost.gov.ph'
  if (url.protocol !== 'https:' || !allowed) throw new Error('Weather provider destination is not allowed.')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': APP_USER_AGENT, ...headers }, signal: AbortSignal.timeout(6000), redirect: 'error' })
      if (!response.ok) {
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) { await new Promise(resolve => setTimeout(resolve, 200)); continue }
        throw new Error('Weather provider is temporarily unavailable.')
      }
      const body = await response.text()
      if (body.length > 1_000_000) throw new Error('Weather provider response is too large.')
      return JSON.parse(body)
    } catch (error) {
      if (attempt === 0 && error?.name !== 'SyntaxError' && error?.message !== 'Weather provider response is too large.') { await new Promise(resolve => setTimeout(resolve, 200)); continue }
      throw error
    }
  }
  throw new Error('Weather provider is temporarily unavailable.')
}

function capValue(xml, name) {
  const tag = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = String(xml).match(new RegExp(`<(?:(?:[A-Za-z0-9_-]+):)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[A-Za-z0-9_-]+):)?${tag}\\s*>`, 'i'))
  if (!match) return ''
  return match[1].replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_all, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_all, n) => String.fromCodePoint(parseInt(n, 16))).replace(/\s+/g, ' ').trim()
}

export function parsePagasaAlerts(xml, now = Date.now()) {
  const alerts = []
  for (const match of String(xml).matchAll(/<(?:[A-Za-z0-9_-]+:)?alert(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?alert\s*>/gi)) {
    const item = match[1]
    const status = capValue(item, 'status')
    const messageType = capValue(item, 'msgType')
    const expires = epoch(capValue(item, 'expires'))
    const effective = epoch(capValue(item, 'effective'))
    if (status && status.toLowerCase() !== 'actual') continue
    if (['cancel', 'ack'].includes(messageType.toLowerCase())) continue
    if (expires === null || expires * 1000 <= now || (effective !== null && effective * 1000 > now + 24 * 60 * 60 * 1000)) continue
    const info = item.match(/<(?:[A-Za-z0-9_-]+:)?info(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?info\s*>/i)?.[1] || item
    const headline = capValue(info, 'headline') || capValue(info, 'event')
    if (!headline) continue
    alerts.push({
      type: capValue(info, 'event') || 'PAGASA advisory', severity: capValue(info, 'severity') || null,
      urgency: capValue(info, 'urgency') || null, certainty: capValue(info, 'certainty') || null,
      headline, description: capValue(info, 'description') || null, instructions: capValue(info, 'instruction') || null,
      effective, expires, areas: capValue(info, 'areaDesc') || null, source: 'DOST-PAGASA', official: true,
      web: PAGASA_HOME,
    })
  }
  return alerts.sort((a, b) => (a.expires || 0) - (b.expires || 0)).slice(0, 30)
}

export function createWeatherService({ fetchImpl = globalThis.fetch, openWeatherApiKey = process.env.OPENWEATHERMAP_API_KEY || process.env.OPENWEATHER_API_KEY || '', now = () => Date.now(), location = GETAFE } = {}) {
  const latitude = finite(location?.latitude)
  const longitude = finite(location?.longitude)
  if (latitude === null || latitude < -90 || latitude > 90 || longitude === null || longitude < -180 || longitude > 180) throw new Error('Weather location coordinates are invalid.')
  const fixedLocation = Object.freeze({ ...GETAFE, ...location, latitude, longitude, timezone: GETAFE.timezone })
  const cache = new Map()
  const inflight = new Map()
  let advisoriesCache = null
  let advisoriesCacheAt = 0
  let advisoriesInFlight = null

  async function fetchProvider(kind) {
    const fetchedAt = Math.floor(now() / 1000)
    try { return normalizeOpenMeteo(await responseJson(fetchImpl, openMeteoUrl(kind, fixedLocation)), kind, fetchedAt, fixedLocation) }
    catch { /* Continue to the global secondary provider. */ }
    try { return normalizeMet(await responseJson(fetchImpl, metUrl(fixedLocation), { Accept: 'application/json' }), kind, fetchedAt, fixedLocation) }
    catch { /* Continue to an explicitly configured provider. */ }
    if (openWeatherApiKey) {
      try {
        const url = new URL(`https://api.openweathermap.org/data/2.5/${kind === 'current' ? 'weather' : 'forecast'}`)
        url.searchParams.set('lat', String(fixedLocation.latitude)); url.searchParams.set('lon', String(fixedLocation.longitude))
        url.searchParams.set('units', 'metric'); url.searchParams.set('appid', openWeatherApiKey)
        return normalizeOpenWeather(await responseJson(fetchImpl, url.toString()), kind, fetchedAt, fixedLocation)
      } catch { /* Report a generic provider outage without disclosing credentials. */ }
    }
    throw new Error('Weather providers are temporarily unavailable.')
  }

  function resource(kind, { allowStale = true } = {}) {
    const key = `${fixedLocation.latitude},${fixedLocation.longitude}:${kind}`
    const current = cache.get(key)
    if (current && now() - current.cachedAt < cacheSeconds[kind] * 1000) return Promise.resolve(current.value)
    if (inflight.has(key)) return inflight.get(key)
    const pending = fetchProvider(kind).then(value => {
      value.stale = false
      cache.set(key, { value, cachedAt: now() })
      return value
    }).catch(error => {
      if (allowStale && current && now() - current.cachedAt <= staleSeconds[kind] * 1000) {
        return { ...current.value, stale: true, staleSince: current.value.fetchedAt }
      }
      throw error
    }).finally(() => inflight.delete(key))
    inflight.set(key, pending)
    return pending
  }

  function advisories() {
    if (advisoriesCache && now() - advisoriesCacheAt < cacheSeconds.advisories * 1000) {
      return Promise.resolve({ ...advisoriesCache, alerts: advisoriesCache.alerts.filter(alert => alert.expires > Math.floor(now() / 1000)) })
    }
    if (advisoriesInFlight) return advisoriesInFlight
    advisoriesInFlight = (async () => {
      try {
        const response = await fetchImpl(PAGASA_FEED, { headers: { Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml', 'User-Agent': APP_USER_AGENT }, signal: AbortSignal.timeout(5000), redirect: 'error' })
        if (!response.ok) throw new Error('PAGASA feed is unavailable.')
        const xml = await response.text()
        if (xml.length > 500_000 || !/<(?:[A-Za-z0-9_-]+:)?(?:alert|rss|feed)\b/i.test(xml)) throw new Error('PAGASA feed response is invalid.')
        const data = { status: 'available', source: 'DOST-PAGASA', officialUrl: PAGASA_HOME, alerts: parsePagasaAlerts(xml, now()), fetchedAt: Math.floor(now() / 1000), stale: false }
        advisoriesCache = data
        advisoriesCacheAt = now()
        return data
      } catch {
        return { status: 'unavailable', source: 'DOST-PAGASA', officialUrl: PAGASA_HOME, alerts: [], fetchedAt: null, stale: false }
      }
    })().finally(() => { advisoriesInFlight = null })
    return advisoriesInFlight
  }

  return Object.freeze({ current: () => resource('current'), hourly: () => resource('hourly'), forecast: () => resource('forecast'), advisories })
}

export const isPublicWeatherPath = pathname => [
  '/api/weather', '/api/weather/getafe', '/api/weather/forecast',
  '/api/public/weather/current', '/api/public/weather/forecast', '/api/public/weather/hourly', '/api/public/weather/advisories',
].includes(String(pathname || '').split('?')[0])

const service = createWeatherService()
export const publicWeatherService = service
const cacheHeaders = Object.freeze({
  current: 'public, max-age=0, s-maxage=300, stale-while-revalidate=600, stale-if-error=3600',
  hourly: 'public, max-age=0, s-maxage=900, stale-while-revalidate=1800, stale-if-error=10800',
  forecast: 'public, max-age=0, s-maxage=1800, stale-while-revalidate=3600, stale-if-error=28800',
  // Advisories are returned only while unexpired; never let a shared cache
  // serve an old warning beyond its short explicit freshness window.
  advisories: 'public, max-age=0, s-maxage=60',
})

function setCacheHeaders(res, kind) {
  const value = cacheHeaders[kind]
  res.setHeader('Cache-Control', value)
  res.setHeader('Vercel-CDN-Cache-Control', value)
}

export function weatherHeaderSummary(data) {
  const current = data.current || {}
  return {
    provider: data.providers?.name || 'Weather provider', sources: data.providers?.sources || [], sourceCount: data.providers?.sourceCount || 1,
    location: GETAFE.name, temperature: current.temperature, feelsLike: current.feelsLike, humidity: current.humidity,
    wind: current.windSpeed === null || current.windSpeed === undefined ? null : current.windSpeed * 3.6,
    description: current.description || 'Current conditions', code: current.code, isDay: current.isDay,
    rainChance: current.precipitationProbability, updatedAt: current.modelValidAt || current.observationTime || data.fetchedAt,
    fetchedAt: data.fetchedAt, stale: data.stale,
  }
}

export function createPublicWeatherHandler(weatherService = service) {
  return async function publicWeatherHandler(req, res) {
    const pathname = String(req.url || req.originalUrl || '/').split('?')[0]
    if (!isPublicWeatherPath(pathname)) return false
    res.setHeader('Vary', 'Accept-Encoding')
    if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) {
      res.setHeader('Allow', 'GET, HEAD')
      res.statusCode = 405
      res.setHeader('Cache-Control', 'no-store')
      res.end()
      return true
    }
    const resourceName = pathname.endsWith('/advisories') ? 'advisories'
      : pathname.endsWith('/hourly') ? 'hourly'
        : pathname.endsWith('/forecast') ? 'forecast' : 'current'
    // The legacy combined endpoint contains official advisories, so give it
    // the same short freshness window as the dedicated advisory endpoint.
    setCacheHeaders(res, pathname === '/api/weather' ? 'advisories' : resourceName)
    try {
      if (pathname === '/api/weather/getafe') {
        const data = weatherHeaderSummary(await weatherService.current())
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data))
        return true
      }
      if (pathname === '/api/public/weather/current') {
        const data = await weatherService.current()
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data)); return true
      }
      if (pathname === '/api/public/weather/hourly') {
        const data = await weatherService.hourly()
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data)); return true
      }
      if (pathname === '/api/public/weather/forecast' || pathname === '/api/weather/forecast') {
        const data = await weatherService.forecast()
        if (pathname === '/api/weather/forecast') data.forecast = data.daily
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data)); return true
      }
      if (pathname === '/api/public/weather/advisories') {
        const data = await weatherService.advisories()
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data)); return true
      }
      const [current, hourly, forecast, advisories] = await Promise.all([
        weatherService.current(), weatherService.hourly(), weatherService.forecast(), weatherService.advisories(),
      ])
      const combined = { ...current, hourly: hourly.hourly, daily: forecast.daily, alerts: advisories.alerts, advisories, providers: { ...current.providers, sources: [...new Set([current.providers?.name, hourly.providers?.name, forecast.providers?.name].filter(Boolean))] }, stale: current.stale || hourly.stale || forecast.stale }
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify([combined]))
    } catch {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Vercel-CDN-Cache-Control', 'no-store')
      res.statusCode = 503
      res.setHeader('Retry-After', '60')
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ code: 'WEATHER_TEMPORARILY_UNAVAILABLE', error: 'Weather providers are currently unreachable. Other municipal services remain available.', stale: false }))
    }
    return true
  }
}

export const publicWeatherHandler = createPublicWeatherHandler()
