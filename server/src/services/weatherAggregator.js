import { cacheService } from './cacheService.js'
import { isRedisReady } from '../infrastructure/redis/redisClient.js'
import { withRedisLock } from './redisInfrastructure.js'

const CACHE_MS = 15 * 60 * 1000
const ACCU_LOCATION_CACHE_MS = 24 * 60 * 60 * 1000
const CURRENT_CACHE_GROUP = 'weather-current'
const CURRENT_CACHE_TTL_SECONDS = 15 * 60
const FORECAST_CACHE_TTL_SECONDS = 8 * 24 * 60 * 60
const FORECAST_LOCK_TTL_MS = 60 * 1000
const FORECAST_CACHE_GROUP = 'weather-forecast'

const OPEN_METEO_MODELS = [
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS' },
  { id: 'gfs_seamless', label: 'NOAA GFS' },
  { id: 'icon_seamless', label: 'DWD ICON' },
  { id: 'jma_seamless', label: 'JMA' },
]

const currentCache = new Map()
const currentInFlight = new Map()
const forecastCache = new Map()
const accuLocationCache = new Map()
const forecastInFlight = new Map()

function finite(value) {
  if (value === null || value === undefined || value === '') return null
  return Number.isFinite(Number(value)) ? Number(value) : null
}

function median(values) {
  const numbers = values.map(finite).filter(value => value !== null).sort((a, b) => a - b)
  if (!numbers.length) return null
  const middle = Math.floor(numbers.length / 2)
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2
}

function timestamp(value) {
  const number = finite(value)
  if (number !== null) return number
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000)
}

function requestHeaders(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } : { Accept: 'application/json' }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`Weather provider returned ${response.status}.`)
  return response.json()
}

export function providerKeys(values = {}) {
  return {
    openWeatherApiKey: String(values.openWeatherApiKey || process.env.OPENWEATHER_API_KEY || '').trim(),
    accuWeatherApiKey: String(values.accuWeatherApiKey || process.env.ACCUWEATHER_API_KEY || '').trim(),
  }
}

export function weatherDescription(code) {
  const value = Number(code)
  if (value === 0) return 'Clear skies'
  if ([1, 2].includes(value)) return 'Partly cloudy'
  if (value === 3) return 'Overcast'
  if ([45, 48].includes(value)) return 'Foggy'
  if ([51, 53, 55, 56, 57].includes(value)) return 'Drizzle'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return 'Rain'
  if ([71, 73, 75, 77, 85, 86].includes(value)) return 'Snow'
  if ([95, 96, 99].includes(value)) return 'Thunderstorms'
  return 'Current conditions'
}

function weatherMainFromText(value) {
  const text = String(value || '').toLowerCase()
  if (text.includes('thunder') || text.includes('storm')) return 'Thunderstorm'
  if (text.includes('snow') || text.includes('frost')) return 'Snow'
  if (text.includes('rain') || text.includes('drizzle') || text.includes('shower')) return 'Rain'
  if (text.includes('clear') || text.includes('sun')) return 'Clear'
  if (text.includes('fog') || text.includes('mist') || text.includes('haze')) return 'Mist'
  return 'Clouds'
}

function weatherCodeFromText(value) {
  const text = String(value || '').toLowerCase()
  if (text.includes('thunder') || text.includes('storm')) return 95
  if (text.includes('snow') || text.includes('frost')) return 71
  if (text.includes('drizzle')) return 51
  if (text.includes('rain') || text.includes('shower')) return 63
  if (text.includes('clear') || text.includes('sun')) return 0
  if (text.includes('fog') || text.includes('mist') || text.includes('haze')) return 45
  if (text.includes('partly')) return 2
  return 3
}

function precipitationTypeFromCode(code) {
  const value = Number(code)
  if ([56, 57, 66, 67].includes(value)) return 'Freezing rain'
  if ([71, 73, 75, 77, 85, 86].includes(value)) return 'Snow'
  if ([96, 99].includes(value)) return 'Hail'
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(value)) return 'Rain'
  return null
}

