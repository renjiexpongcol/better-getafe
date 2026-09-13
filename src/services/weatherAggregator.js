const CACHE_MS = 15 * 60 * 1000
const ACCU_LOCATION_CACHE_MS = 24 * 60 * 60 * 1000

const OPEN_METEO_MODELS = [
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS' },
  { id: 'gfs_seamless', label: 'NOAA GFS' },
  { id: 'icon_seamless', label: 'DWD ICON' },
  { id: 'jma_seamless', label: 'JMA' },
]

const currentCache = new Map()
const forecastCache = new Map()
const accuLocationCache = new Map()

function finite(value) {
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

function normaliseOpenWeather(source, location) {
  const item = { ...source, name: location.name, _provider: 'OpenWeather' }
  const description = source.weather?.[0]?.description || 'Current conditions'
  item._weatherCode = weatherCodeFromText(description)
  item.coord = source.coord || { lat: location.lat, lon: location.lon }
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
  const precipitation = finite(current.rain) ?? finite(current.showers) ?? finite(current.precipitation)
  const nextHour = source.hourly?.time?.findIndex(time => timestamp(time) > timestamp(current.time)) ?? -1
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
    wind: { speed: (finite(current.wind_speed_10m) || 0) / 3.6, deg: finite(current.wind_direction_10m) },
    rain: precipitation === null ? undefined : { '1h': precipitation },
    sys: { sunrise: timestamp(daily.sunrise?.[0]), sunset: timestamp(daily.sunset?.[0]) },
    _provider: provider,
    _weatherCode: Number(current.weather_code),
    _isDay: current.is_day === 1,
    rainChance: nextHour >= 0 ? finite(source.hourly?.precipitation_probability?.[nextHour]) : null,
    rainUntil: nextHour >= 0 ? timestamp(source.hourly.time[nextHour]) : null,
  }
}

async function fetchOpenMeteoCurrent(location, model) {
  const query = new URLSearchParams({
    latitude: String(location.lat), longitude: String(location.lon), timezone: 'Asia/Manila',
    models: model.id, forecast_days: '1', timeformat: 'unixtime',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation,rain,showers,pressure_msl',
    hourly: 'precipitation_probability', daily: 'temperature_2m_max,temperature_2m_min,sunrise,sunset',
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
  return {
    name: location.name,
    coord: { lat: location.lat, lon: location.lon },
    dt: timestamp(source.EpochTime || source.LocalObservationDateTime),
    main: { temp: temperature, feels_like: finite(source.RealFeelTemperature?.Metric?.Value) ?? temperature, humidity: finite(source.RelativeHumidity), pressure: finite(source.Pressure?.Metric?.Value), temp_min: temperature, temp_max: temperature },
    weather: [{ main: weatherMainFromText(description), description, icon: null }],
    wind: { speed: windKmh === null ? 0 : windKmh / 3.6, deg: finite(source.Wind?.Direction?.Degrees) },
    rain: precipitation === null ? undefined : { '1h': precipitation },
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

function mergeCurrent(samples, location) {
  const primary = samples.find(sample => sample._provider === 'OpenWeather') || samples.find(sample => sample._provider === 'AccuWeather') || samples[0]
  const condition = chooseConsensus(samples)
  const rainValues = samples.map(sample => sample.rain?.['1h']).filter(value => finite(value) !== null)
  const sunrise = primary.sys?.sunrise || samples.find(sample => sample.sys?.sunrise)?.sys?.sunrise || null
  const sunset = primary.sys?.sunset || samples.find(sample => sample.sys?.sunset)?.sys?.sunset || null
  const sources = [...new Set(samples.map(sample => sample._provider))]
  const isDay = samples.find(sample => sample._isDay !== undefined)?._isDay
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
    wind: { ...primary.wind, speed: median(samples.map(sample => sample.wind?.speed)), deg: median(samples.map(sample => sample.wind?.deg)) },
    rain: rainValues.length ? { '1h': median(rainValues) } : primary.rain,
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
  const tasks = [
    keys.openWeatherApiKey && fetchOpenWeatherCurrent(location, keys.openWeatherApiKey),
    keys.accuWeatherApiKey && fetchAccuWeatherCurrent(location, keys.accuWeatherApiKey),
    ...OPEN_METEO_MODELS.map(model => fetchOpenMeteoCurrent(location, model)),
  ].filter(Boolean)
  const results = await Promise.allSettled(tasks)
  const samples = results.filter(result => result.status === 'fulfilled' && result.value).map(result => result.value)
  if (!samples.length) throw new Error('All configured weather providers are unavailable.')
  const data = mergeCurrent(samples, location)
  currentCache.set(cacheKey, { at: Date.now(), data })
  return data
}

function dateInManila(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp(value) * 1000))
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

async function fetchOpenMeteoForecast(location, model) {
  const query = new URLSearchParams({
    latitude: String(location.lat), longitude: String(location.lon), timezone: 'Asia/Manila', models: model.id, forecast_days: '5',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', temperature_unit: 'celsius', wind_speed_unit: 'kmh',
  })
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

export async function getAggregatedForecast(location, values = {}) {
  const keys = providerKeys(values)
  const cacheKey = `${location.name}:${location.lat.toFixed(4)},${location.lon.toFixed(4)}:${Boolean(keys.openWeatherApiKey)}:${Boolean(keys.accuWeatherApiKey)}`
  const cached = forecastCache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data
  const tasks = [
    keys.openWeatherApiKey && fetchOpenWeatherForecast(location, keys.openWeatherApiKey),
    keys.accuWeatherApiKey && fetchAccuWeatherForecast(location, keys.accuWeatherApiKey),
    ...OPEN_METEO_MODELS.map(model => fetchOpenMeteoForecast(location, model)),
  ].filter(Boolean)
  const results = await Promise.allSettled(tasks)
  const providerForecasts = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value || [])
  if (!providerForecasts.length) throw new Error('All configured forecast providers are unavailable.')
  const days = new Map()
  for (const item of providerForecasts) {
    const day = days.get(item.date) || { date: item.date, values: [] }
    day.values.push(item)
    days.set(item.date, day)
  }
  const forecast = [...days.values()].slice(0, 5).map(day => {
    const representative = chooseConsensus(day.values.map(item => ({ weather: [{ main: weatherMainFromText(item.description), description: item.description }], _weatherCode: weatherCodeFromText(item.description), _provider: item._provider })))
    return { date: day.date, high: Math.round(median(day.values.map(item => item.high)) ?? 0), low: Math.round(median(day.values.map(item => item.low)) ?? 0), rainChance: Math.round(median(day.values.map(item => item.rainChance)) ?? 0), description: representative.weather?.[0]?.description || 'Current conditions' }
  })
  const sources = [...new Set(providerForecasts.map(item => item._provider))]
  const data = { location: location.name, forecast, updatedAt: Math.floor(Date.now() / 1000), provider: 'Multi-source', sources, sourceCount: sources.length }
  forecastCache.set(cacheKey, { at: Date.now(), data })
  return data
}
