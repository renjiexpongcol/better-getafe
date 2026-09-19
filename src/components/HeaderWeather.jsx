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

export default function HeaderWeather() {
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    let active = true
    let controller
    let retryTimer

    const scheduleRetry = () => {
      if (!retryTimer) retryTimer = setTimeout(() => {
        retryTimer = undefined
        load()
      }, 60 * 1000)
    }

    const load = async () => {
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12000)
      try {
        const response = await fetch('/api/weather/getafe', { signal: controller.signal })
        if (!response.ok) throw new Error('Weather unavailable')
        const data = await response.json()
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
    const refresh = setInterval(load, 15 * 60 * 1000)
    return () => { active = false; controller?.abort(); clearInterval(refresh); clearTimeout(retryTimer) }
  }, [])

  const [description, WeatherIcon] = condition(weather?.code, weather?.isDay)
  const slides = weather ? [
    { icon: WeatherIcon, text: `${Math.round(weather.temperature)}°C ${description}` },
    Number.isFinite(weather.rainChance) && { icon: CloudRain, text: `${Math.round(weather.rainChance)}% rain chance` },
    Number.isFinite(weather.feelsLike) && { icon: Thermometer, text: `Feels like ${Math.round(weather.feelsLike)}°C` },
    Number.isFinite(weather.humidity) && { icon: Droplets, text: `Humidity ${Math.round(weather.humidity)}%` },
    Number.isFinite(weather.wind) && { icon: Wind, text: `Wind ${Math.round(weather.wind)} km/h` },
  ].filter(Boolean) : [{ icon: CloudSun, text: loading ? 'Loading…' : 'Unavailable' }]

  useEffect(() => {
    if (hovered || slides.length < 2) return undefined
    const timer = setInterval(() => setIndex(value => (value + 1) % slides.length), 5000)
    return () => clearInterval(timer)
  }, [hovered, slides.length])

  const slide = slides[index % slides.length]
  const Icon = slide.icon
  return (
    <div className="header-weather" tabIndex={0} role="group" aria-label="Getafe weather. Focus or hover to pause updates." onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false) }}>
      <div className="header-weather-label">
        <span>Getafe, Bohol</span>
      </div>
      <div className="header-weather-reading" key={slide.text} title={weather ? `Updated ${new Date(weather.updatedAt * 1000).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}` : loading ? 'Loading current weather' : 'Weather temporarily unavailable. Retrying shortly.'}>
        <Icon size={17} aria-hidden="true" /><span>{slide.text}</span>
      </div>
    </div>
  )
}
