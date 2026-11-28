// Compatibility facade for callers of the former database/Redis-backed
// aggregator. All weather requests now use the independent public provider
// service and its bounded in-memory/CDN cache.
import { publicWeatherService } from './publicWeather.js'

export function providerKeys() {
  const openWeatherApiKey = String(process.env.OPENWEATHERMAP_API_KEY || process.env.OPENWEATHER_API_KEY || '').trim()
  return { openWeatherApiKey }
}

export async function getAggregatedCurrent() {
  return publicWeatherService.current()
}

export async function getAggregatedForecast() {
  const data = await publicWeatherService.forecast()
  return {
    forecast: (data.daily || []).map(day => ({ date: day.date, high: day.temperatureMax, low: day.temperatureMin, rainChance: day.precipitationProbabilityMax, description: day.description, ...day })),
    sources: data.providers?.sources || [],
    stale: data.stale,
    fetchedAt: data.fetchedAt,
  }
}