function normaliseOpenWeather(source, location) {
  const item = { ...source, name: location.name, _provider: 'OpenWeather' }
  const description = source.weather?.[0]?.description || 'Current conditions'
  item._weatherCode = weatherCodeFromText(description)
  item.coord = source.coord || { lat: location.lat, lon: location.lon }
  item.cloudCover = finite(source.clouds?.all)
  item.precipitation = finite(source.rain?.['1h']) ?? finite(source.snow?.['1h']) ?? finite(source.rain?.['3h']) ?? finite(source.snow?.['3h'])
  item.uvIndex = finite(source.uvi)
  item.dewPoint = finite(source.dew_point)
  item.precipitationType = precipitationTypeFromCode(item._weatherCode)
  item.timezone = location.timezone || 'Asia/Manila'
  item._isDay = /d$/i.test(source.weather?.[0]?.icon || '') ? true : /n$/i.test(source.weather?.[0]?.icon || '') ? false : undefined
  return item
}

async function fetchOpenWeatherCurrent(location, apiKey) {
  if (!apiKey) return null
  const query = new URLSearchParams({ lat: String(location.lat), lon: String(location.lon), units: 'metric', appid: apiKey })
  return normaliseOpenWeather(await fetchJson(`https://api.openweathermap.org/data/2.5/weather?${query}`), location)
}

function normaliseOpenMeteo(source, location, provider) {
  const current = source.current
  if (!current || !Number.isFinite(Number(current.temperature_2m))) throw new Error('Open-Meteo current data is incomplete.')
  const daily = source.daily || {}
  const description = weatherDescription(current.weather_code)
  const rainfall = finite(current.rain) ?? finite(current.showers)
  const precipitation = finite(current.precipitation) ?? rainfall
  const hourly = source.hourly || {}
  const currentHour = Math.max(0, hourly.time?.findIndex(time => timestamp(time) >= timestamp(current.time)) ?? 0)
  const nextHour = hourly.time?.findIndex(time => timestamp(time) > timestamp(current.time)) ?? -1
  const hourlyForecast = (hourly.time || []).map((time, index) => ({
    time: timestamp(time),
    temperature: finite(hourly.temperature_2m?.[index]),
    feelsLike: finite(hourly.apparent_temperature?.[index]),
    humidity: finite(hourly.relative_humidity_2m?.[index]),
    dewPoint: finite(hourly.dew_point_2m?.[index]),
    precipitationProbability: finite(hourly.precipitation_probability?.[index]),
    precipitation: finite(hourly.precipitation?.[index]),
    rain: finite(hourly.rain?.[index]),
    snow: finite(hourly.snowfall?.[index]) === null ? null : finite(hourly.snowfall[index]) * 10,
    condition: weatherDescription(hourly.weather_code?.[index]),
    precipitationType: precipitationTypeFromCode(hourly.weather_code?.[index]),
    code: finite(hourly.weather_code?.[index]),
    isDay: hourly.is_day?.[index] === 1 ? true : hourly.is_day?.[index] === 0 ? false : null,
    cloudCover: finite(hourly.cloud_cover?.[index]),
    pressure: finite(hourly.pressure_msl?.[index]),
    visibility: finite(hourly.visibility?.[index]),
    uvIndex: finite(hourly.uv_index?.[index]),
    windSpeed: finite(hourly.wind_speed_10m?.[index]) === null ? null : finite(hourly.wind_speed_10m[index]) / 3.6,
    windDirection: finite(hourly.wind_direction_10m?.[index]),
    windGust: finite(hourly.wind_gusts_10m?.[index]) === null ? null : finite(hourly.wind_gusts_10m[index]) / 3.6,
  })).filter(hour => hour.time > timestamp(current.time))
  const dailyForecast = (daily.time || []).map((date, index) => ({
    date: dateInManila(date),
    condition: weatherDescription(daily.weather_code?.[index]),
    code: finite(daily.weather_code?.[index]),
    temperatureMax: finite(daily.temperature_2m_max?.[index]),
    temperatureMin: finite(daily.temperature_2m_min?.[index]),
    temperatureMean: finite(daily.temperature_2m_mean?.[index]),
    feelsLikeMax: finite(daily.apparent_temperature_max?.[index]),
    precipitationProbabilityMax: finite(daily.precipitation_probability_max?.[index]),
    precipitation: finite(daily.precipitation_sum?.[index]),
    rain: finite(daily.rain_sum?.[index]),
    snow: finite(daily.snowfall_sum?.[index]) === null ? null : finite(daily.snowfall_sum[index]) * 10,
    windSpeedMax: finite(daily.wind_speed_10m_max?.[index]) === null ? null : finite(daily.wind_speed_10m_max[index]) / 3.6,
    windGustMax: finite(daily.wind_gusts_10m_max?.[index]) === null ? null : finite(daily.wind_gusts_10m_max[index]) / 3.6,
    humidityMean: finite(daily.relative_humidity_2m_mean?.[index]),
    cloudCoverMean: finite(daily.cloud_cover_mean?.[index]),
    visibilityMean: finite(daily.visibility_mean?.[index]),
    windDirection: finite(daily.wind_direction_10m_dominant?.[index]),
    uvIndexMax: finite(daily.uv_index_max?.[index]),
    sunrise: daily.sunrise?.[index] ? timestamp(daily.sunrise[index]) : null,
    sunset: daily.sunset?.[index] ? timestamp(daily.sunset[index]) : null,
    daylightDuration: finite(daily.daylight_duration?.[index]),
    moonrise: daily.moonrise?.[index] ? timestamp(daily.moonrise[index]) : null,
    moonset: daily.moonset?.[index] ? timestamp(daily.moonset[index]) : null,
    moonPhase: finite(daily.moon_phase?.[index]),
  }))
  return {
    name: location.name,
    coord: { lat: location.lat, lon: location.lon },
    dt: timestamp(current.time),
    main: {
      temp: finite(current.temperature_2m),
      feels_like: finite(current.apparent_temperature),
      humidity: finite(current.relative_humidity_2m),
      pressure: finite(current.pressure_msl),
      temp_min: finite(daily.temperature_2m_min?.[0]) ?? finite(current.temperature_2m),
      temp_max: finite(daily.temperature_2m_max?.[0]) ?? finite(current.temperature_2m),
    },
    weather: [{ main: weatherMainFromText(description), description, icon: null }],
    wind: { speed: finite(current.wind_speed_10m) === null ? null : finite(current.wind_speed_10m) / 3.6, deg: finite(current.wind_direction_10m), gust: finite(current.wind_gusts_10m) === null ? null : finite(current.wind_gusts_10m) / 3.6 },
    rain: rainfall === null ? undefined : { '1h': rainfall },
    snow: finite(current.snowfall) === null ? undefined : { '1h': finite(current.snowfall) * 10 },
    precipitation,
    precipitationType: precipitationTypeFromCode(current.weather_code),
    cloudCover: finite(current.cloud_cover),
    surfacePressure: finite(current.surface_pressure),
    visibility: finite(current.visibility) ?? finite(hourly.visibility?.[currentHour]),
    uvIndex: finite(current.uv_index) ?? finite(hourly.uv_index?.[currentHour]),
    dewPoint: finite(current.dew_point_2m) ?? finite(hourly.dew_point_2m?.[currentHour]),
    hourly: hourlyForecast,
    daily: dailyForecast,
    timezone: source.timezone || location.timezone || 'Asia/Manila',
    sys: { sunrise: dailyForecast[0]?.sunrise || null, sunset: dailyForecast[0]?.sunset || null },
    _provider: provider,
    _weatherCode: Number(current.weather_code),
    _isDay: current.is_day === 1 ? true : current.is_day === 0 ? false : undefined,
    rainChance: nextHour >= 0 ? finite(hourly.precipitation_probability?.[nextHour]) : null,
    rainUntil: nextHour >= 0 ? timestamp(hourly.time[nextHour]) : null,
  }
}

