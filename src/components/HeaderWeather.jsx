import { requestWeather } from '../services/weatherClient.js'
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
    let retryCount = 0

    const scheduleRetry = () => {
      if (!retryTimer) retryTimer = setTimeout(() => {
        retryTimer = undefined
        load()
      }, Math.min(30_000 * (2 ** retryCount++), 5 * 60 * 1000))
    }

    const load = async () => {
      if (document.visibilityState === 'hidden' || !active) return
      lastAttempt = Date.now()
      controller?.abort()
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12000)
      try {
        const data = await requestWeather('current', { signal: controller.signal })
        const current = data?.current
        if (!Number.isFinite(current?.temperature) || (data.stale && Date.now() / 1000 - data.fetchedAt > 7200)) throw new Error('Weather unavailable')
        if (active) {
          clearTimeout(retryTimer)
          retryTimer = undefined
          retryCount = 0
          setWeather({ ...data, stale: Boolean(data.stale || Date.now() / 1000 - data.fetchedAt > 5 * 60) })
        }
      } catch {
        if (active) {
          // Keep the last good reading visible while a refresh is retried.
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

  const current = weather?.current
  const [description, WeatherIcon] = condition(current?.code, current?.isDay)
  return weather ? [
    { icon: WeatherIcon, text: `${Math.round(current.temperature)}°C ${description}${weather.stale ? ' · Updating' : ''}` },
    Number.isFinite(current.precipitationProbability) && { icon: CloudRain, text: `${Math.round(current.precipitationProbability)}% rain chance` },
    Number.isFinite(current.feelsLike) && { icon: Thermometer, text: `Feels like ${Math.round(current.feelsLike)}°C` },
    Number.isFinite(current.humidity) && { icon: Droplets, text: `Humidity ${Math.round(current.humidity)}%` },
    Number.isFinite(current.windSpeed) && { icon: Wind, text: `Wind ${Math.round(current.windSpeed * 3.6)} km/h` },
  ].filter(Boolean) : [{ icon: CloudSun, text: loading ? 'Loading…' : 'Unavailable' }]

}
