import { routeRequest, invalidateRouteRequestCache } from './routeRequests'

const resources = Object.freeze({
  current: { path: '/api/public/weather/current', ttl: 5 * 60 * 1000 },
  hourly: { path: '/api/public/weather/hourly', ttl: 15 * 60 * 1000 },
  forecast: { path: '/api/public/weather/forecast', ttl: 30 * 60 * 1000 },
  advisories: { path: '/api/public/weather/advisories', ttl: 60 * 1000 },
})

// routeRequest provides one shared in-flight request and browser cache entry
// per public endpoint, so the header and page reuse the same current reading.
export function requestWeather(resource, { signal, force = false } = {}) {
  const definition = resources[resource]
  if (!definition) return Promise.reject(new Error('Unknown weather data resource.'))
  return routeRequest(definition.path, { scope: 'public', ttl: definition.ttl, signal, force })
}

export function refreshWeatherResources() {
  invalidateRouteRequestCache('/api/public/weather/')
}