async function fetchOpenMeteoCurrent(location, model) {
  const query = new URLSearchParams({
    latitude: String(location.lat), longitude: String(location.lon), timezone: 'Asia/Manila',
    models: model.id, forecast_days: '5', forecast_hours: '24', timeformat: 'unixtime',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,weather_code,is_day,cloud_cover,visibility,uv_index,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,rain,showers,snowfall,pressure_msl,surface_pressure',
    hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,rain,snowfall,weather_code,is_day,cloud_cover,pressure_msl,visibility,uv_index,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,apparent_temperature_max,precipitation_probability_max,precipitation_sum,rain_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,relative_humidity_2m_mean,cloud_cover_mean,visibility_mean,uv_index_max,sunrise,sunset,daylight_duration,moonrise,moonset,moon_phase',
    temperature_unit: 'celsius', wind_speed_unit: 'kmh',
  })
  return normaliseOpenMeteo(await fetchJson(`https://api.open-meteo.com/v1/forecast?${query}`), location, model.label)
}

async function getAccuLocationKey(location, apiKey) {
  const cacheKey = `${location.lat.toFixed(4)},${location.lon.toFixed(4)}`
  const cached = accuLocationCache.get(cacheKey)
  if (cached && Date.now() - cached.at < ACCU_LOCATION_CACHE_MS) return cached.key
  const query = new URLSearchParams({ apikey: apiKey, q: `${location.lat},${location.lon}` })
  const results = await fetchJson(`https://dataservice.accuweather.com/locations/v1/cities/geoposition/search?${query}`, { headers: requestHeaders(apiKey) })
  const key = results?.Key
  if (!key) throw new Error('AccuWeather did not return a location key.')
  accuLocationCache.set(cacheKey, { at: Date.now(), key })
  return key
}

