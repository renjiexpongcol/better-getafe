import { useEffect, useState } from 'react'
import { Coins } from 'lucide-react'
import { Link } from 'react-router-dom'
import { routeRequest } from '../services/routeRequests'
import { useHeaderWeather } from './HeaderWeather'
import './HeaderInfoWidget.css'

const currencies = ['USD', 'EUR', 'JPY']
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const rateDate = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const refreshInterval = 5 * 60 * 1000
const displayInterval = 6000

function useRates() {
  const [data, setData] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    const load = () => routeRequest('/api/public/exchange-rates', { ttl: refreshInterval, signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setData(value) })
      .catch(() => { if (!controller.signal.aborted) setData(null) })

    void load()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, refreshInterval)
    return () => { controller.abort(); window.clearInterval(interval) }
  }, [])
  return data
}

export default function HeaderInfoWidget() {
  const [currentWeather, ...weatherDetails] = useHeaderWeather()
  const rates = useRates()
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const quotes = currencies.filter(currency => Number.isFinite(rates?.rates?.[currency]))
    .map(currency => ({ icon: Coins, text: `1 ${currency} = ${peso.format(rates.rates[currency])}`, isRate: true }))
  const slides = [currentWeather, ...quotes, ...weatherDetails]

  useEffect(() => {
    if (hovered || focused || slides.length < 2) return undefined
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setIndex(current => (current + 1) % slides.length)
    }, displayInterval)
    return () => window.clearInterval(timer)
  }, [focused, hovered, slides.length])

  const slide = slides[index % slides.length]
  const Icon = slide.icon
  const reading = <div className="header-weather-reading" key={slide.text}><Icon aria-hidden="true" /><span>{slide.text}</span></div>
  return (
    <div
      className="header-info-widget"
      role="group"
      aria-label="Getafe weather and exchange rates"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {slide.isRate ? (
        <div className="header-weather header-info-rate">
          <div className="header-weather-label">
            <span>ECB · <time dateTime={rates.date}>{rateDate.format(new Date(rates.date))}</time>{rates.stale && ' (cached)'}</span>
          </div>
          {reading}
        </div>
      ) : (
        <Link to="/weather" className="header-weather" aria-label="Open Getafe weather updates" aria-description={slide.text}>
          <div className="header-weather-label"><span>Getafe, Bohol</span></div>
          {reading}
        </Link>
      )}
    </div>
  )
}
