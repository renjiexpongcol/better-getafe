import { config } from '../config/index.js'
import { getAggregatedCurrent, providerKeys } from './weatherAggregator.js'

const GETAFE = { name: 'Getafe, Bohol', lat: 10.15, lon: 124.15 }

async function configuredProviders() {
  try { await config.load() } catch { /* Environment defaults remain available when settings storage is unavailable. */ }
  return providerKeys({
    openWeatherApiKey: config.get('weather.openWeatherApiKey'),
    accuWeatherApiKey: config.get('weather.accuWeatherApiKey'),
  })
}

function toHeaderWeather(data, fallbackLocation) {
  const current = data.main || {}
  const condition = data.weather?.[0] || {}
  return {
    provider: data.provider || 'Multi-source',
    sources: data.sources || [],
    sourceCount: data.sourceCount || data.sources?.length || 0,
    location: data.name || fallbackLocation,
    temperature: current.temp,
    feelsLike: current.feels_like,
    humidity: current.humidity,
    wind: data.wind?.speed == null ? null : data.wind.speed * 3.6,
    description: condition.description || 'Current conditions',
    code: data._weatherCode ?? null,
    isDay: data._isDay ?? true,
    rainChance: data.rainChance ?? null,
    rainUntil: data.rainUntil ?? null,
    updatedAt: data.dt,
  }
}

export async function getGetafeWeather() {
  return toHeaderWeather(await getAggregatedCurrent(GETAFE, await configuredProviders()), GETAFE.name)
}

export async function getWeatherAt(latitude, longitude) {
  const location = { name: 'Barangay location', lat: Number(latitude), lon: Number(longitude) }
  const data = await getAggregatedCurrent(location, await configuredProviders())
  return toHeaderWeather(data, location.name)
}