async function fetchAccuWeatherCurrent(location, apiKey) {
  if (!apiKey) return null
  const locationKey = await getAccuLocationKey(location, apiKey)
  const query = new URLSearchParams({ apikey: apiKey, language: 'en-us', details: 'true' })
  const source = (await fetchJson(`https://dataservice.accuweather.com/currentconditions/v1/${encodeURIComponent(locationKey)}?${query}`, { headers: requestHeaders(apiKey) }))?.[0]
  if (!source) throw new Error('AccuWeather returned no current conditions.')
  const description = source.WeatherText || 'Current conditions'
  const temperature = finite(source.Temperature?.Metric?.Value)
  if (temperature === null) throw new Error('AccuWeather current data is incomplete.')
  const windKmh = finite(source.Wind?.Speed?.Metric?.Value)
  const precipitation = finite(source.PrecipitationSummary?.Precipitation?.Metric?.Value)
  const visibility = finite(source.Visibility?.Metric?.Value)
  const windGust = finite(source.WindGusts?.Speed?.Metric?.Value)
  return {
    name: location.name,
    coord: { lat: location.lat, lon: location.lon },
    dt: timestamp(source.EpochTime || source.LocalObservationDateTime),
    main: { temp: temperature, feels_like: finite(source.RealFeelTemperature?.Metric?.Value) ?? temperature, humidity: finite(source.RelativeHumidity), pressure: finite(source.Pressure?.Metric?.Value), temp_min: temperature, temp_max: temperature },
    weather: [{ main: weatherMainFromText(description), description, icon: null }],
    wind: { speed: windKmh === null ? null : windKmh / 3.6, deg: finite(source.Wind?.Direction?.Degrees), gust: windGust === null ? null : windGust / 3.6 },
    rain: precipitation === null ? undefined : { '1h': precipitation },
    precipitation,
    cloudCover: finite(source.CloudCover),
    visibility: visibility === null ? null : visibility * 1000,
    uvIndex: finite(source.UVIndex),
    dewPoint: finite(source.DewPoint?.Metric?.Value),
    precipitationType: precipitationTypeFromCode(weatherCodeFromText(description)),
    timezone: location.timezone || 'Asia/Manila',
    sys: { sunrise: null, sunset: null },
    _provider: 'AccuWeather',
    _weatherCode: weatherCodeFromText(description),
    _isDay: Boolean(source.IsDayTime),
  }
}

function conditionGroup(item) {
  const text = `${item.weather?.[0]?.main || ''} ${item.weather?.[0]?.description || ''}`.toLowerCase()
  if (text.includes('thunder') || text.includes('storm')) return 'storm'
  if (text.includes('rain') || text.includes('drizzle') || text.includes('shower')) return 'rain'
  if (text.includes('snow') || text.includes('frost')) return 'snow'
  if (text.includes('clear') || text.includes('sun')) return 'clear'
  return 'clouds'
}

function chooseConsensus(samples) {
  const counts = new Map()
  for (const sample of samples) counts.set(conditionGroup(sample), (counts.get(conditionGroup(sample)) || 0) + 1)
  const order = ['storm', 'rain', 'snow', 'clear', 'clouds']
  const winner = order.reduce((best, group) => (counts.get(group) || 0) > (counts.get(best) || 0) ? group : best, 'clouds')
  return samples.find(sample => conditionGroup(sample) === winner) || samples[0]
}

const HOURLY_METRICS = ['temperature', 'feelsLike', 'humidity', 'dewPoint', 'precipitationProbability', 'precipitation', 'rain', 'snow', 'cloudCover', 'pressure', 'visibility', 'uvIndex', 'windSpeed', 'windDirection', 'windGust']
const DAILY_METRICS = ['temperatureMax', 'temperatureMin', 'temperatureMean', 'feelsLikeMax', 'precipitationProbabilityMax', 'precipitation', 'rain', 'snow', 'windSpeedMax', 'windGustMax', 'humidityMean', 'cloudCoverMean', 'visibilityMean', 'uvIndexMax', 'daylightDuration', 'moonPhase', 'windDirection']

