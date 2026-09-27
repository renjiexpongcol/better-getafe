const numberOrNull = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null
const timeOrNull = value => {
  const numeric = numberOrNull(value)
  if (numeric !== null) return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : numeric
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
}
const normalizeDate = value => {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/)
  if (isoDate) return isoDate[1]
  const timestamp = timeOrNull(value)
  if (timestamp === null) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp * 1000))
}

function compassDirection(degrees) {
  const value = numberOrNull(degrees)
  if (value === null) return null
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(value / 45) % 8]
}

function normalizeHour(hour = {}) {
  return {
    time: numberOrNull(hour.time),
    temperature: numberOrNull(hour.temperature),
    feelsLike: numberOrNull(hour.feelsLike),
    humidity: numberOrNull(hour.humidity),
    dewPoint: numberOrNull(hour.dewPoint),
    condition: hour.condition || null,
    description: hour.condition || null,
    icon: hour.icon || null,
    code: numberOrNull(hour.code),
    isDay: typeof hour.isDay === 'boolean' ? hour.isDay : null,
    precipitationProbability: numberOrNull(hour.precipitationProbability),
    precipitation: numberOrNull(hour.precipitation),
    rain: numberOrNull(hour.rain),
    snow: numberOrNull(hour.snow),
    precipitationType: hour.precipitationType || null,
    cloudCover: numberOrNull(hour.cloudCover),
    pressure: numberOrNull(hour.pressure),
    visibility: numberOrNull(hour.visibility),
    uvIndex: numberOrNull(hour.uvIndex),
    windSpeed: numberOrNull(hour.windSpeed),
    windDirection: compassDirection(hour.windDirection),
    windDegrees: numberOrNull(hour.windDirection),
    windGust: numberOrNull(hour.windGust),
  }
}

function normalizeDay(day = {}) {
  return {
    date: normalizeDate(day.date),
    condition: day.condition || null,
    description: day.condition || null,
    icon: day.icon || null,
    code: numberOrNull(day.code),
    temperatureMax: numberOrNull(day.temperatureMax),
    temperatureMin: numberOrNull(day.temperatureMin),
    temperatureMean: numberOrNull(day.temperatureMean),
    feelsLikeMax: numberOrNull(day.feelsLikeMax),
    precipitationProbabilityMax: numberOrNull(day.precipitationProbabilityMax),
    precipitation: numberOrNull(day.precipitation),
    rain: numberOrNull(day.rain),
    snow: numberOrNull(day.snow),
    windSpeedMax: numberOrNull(day.windSpeedMax),
    windGustMax: numberOrNull(day.windGustMax),
    windDirection: compassDirection(day.windDirection),
    windDegrees: numberOrNull(day.windDirection),
    humidityMean: numberOrNull(day.humidityMean),
    cloudCoverMean: numberOrNull(day.cloudCoverMean),
    visibilityMean: numberOrNull(day.visibilityMean),
    uvIndexMax: numberOrNull(day.uvIndexMax),
    sunrise: numberOrNull(day.sunrise),
    sunset: numberOrNull(day.sunset),
    daylightDuration: numberOrNull(day.daylightDuration),
    moonrise: numberOrNull(day.moonrise),
    moonset: numberOrNull(day.moonset),
    moonPhase: numberOrNull(day.moonPhase),
    moonIllumination: numberOrNull(day.moonIllumination),
  }
}

function normalizeAlert(alert = {}) {
  return {
    type: alert.event || alert.type || null,
    severity: alert.severity || null,
    urgency: alert.urgency || null,
    certainty: alert.certainty || null,
    headline: alert.headline || alert.event || null,
    description: alert.description || null,
    instructions: alert.instruction || alert.instructions || null,
    effective: timeOrNull(alert.start ?? alert.effective),
    expires: timeOrNull(alert.end ?? alert.expires),
    areas: alert.areas || alert.areaDesc || null,
    source: alert.sender_name || alert.source || null,
  }
}

