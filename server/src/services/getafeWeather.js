// Backwards-compatible helper for the authenticated resident weather route.
// Coordinates originate from the server-side barangay directory, and provider
// URLs remain fixed and allowlisted by publicWeather.js.
import { createWeatherService } from './publicWeather.js'

export async function getWeatherAt(latitude, longitude) {
  const location = {
    name: 'Barangay location',
    municipality: 'Getafe',
    province: 'Bohol',
    latitude: Number(latitude),
    longitude: Number(longitude),
    timezone: 'Asia/Manila',
  }
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)
    || location.latitude < 9 || location.latitude > 11
    || location.longitude < 123 || location.longitude > 125) {
    throw new Error('Weather location is outside Getafe, Bohol.')
  }
  const data = await createWeatherService({ location }).current()
  const current = data.current
  return {
    provider: data.providers.name,
    sources: data.providers.sources,
    sourceCount: data.providers.sourceCount,
    location: location.name,
    temperature: current.temperature,
    feelsLike: current.feelsLike,
    humidity: current.humidity,
    wind: current.windSpeed === null ? null : current.windSpeed * 3.6,
    description: current.description,
    code: current.code,
    isDay: current.isDay,
    rainChance: current.precipitationProbability,
    updatedAt: current.observationTime || current.modelValidAt || data.fetchedAt,
    stale: data.stale,
  }
}