function averageDirection(values) {
  const numbers = values.map(finite).filter(value => value !== null)
  if (!numbers.length) return null
  const radians = numbers.map(value => value * Math.PI / 180)
  const east = radians.reduce((sum, value) => sum + Math.sin(value), 0)
  const north = radians.reduce((sum, value) => sum + Math.cos(value), 0)
  return (Math.atan2(east, north) * 180 / Math.PI + 360) % 360
}

function mergeWeatherTimeline(samples, property, keyField, metrics) {
  const byKey = new Map()
  for (const sample of samples) {
    for (const item of sample[property] || []) {
      const values = byKey.get(item[keyField]) || []
      values.push(item)
      byKey.set(item[keyField], values)
    }
  }
  return [...byKey.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, values]) => {
    const representative = chooseConsensus(values.map(value => ({ weather: [{ main: weatherMainFromText(value.condition), description: value.condition }], _weatherCode: value.code, _provider: '' })))
    const result = { [keyField]: key, condition: representative.weather?.[0]?.description || 'Current conditions' }
    for (const metric of metrics) result[metric] = metric === 'windDirection' ? averageDirection(values.map(value => value[metric])) : median(values.map(value => value[metric]))
    if (representative._weatherCode !== undefined) result.code = representative._weatherCode
    result.precipitationType = precipitationTypeFromCode(representative._weatherCode)
    const first = values.find(value => typeof value.isDay === 'boolean')
    if (first) result.isDay = first.isDay
    for (const field of ['sunrise', 'sunset', 'moonrise', 'moonset']) {
      const numeric = median(values.map(value => value[field]))
      if (numeric !== null) result[field] = numeric
    }
    return result
  })
}

function mergeCurrent(samples, location) {
  const primary = samples.find(sample => sample._provider === 'OpenWeather') || samples.find(sample => sample._provider === 'AccuWeather') || samples[0]
  const condition = chooseConsensus(samples)
  const rainValues = samples.map(sample => sample.rain?.['1h']).filter(value => finite(value) !== null)
  const sunrise = primary.sys?.sunrise || samples.find(sample => sample.sys?.sunrise)?.sys?.sunrise || null
  const sunset = primary.sys?.sunset || samples.find(sample => sample.sys?.sunset)?.sys?.sunset || null
  const sources = [...new Set(samples.map(sample => sample._provider))]
  const isDay = samples.find(sample => sample._isDay !== undefined)?._isDay
  const hourly = mergeWeatherTimeline(samples, 'hourly', 'time', HOURLY_METRICS)
  const daily = mergeWeatherTimeline(samples, 'daily', 'date', DAILY_METRICS)
  const snowValues = samples.map(sample => sample.snow?.['1h'] ?? sample.snow?.['3h']).filter(value => finite(value) !== null)
  const precipitationValues = samples.map(sample => sample.precipitation ?? sample.rain?.['1h'] ?? sample.snow?.['1h']).filter(value => finite(value) !== null)
  const providerAlerts = samples.flatMap(sample => Array.isArray(sample.alerts) ? sample.alerts : [])
  const alerts = [...new Map(providerAlerts.map(alert => [`${alert.event || alert.headline || ''}:${alert.start || alert.effective || ''}:${alert.sender_name || alert.source || ''}`, alert])).values()]
  return {
    ...primary,
    name: location.name,
    coord: primary.coord || { lat: location.lat, lon: location.lon },
    dt: Math.max(...samples.map(sample => sample.dt || 0)),
    main: {
      ...primary.main,
      temp: median(samples.map(sample => sample.main?.temp)),
      feels_like: median(samples.map(sample => sample.main?.feels_like)),
      humidity: median(samples.map(sample => sample.main?.humidity)),
      pressure: median(samples.map(sample => sample.main?.pressure)),
      temp_min: median(samples.map(sample => sample.main?.temp_min)),
      temp_max: median(samples.map(sample => sample.main?.temp_max)),
    },
    weather: [condition.weather?.[0] || primary.weather?.[0]],
    wind: { ...primary.wind, speed: median(samples.map(sample => sample.wind?.speed)), deg: averageDirection(samples.map(sample => sample.wind?.deg)), gust: median(samples.map(sample => sample.wind?.gust)) },
    rain: rainValues.length ? { '1h': median(rainValues) } : primary.rain,
    snow: snowValues.length ? { '1h': median(snowValues) } : primary.snow,
    precipitation: median(precipitationValues),
    precipitationType: samples.find(sample => sample.precipitationType)?.precipitationType || precipitationTypeFromCode(condition._weatherCode),
    cloudCover: median(samples.map(sample => sample.cloudCover)),
    visibility: median(samples.map(sample => sample.visibility)),
    uvIndex: median(samples.map(sample => sample.uvIndex)),
    dewPoint: median(samples.map(sample => sample.dewPoint)),
    surfacePressure: median(samples.map(sample => sample.surfacePressure)),
    timezone: samples.find(sample => sample.timezone)?.timezone || location.timezone || 'Asia/Manila',
    hourly,
    daily,
    alerts,
    airQuality: samples.find(sample => sample.airQuality)?.airQuality || null,
    sys: { ...primary.sys, sunrise, sunset },
    provider: 'Multi-source',
    sources,
    sourceCount: sources.length,
    _weatherCode: condition._weatherCode,
    _isDay: isDay,
    rainChance: median(samples.map(sample => sample.rainChance)),
    rainUntil: primary.rainUntil || samples.find(sample => sample.rainUntil)?.rainUntil || null,
  }
}

