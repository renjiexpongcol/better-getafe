import { useEffect, useState } from 'react'
import { CircleHelp, CloudSun, Droplets, Gauge, MapPin, Sunrise, Sunset, Wind, X, Eye, Thermometer, CloudRain } from 'lucide-react'

const locations = [
  { name: 'Getafe', lat: 10.15, lon: 124.15 },
  { name: 'Manila', lat: 14.5995, lon: 120.9842 },
  { name: 'Cebu', lat: 10.3157, lon: 123.8854 },
  { name: 'Davao', lat: 7.1907, lon: 125.4553 },
  { name: 'Baguio', lat: 16.4023, lon: 120.5960 },
]

const formatTime = value => value ? new Date(value * 1000).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '—'

function windDirection(degrees) {
  if (!Number.isFinite(degrees)) return '—'
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8]
}

function weatherIconPath(weather) {
  const detail = weather?.weather?.[0] || weather
  const description = String(detail?.description || '').toLowerCase()
  const main = String(detail?.main || '').toLowerCase()
  const text = `${main} ${description}`

  if (text.includes('hail')) return '/assets/icons/weather/64/hail.png'
  if (text.includes('thunder') || text.includes('storm')) return '/assets/icons/weather/64/cloudy-skies-with-rainshowers-and-thunderstorm.png'
  if (text.includes('monsoon')) return '/assets/icons/weather/64/monsoon-rains.png'
  if (text.includes('gust')) return '/assets/icons/weather/64/rains-with-gusty.png'
  if (text.includes('snow') || text.includes('frost')) return '/assets/icons/weather/64/frost.png'
  if (text.includes('partly') && (text.includes('shower') || text.includes('rain'))) return '/assets/icons/weather/64/partly-cloudy-skies-with-isolated-rainshowers.png'
  if (text.includes('shower') || text.includes('heavy rain')) return '/assets/icons/weather/64/cloudy-skies-with-rainshowers.png'
  if (text.includes('rain') || text.includes('drizzle')) return '/assets/icons/weather/64/light-rains.png'
  if (text.includes('partly') || text.includes('few clouds') || text.includes('scattered clouds')) return '/assets/icons/weather/64/partly-cloudy-skies.png'
  if (text.includes('clear') || text.includes('sun')) return '/assets/icons/weather/64/clear-skies.png'
  return '/assets/icons/weather/64/cloudy-skies.png'
}

function WeatherIcon({ weather, className, alt = '' }) {
  return <img className={className} src={weatherIconPath(weather)} alt={alt} />
}

