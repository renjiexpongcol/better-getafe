import { useEffect, useState } from 'react'
import { CloudSun, Droplets, Gauge, MapPin, RefreshCw, Sunrise, Sunset, Wind } from 'lucide-react'

const locations = [
  { name: 'Getafe', lat: 10.15, lon: 124.15 },
  { name: 'Manila', lat: 14.5995, lon: 120.9842 },
  { name: 'Cebu', lat: 10.3157, lon: 123.8854 },
  { name: 'Davao', lat: 7.1907, lon: 125.4553 },
  { name: 'Baguio', lat: 16.4023, lon: 120.5960 },
]

const formatTime = value => value ? new Date(value * 1000).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '—'

export default function Weather() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => { setLoading(true); setError(''); fetch('/api/weather').then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error)))).then(setData).catch(e => setError(e.message || 'Weather data is unavailable right now.')).finally(() => setLoading(false)) }
  useEffect(load, [])
  const main = data.find(item => item.name === 'Getafe') || data[0]
  return <main className="weather-page"><section className="weather-hero"><div className="container weather-hero-inner"><div><p className="eyebrow">Municipality of Getafe · Bohol</p><h1>Weather today</h1><p>Current conditions and forecast information from OpenWeather for selected Philippine locations.</p></div><CloudSun size={76} strokeWidth={1.2} aria-hidden="true" /></div></section>
    <section className="section"><div className="container"><div className="weather-heading"><div><p className="eyebrow">Live conditions</p><h2>Weather updates</h2></div><button className="weather-refresh" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> {loading ? 'Updating…' : 'Refresh'}</button></div>
      {error ? <div className="weather-error"><strong>Weather unavailable</strong><p>{error}</p><button onClick={load}>Try again</button></div> : <>{main && <article className="weather-current"><div><p className="weather-location"><MapPin size={15}/> {main.name}, Philippines</p><strong className="weather-temp">{Math.round(main.main.temp)}°<sup>C</sup></strong><p className="weather-description">{main.weather[0].description}</p></div><img src={`https://openweathermap.org/img/wn/${main.weather[0].icon}@4x.png`} alt={main.weather[0].description} /><div className="weather-metrics"><span><Droplets size={16}/><b>{main.main.humidity}%</b><small>Humidity</small></span><span><Wind size={16}/><b>{Math.round(main.wind.speed)} m/s</b><small>Wind</small></span><span><Gauge size={16}/><b>{main.main.pressure} hPa</b><small>Pressure</small></span><span><Sunrise size={16}/><b>{formatTime(main.sys.sunrise)}</b><small>Sunrise</small></span><span><Sunset size={16}/><b>{formatTime(main.sys.sunset)}</b><small>Sunset</small></span></div></article>}
        <div className="weather-grid">{data.map(item => <article className={`weather-card ${item.name === main?.name ? 'selected' : ''}`} key={item.name}><div className="weather-card-top"><span>{item.name}</span><img src={`https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png`} alt="" /></div><strong>{Math.round(item.main.temp)}°C</strong><p>{item.weather[0].description}</p><small>Feels like {Math.round(item.main.feels_like)}° · Humidity {item.main.humidity}%</small></article>)}</div></>}
      <p className="weather-attribution">Weather data provided by <a href="https://openweathermap.org/" target="_blank" rel="noreferrer">OpenWeather</a>.</p><p className="weather-updated">{main ? `Updated ${new Date(main.dt * 1000).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</p>
    </div></section></main>
}