export async function getAggregatedCurrent(location, values = {}) {
  const keys = providerKeys(values)
  const cacheKey = `${location.name}:${location.lat.toFixed(4)},${location.lon.toFixed(4)}:${Boolean(keys.openWeatherApiKey)}:${Boolean(keys.accuWeatherApiKey)}`
  const cached = currentCache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data
  const shared = await cacheService.get(CURRENT_CACHE_GROUP, cacheKey)
  if (shared) {
    currentCache.set(cacheKey, { at: Date.now(), data: shared })
    return shared
  }
  if (currentInFlight.has(cacheKey)) return currentInFlight.get(cacheKey)
  const pending = (async () => {
    const tasks = [
      keys.openWeatherApiKey && fetchOpenWeatherCurrent(location, keys.openWeatherApiKey),
      keys.accuWeatherApiKey && fetchAccuWeatherCurrent(location, keys.accuWeatherApiKey),
      ...OPEN_METEO_MODELS.map(model => fetchOpenMeteoCurrent(location, model)),
    ].filter(Boolean)
    const results = await Promise.allSettled(tasks)
    const samples = results.filter(result => result.status === 'fulfilled' && result.value).map(result => result.value)
    if (!samples.length) throw new Error('All configured weather providers are unavailable.')
    const data = mergeCurrent(samples, location)
    data.fetchedAt = Math.floor(Date.now() / 1000)
    currentCache.set(cacheKey, { at: Date.now(), data })
    await cacheService.set(CURRENT_CACHE_GROUP, cacheKey, data, CURRENT_CACHE_TTL_SECONDS)
    return data
  })().finally(() => currentInFlight.delete(cacheKey))
  currentInFlight.set(cacheKey, pending)
  return pending
}

function dateInManila(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp(value) * 1000))
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addCalendarDays(date, count) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10)
}

function forecastWindow(today) {
  return Array.from({ length: 5 }, (_, index) => addCalendarDays(today, index))
}

function forecastLocationKey(location) {
  return `${Number(location.lat).toFixed(4)},${Number(location.lon).toFixed(4)}`
}

function forecastCovers(data, requiredDates) {
  const dates = new Set((data?.forecastDays || data?.forecast || []).map(day => day.date))
  return requiredDates.every(date => dates.has(date))
}

function responseForLocation(data, location) {
  return { ...data, location: location.name }
}

async function readForecastCache(key) {
  if (isRedisReady()) {
    const shared = await cacheService.get(FORECAST_CACHE_GROUP, key)
    if (shared) {
      forecastCache.set(key, shared)
      return shared
    }
  }
  return forecastCache.get(key) || null
}

async function writeForecastCache(key, data) {
  forecastCache.set(key, data)
  await cacheService.set(FORECAST_CACHE_GROUP, key, data, FORECAST_CACHE_TTL_SECONDS)
}

