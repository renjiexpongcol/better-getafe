import { routeRequest } from '../services/routeRequests.js'
import { useEffect, useState } from 'react'
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Droplets, Moon, Snowflake, Sun, Thermometer, Wind } from 'lucide-react'

function condition(code, isDay) {
  if (code === 0) return [isDay ? 'Clear skies' : 'Clear night', isDay ? Sun : Moon]
  if (code === 1 || code === 2) return ['Partly cloudy', isDay ? CloudSun : Cloud]
  if (code === 3) return ['Overcast', Cloud]
  if ([45, 48].includes(code)) return ['Foggy', CloudFog]
  if ([51, 53, 55, 56, 57].includes(code)) return ['Drizzle', CloudRain]
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['Rain', CloudRain]
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Snow', Snowflake]
  if ([95, 96, 99].includes(code)) return ['Thunderstorms', CloudLightning]
  return ['Current temperature', Thermometer]
}

export function useHeaderWeather() {
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    let controller
    let retryTimer
    let lastAttempt = 0

    const scheduleRetry = () => {
      if (!retryTimer) retryTimer = setTimeout(() => {
        retryTimer = undefined
        load()
      }, 60 * 1000)
    }

    const load = async () => {
      if (document.visibilityState === 'hidden' || !active) return
      lastAttempt = Date.now()
      controller?.abort()
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12000)
      try {
        const data = await routeRequest('/api/weather/getafe', { signal: controller.signal })
        if (!Number.isFinite(data.temperature) || Date.now() / 1000 - data.updatedAt > 7200) throw new Error('Weather unavailable')
        if (active) {
          clearTimeout(retryTimer)
          retryTimer = undefined
          setWeather(data)
        }
      } catch {
        if (active) {
          setWeather(null)
          scheduleRetry()
        }
      } finally {
        clearTimeout(timeout)
        if (active) setLoading(false)
      }
    }
    load()
    const resume = () => { if (Date.now() - lastAttempt >= 15 * 60 * 1000) load() }
    document.addEventListener('visibilitychange', resume)
    const refresh = setInterval(load, 15 * 60 * 1000)
    return () => { active = false; controller?.abort(); clearInterval(refresh); clearTimeout(retryTimer); document.removeEventListener('visibilitychange', resume) }
  }, [])

  const [description, WeatherIcon] = condition(weather?.code, weather?.isDay)
  return weather ? [
    { icon: WeatherIcon, text: `${Math.round(weather.temperature)}°C ${description}` },
    Number.isFinite(weather.rainChance) && { icon: CloudRain, text: `${Math.round(weather.rainChance)}% rain chance` },
    Number.isFinite(weather.feelsLike) && { icon: Thermometer, text: `Feels like ${Math.round(weather.feelsLike)}°C` },
    Number.isFinite(weather.humidity) && { icon: Droplets, text: `Humidity ${Math.round(weather.humidity)}%` },
    Number.isFinite(weather.wind) && { icon: Wind, text: `Wind ${Math.round(weather.wind)} km/h` },
  ].filter(Boolean) : [{ icon: CloudSun, text: loading ? 'Loading…' : 'Unavailable' }]

}