export default function Weather() {
  const [data, setData] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => { setLoading(true); setError(''); fetch('/api/weather').then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error)))).then(setData).catch(e => setError(e.message || 'Weather data is unavailable right now.')).finally(() => setLoading(false)) }
  useEffect(() => {
    load()
    const interval = setInterval(load, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])
  useEffect(() => {
    if (!selectedLocation) return undefined
    const closeOnEscape = event => { if (event.key === 'Escape') setSelectedLocation(null) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selectedLocation])
  const main = data.find(item => item.name === 'Getafe') || data[0]
  useEffect(() => {
    if (!main?.coord?.lat || !main?.coord?.lon) return undefined
    const controller = new AbortController()
    setForecastLoading(true)
    fetch(`/api/weather/forecast?lat=${main.coord.lat}&lon=${main.coord.lon}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : response.json().then(value => Promise.reject(new Error(value.error))))
      .then(setForecast)
      .catch(error => { if (error.name !== 'AbortError') setForecast(null) })
      .finally(() => { if (!controller.signal.aborted) setForecastLoading(false) })
    return () => controller.abort()
  }, [main?.coord?.lat, main?.coord?.lon])
  const description = String(main?.weather?.[0]?.description || '')
  const condition = description ? `${description}${/cloud|clear/i.test(description) ? ' skies' : ''}`.toUpperCase() : 'WEATHER UNAVAILABLE'
  const rainfall = main?.rain?.['3h'] ?? main?.rain?.['1h']
  const sourceLabel = main?.sources?.length ? main.sources.join(' · ') : 'Open-Meteo'
  return <main className="weather-page"><section className="weather-hero"><div className="weather-hero-bg"><div className="weather-hero-photo" /><div className="weather-hero-overlay" /></div><div className="container weather-hero-inner"><a className="weather-hero-help" href="#weather-about-title" aria-label="Learn about weather data"><CircleHelp size={16} aria-hidden="true" /></a><div className="weather-hero-main">{main ? <WeatherIcon weather={main} className="weather-hero-icon" /> : <CloudSun className="weather-hero-icon" size={58} strokeWidth={1.2} aria-hidden="true" />}<div><p className="weather-hero-condition">{condition}</p><p className="weather-hero-range">High {main ? `${Math.round(main.main.temp_max)}°C` : '—'} <span>|</span> Low {main ? `${Math.round(main.main.temp_min)}°C` : '—'}</p></div></div><div className="weather-hero-metrics"><div><span>Temperature</span><strong>{main ? `${Math.round(main.main.temp)}°C` : '—'}</strong></div><div><span>Rainfall</span><strong>{rainfall === undefined ? '— mm' : `${rainfall} mm`}</strong></div><div><span>Winds</span><strong>{main ? `${(Number(main.wind?.speed || 0) * 3.6).toFixed(1)} km/h ${windDirection(main.wind?.deg)}` : '—'}</strong></div></div></div></section>
    <section className="section"><div className="container"><div className="weather-heading"><div><p className="eyebrow">Live conditions</p><h2>Weather updates</h2></div></div>
      {error ? <div className="weather-error"><strong>Weather unavailable</strong><p>{error}</p><button onClick={load}>Try again</button></div> : <>{main && <article className="weather-current"><div><p className="weather-location"><MapPin size={15}/> {main.name}, Philippines</p><strong className="weather-temp">{Math.round(main.main.temp)}°<sup>C</sup></strong><p className="weather-description">{main.weather[0].description}</p></div><div className="weather-metrics"><span><Droplets size={16}/><b>{main.main.humidity}%</b><small>Humidity</small></span><span><Wind size={16}/><b>{Math.round(main.wind.speed)} m/s</b><small>Wind</small></span><span><Gauge size={16}/><b>{main.main.pressure} hPa</b><small>Pressure</small></span><span><Sunrise size={16}/><b>{formatTime(main.sys.sunrise)}</b><small>Sunrise</small></span><span><Sunset size={16}/><b>{formatTime(main.sys.sunset)}</b><small>Sunset</small></span></div></article>}
        <div className="weather-grid">{data.map(item => <button type="button" className={`weather-card ${item.name === main?.name ? 'selected' : ''}`} key={item.name} onClick={() => setSelectedLocation(item)} aria-label={`View detailed weather for ${item.name}`}><div className="weather-card-top"><span>{item.name}</span><WeatherIcon weather={item} /></div><strong>{Math.round(item.main.temp)}°C</strong><p>{item.weather[0].description}</p><small>Feels like {Math.round(item.main.feels_like)}° · Humidity {item.main.humidity}%</small><span className="weather-card-hint">View details</span></button>)}</div></>}
      {(forecastLoading || forecast?.forecast?.length) && <section className="weather-outlook" aria-labelledby="weather-outlook-title"><div className="weather-outlook-heading"><div><p className="eyebrow">Plan ahead</p><h2 id="weather-outlook-title">5-day outlook for {forecast?.location || main?.name || 'your location'}</h2></div><span>Updates every 15 minutes</span></div>{forecastLoading ? <p className="weather-outlook-loading">Loading the latest outlook…</p> : <div className="weather-outlook-grid">{forecast.forecast.map(day => <article className="weather-outlook-card" key={day.date}><p>{new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${day.date}T12:00:00+08:00`))}</p><WeatherIcon weather={day} /><strong>{day.high}° <small>/ {day.low}°</small></strong><span>{day.description}</span><b><CloudRain size={14} /> {day.rainChance}% rain chance</b></article>)}</div>}</section>}
      <section className="weather-about" aria-labelledby="weather-about-title">
        <h2 id="weather-about-title">About Weather Data</h2>
        <p className="weather-about-intro">The weather data displayed on this page combines available observations with multiple global forecast models. The information is updated regularly to provide current weather conditions across major Philippine cities.</p>
        <p className="weather-about-refresh-note"><strong>Refresh schedule:</strong> Weather data is fetched automatically every 15 minutes. Conditions may change between updates.</p>
        <div className="weather-about-grid">
          <article className="weather-about-item">
            <h3>Understanding the Data</h3>
            <p>Temperature is displayed in Celsius (°C). Weather conditions are categorized based on current atmospheric observations. The forecast provides a 5-day outlook to help you plan ahead.</p>
          </article>
          <article className="weather-about-item">
            <h3>Weather Advisories</h3>
            <p>For official weather advisories, warnings, and detailed forecasts, please visit the <a href="https://bagong.pagasa.dost.gov.ph/" target="_blank" rel="noreferrer">PAGASA official website</a> or follow their social media channels for real-time updates.</p>
          </article>
        </div>
        <p className="weather-about-source">Sources: {sourceLabel}{main && <> · Updated {new Date(main.dt * 1000).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</>}</p>
      </section>
    </div></section>
    {selectedLocation && <div className="weather-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedLocation(null) }}><section className="weather-modal" role="dialog" aria-modal="true" aria-labelledby="weather-modal-title"><button type="button" className="weather-modal-close" onClick={() => setSelectedLocation(null)} aria-label="Close weather details"><X size={19} /></button><div className="weather-modal-heading"><div><p className="eyebrow">Live conditions</p><h2 id="weather-modal-title">{selectedLocation.name}, Philippines</h2><p>{selectedLocation.weather?.[0]?.description || 'Current weather'}</p></div><WeatherIcon weather={selectedLocation} /></div><div className="weather-modal-temp"><strong>{Math.round(selectedLocation.main.temp)}°</strong><span>C<br /><small>Feels like {Math.round(selectedLocation.main.feels_like)}°C</small></span></div><div className="weather-modal-grid"><span><Droplets size={17} /><b>{selectedLocation.main.humidity}%</b><small>Humidity</small></span><span><Wind size={17} /><b>{Math.round(selectedLocation.wind.speed)} m/s</b><small>Wind speed</small></span><span><Gauge size={17} /><b>{selectedLocation.main.pressure} hPa</b><small>Pressure</small></span><span><Thermometer size={17} /><b>{Math.round(selectedLocation.main.temp_min)}°–{Math.round(selectedLocation.main.temp_max)}°</b><small>Daily range</small></span><span><Eye size={17} /><b>{selectedLocation.visibility ? `${(selectedLocation.visibility / 1000).toFixed(1)} km` : '—'}</b><small>Visibility</small></span><span><Sunrise size={17} /><b>{formatTime(selectedLocation.sys.sunrise)}</b><small>Sunrise</small></span><span><Sunset size={17} /><b>{formatTime(selectedLocation.sys.sunset)}</b><small>Sunset</small></span></div><p className="weather-modal-source">Source: <a href="https://openweathermap.org/" target="_blank" rel="noreferrer">OpenWeather</a> · Updated {new Date(selectedLocation.dt * 1000).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p></section></div>}
    </main>
}