async function fetchOpenWeatherForecast(location, apiKey) {
  if (!apiKey) return []
  const query = new URLSearchParams({ lat: String(location.lat), lon: String(location.lon), units: 'metric', appid: apiKey })
  const source = await fetchJson(`https://api.openweathermap.org/data/2.5/forecast?${query}`)
  const days = new Map()
  for (const item of source.list || []) {
    const date = dateInManila(item.dt)
    const current = days.get(date) || { date, high: [], low: [], rainChance: [], samples: [] }
    current.high.push(item.main?.temp_max ?? item.main?.temp)
    current.low.push(item.main?.temp_min ?? item.main?.temp)
    current.rainChance.push((item.pop || 0) * 100)
    current.samples.push(item)
    days.set(date, current)
  }
  return [...days.values()].slice(0, 5).map(day => {
    const representative = day.samples[Math.floor(day.samples.length / 2)] || {}
    return { date: day.date, high: Math.max(...day.high.map(finite).filter(value => value !== null)), low: Math.min(...day.low.map(finite).filter(value => value !== null)), rainChance: median(day.rainChance), description: representative.weather?.[0]?.description || 'Current conditions', _provider: 'OpenWeather' }
  })
}

async function fetchOpenMeteoForecast(location, model, dateRange = null) {
  const queryValues = {
    latitude: String(location.lat), longitude: String(location.lon), timezone: 'Asia/Manila', models: model.id,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', temperature_unit: 'celsius', wind_speed_unit: 'kmh',
  }
  if (dateRange) {
    queryValues.start_date = dateRange.start
    queryValues.end_date = dateRange.end
  } else {
    queryValues.forecast_days = '5'
  }
  const query = new URLSearchParams(queryValues)
  const source = await fetchJson(`https://api.open-meteo.com/v1/forecast?${query}`)
  const daily = source.daily || {}
  return (daily.time || []).map((date, index) => ({ date, high: finite(daily.temperature_2m_max?.[index]), low: finite(daily.temperature_2m_min?.[index]), rainChance: finite(daily.precipitation_probability_max?.[index]), description: weatherDescription(daily.weather_code?.[index]), _provider: model.label }))
}

async function fetchAccuWeatherForecast(location, apiKey) {
  if (!apiKey) return []
  const locationKey = await getAccuLocationKey(location, apiKey)
  const query = new URLSearchParams({ apikey: apiKey, language: 'en-us', details: 'true', metric: 'true' })
  const source = await fetchJson(`https://dataservice.accuweather.com/forecasts/v1/daily/5day/${encodeURIComponent(locationKey)}?${query}`, { headers: requestHeaders(apiKey) })
  return (source.DailyForecasts || []).map(item => ({ date: dateInManila(item.EpochDate || item.Date), high: finite(item.Temperature?.Maximum?.Value), low: finite(item.Temperature?.Minimum?.Value), rainChance: finite(item.Day?.PrecipitationProbability) ?? finite(item.Night?.PrecipitationProbability), description: item.Day?.IconPhrase || item.Night?.IconPhrase || 'Current conditions', _provider: 'AccuWeather' }))
}

function combineForecastDays(providerForecasts) {
  const days = new Map()
  for (const item of providerForecasts) {
    const day = days.get(item.date) || { date: item.date, values: [] }
    day.values.push(item)
    days.set(item.date, day)
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => {
    const representative = chooseConsensus(day.values.map(item => ({ weather: [{ main: weatherMainFromText(item.description), description: item.description }], _weatherCode: weatherCodeFromText(item.description), _provider: item._provider })))
    const highs = day.values.map(item => finite(item.high)).filter(value => value !== null)
    const lows = day.values.map(item => finite(item.low)).filter(value => value !== null)
    return {
      date: day.date,
      high: Math.round(median(highs) ?? 0),
      low: Math.round(median(lows) ?? 0),
      rainChance: Math.round(median(day.values.map(item => item.rainChance)) ?? 0),
      description: representative.weather?.[0]?.description || 'Current conditions',
    }
  })
}

async function fetchCompleteForecast(location, keys) {
  const tasks = [
    keys.openWeatherApiKey && fetchOpenWeatherForecast(location, keys.openWeatherApiKey),
    keys.accuWeatherApiKey && fetchAccuWeatherForecast(location, keys.accuWeatherApiKey),
    ...OPEN_METEO_MODELS.map(model => fetchOpenMeteoForecast(location, model)),
  ].filter(Boolean)
  const results = await Promise.allSettled(tasks)
  const providerForecasts = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value || [])
  if (!providerForecasts.length) throw new Error('All configured forecast providers are unavailable.')
  return { forecast: combineForecastDays(providerForecasts), sources: [...new Set(providerForecasts.map(item => item._provider))] }
}