function normalizeAirQuality(airQuality) {
  if (!airQuality || typeof airQuality !== 'object') return null
  const normalized = {
    index: numberOrNull(airQuality.index ?? airQuality.aqi),
    pm25: numberOrNull(airQuality.pm25 ?? airQuality.pm2_5),
    pm10: numberOrNull(airQuality.pm10),
    carbonMonoxide: numberOrNull(airQuality.carbonMonoxide ?? airQuality.co),
    nitrogenDioxide: numberOrNull(airQuality.nitrogenDioxide ?? airQuality.no2),
    ozone: numberOrNull(airQuality.ozone ?? airQuality.o3),
    sulfurDioxide: numberOrNull(airQuality.sulfurDioxide ?? airQuality.so2),
    unit: airQuality.unit || null,
    provider: airQuality.provider || null,
  }
  return Object.values(normalized).some(value => numberOrNull(value) !== null) ? normalized : null
}

export function normalizeWeather(raw, location) {
  const today = raw.daily?.[0] || {}
  const weather = raw.weather?.[0] || {}
  const windDegrees = numberOrNull(raw.wind?.deg)
  const sunrise = numberOrNull(today.sunrise) ?? numberOrNull(raw.sys?.sunrise)
  const sunset = numberOrNull(today.sunset) ?? numberOrNull(raw.sys?.sunset)
  const current = {
    temperature: numberOrNull(raw.main?.temp),
    feelsLike: numberOrNull(raw.main?.feels_like),
    condition: weather.main || null,
    description: weather.description || null,
    icon: weather.icon || null,
    code: numberOrNull(raw._weatherCode),
    isDay: typeof raw._isDay === 'boolean' ? raw._isDay : null,
    cloudCover: numberOrNull(raw.cloudCover ?? raw.clouds?.all),
    humidity: numberOrNull(raw.main?.humidity),
    dewPoint: numberOrNull(raw.dewPoint),
    pressure: numberOrNull(raw.main?.pressure),
    surfacePressure: numberOrNull(raw.surfacePressure),
    visibility: numberOrNull(raw.visibility),
    uvIndex: numberOrNull(raw.uvIndex),
    windSpeed: numberOrNull(raw.wind?.speed),
    windDirection: compassDirection(windDegrees),
    windDegrees,
    windGust: numberOrNull(raw.wind?.gust),
    precipitation: numberOrNull(raw.precipitation ?? raw.rain?.['1h'] ?? raw.rain?.['3h'] ?? raw.snow?.['1h'] ?? raw.snow?.['3h']),
    rain: numberOrNull(raw.rain?.['1h'] ?? raw.rain?.['3h']),
    snow: numberOrNull(raw.snow?.['1h'] ?? raw.snow?.['3h']),
    precipitationType: raw.precipitationType || null,
    precipitationProbability: numberOrNull(raw.rainChance),
    precipitationUntil: numberOrNull(raw.rainUntil),
    sunrise,
    sunset,
    observationTime: numberOrNull(raw.dt),
    lastUpdatedAt: numberOrNull(raw.fetchedAt),
  }
  const astronomy = {
    sunrise,
    sunset,
    daylightDuration: numberOrNull(today.daylightDuration),
    moonrise: numberOrNull(today.moonrise),
    moonset: numberOrNull(today.moonset),
    moonPhase: numberOrNull(today.moonPhase),
    moonIllumination: numberOrNull(today.moonIllumination),
  }
  const locationModel = {
    name: location.name,
    municipality: location.municipality || null,
    province: location.province || null,
    region: location.region || null,
    country: location.country || 'Philippines',
    latitude: numberOrNull(raw.coord?.lat ?? location.lat),
    longitude: numberOrNull(raw.coord?.lon ?? location.lon),
    timezone: raw.timezone || location.timezone || null,
  }
  return {
    location: locationModel,
    current,
    hourly: (raw.hourly || []).map(normalizeHour).filter(hour => hour.time !== null),
    daily: (raw.daily || []).map(normalizeDay).filter(day => day.date),
    astronomy,
    airQuality: normalizeAirQuality(raw.airQuality),
    alerts: Array.isArray(raw.alerts) ? raw.alerts.map(normalizeAlert) : [],
    providers: { name: raw.provider || null, sources: raw.sources || [], sourceCount: raw.sourceCount || raw.sources?.length || 0 },
    fetchedAt: numberOrNull(raw.fetchedAt),
  }
}