async function fetchForecastExtension(location, start, end) {
  const results = await Promise.allSettled(OPEN_METEO_MODELS.map(model => fetchOpenMeteoForecast(location, model, { start, end })))
  const providerForecasts = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value || [])
  if (!providerForecasts.length) throw new Error('Weather providers could not extend the cached forecast.')
  return { forecast: combineForecastDays(providerForecasts), sources: [...new Set(providerForecasts.map(item => item._provider))] }
}

async function refreshForecast(location, keys, key, cached, today, requiredDates) {
  const cachedDays = cached?.forecastDays || cached?.forecast || []
  const cachedByDate = new Map(cachedDays.map(day => [day.date, day]))
  const missingDates = requiredDates.filter(date => !cachedByDate.has(date))
  let refreshed

  if (cachedDays.some(day => requiredDates.includes(day.date)) && missingDates.length) {
    try {
      refreshed = await fetchForecastExtension(location, missingDates[0], missingDates[missingDates.length - 1])
    } catch (error) {
      if (!cachedDays.length) throw error
      const stale = { ...cached, lastAttemptDate: today }
      await writeForecastCache(key, stale)
      return stale
    }
  } else {
    try {
      refreshed = await fetchCompleteForecast(location, keys)
    } catch (error) {
      if (!cachedDays.length) throw error
      const stale = { ...cached, lastAttemptDate: today }
      await writeForecastCache(key, stale)
      return stale
    }
  }

  const mergedByDate = new Map(cachedDays.filter(day => requiredDates.includes(day.date)).map(day => [day.date, day]))
  refreshed.forecast.forEach(day => { if (requiredDates.includes(day.date)) mergedByDate.set(day.date, day) })
  const forecastDays = requiredDates.map(date => mergedByDate.get(date)).filter(Boolean)
  const fetchedAt = Math.floor(Date.now() / 1000)
  const data = {
    location: location.name,
    locationId: key,
    fetchedAt,
    forecastStartDate: forecastDays[0]?.date || requiredDates[0],
    forecastEndDate: forecastDays.at(-1)?.date || requiredDates.at(-1),
    lastRefreshDate: refreshed.forecast.length ? today : (cached?.lastRefreshDate || today),
    lastAttemptDate: today,
    forecastDays,
    forecast: forecastDays,
    updatedAt: fetchedAt,
    provider: 'Multi-source',
    sources: [...new Set([...(cached?.sources || []), ...refreshed.sources])],
  }
  data.sourceCount = data.sources.length
  await writeForecastCache(key, data)
  return data
}

async function waitForSharedForecast(key, requiredDates, today) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 100))
    const shared = await readForecastCache(key)
    if (shared && (forecastCovers(shared, requiredDates) || shared.lastAttemptDate === today)) return shared
  }
  return readForecastCache(key)
}

export async function getAggregatedForecast(location, values = {}) {
  const keys = providerKeys(values)
  const key = forecastLocationKey(location)
  const today = manilaToday()
  const requiredDates = forecastWindow(today)
  const cached = await readForecastCache(key)
  if (cached && (forecastCovers(cached, requiredDates) || cached.lastAttemptDate === today)) return responseForLocation(cached, location)

  if (forecastInFlight.has(key)) return responseForLocation(await forecastInFlight.get(key), location)
  const pending = (async () => {
    const latest = await readForecastCache(key)
    if (latest && (forecastCovers(latest, requiredDates) || latest.lastAttemptDate === today)) return latest

    if (!isRedisReady()) return refreshForecast(location, keys, key, latest, today, requiredDates)

    const locked = await withRedisLock(`weather-forecast:${key}`, FORECAST_LOCK_TTL_MS, async () => {
      const current = await readForecastCache(key)
      if (current && (forecastCovers(current, requiredDates) || current.lastAttemptDate === today)) return current
      return refreshForecast(location, keys, key, current, today, requiredDates)
    }).catch(() => null)
    if (locked?.acquired) return locked.value

    const shared = await waitForSharedForecast(key, requiredDates, today)
    if (shared) return shared
    if (latest) return latest
    throw new Error('The location forecast is already being refreshed. Please try again shortly.')
  })().finally(() => forecastInFlight.delete(key))
  forecastInFlight.set(key, pending)
  return responseForLocation(await pending, location)
}
