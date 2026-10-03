import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, CalendarDays, ChevronDown, CircleHelp, CloudRain, Droplets, Eye, Gauge, MapPin, Sun, Sunrise, Thermometer, Wind, X } from 'lucide-react'

const hasValue = value => value !== null && value !== undefined && Number.isFinite(Number(value))
const compactNumber = (value, digits = 1) => hasValue(value) ? String(Number(Number(value).toFixed(digits))) : null
const fixedNumber = (value, digits = 0) => hasValue(value) ? Number(value).toFixed(digits) : null
const unitValue = (value, unit, digits = 0) => hasValue(value) ? `${fixedNumber(value, digits)} ${unit}` : null

function localDateTime(value, timezone, options = {}) {
  if (!hasValue(value)) return null
  try {
    return new Intl.DateTimeFormat('en-PH', { timeZone: timezone || 'Asia/Manila', ...options }).format(new Date(Number(value) * 1000))
  } catch { return null }
}

function localNow(date, timezone, options = {}) {
  try { return new Intl.DateTimeFormat('en-PH', { timeZone: timezone || 'Asia/Manila', ...options }).format(date) } catch { return null }
}

function formatDuration(seconds) {
  if (!hasValue(seconds)) return null
  const minutes = Math.round(Number(seconds) / 60)
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours ? `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}` : `${remainder} min`
}

function forecastDate(value) {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/)
  const date = isoDate
    ? new Date(`${isoDate[1]}T12:00:00+08:00`)
    : /^\d+(?:\.\d+)?$/.test(text)
      ? new Date(Number(text) > 10_000_000_000 ? Number(text) : Number(text) * 1000)
      : new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatForecastDate(value, timezone, options) {
  const date = forecastDate(value)
  if (!date) return null
  try { return new Intl.DateTimeFormat('en-PH', { timeZone: timezone || 'Asia/Manila', ...options }).format(date) } catch { return null }
}

function phaseLabel(value) {
  if (!hasValue(value)) return null
  const phases = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']
  return phases[Math.round((((Number(value) % 1) + 1) % 1) * phases.length) % phases.length]
}

function weatherIconPath(weather) {
  const description = String(`${weather?.condition || ''} ${weather?.description || ''}`).toLowerCase()
  if (description.includes('hail')) return '/assets/icons/weather/64/hail.png'
  if (description.includes('thunder') || description.includes('storm')) return '/assets/icons/weather/64/cloudy-skies-with-rainshowers-and-thunderstorm.png'
  if (description.includes('monsoon')) return '/assets/icons/weather/64/monsoon-rains.png'
  if (description.includes('snow') || description.includes('frost')) return '/assets/icons/weather/64/frost.png'
  if (description.includes('shower') || description.includes('heavy rain')) return '/assets/icons/weather/64/cloudy-skies-with-rainshowers.png'
  if (description.includes('rain') || description.includes('drizzle')) return '/assets/icons/weather/64/light-rains.png'
  if (description.includes('partly') || description.includes('few clouds') || description.includes('scattered clouds')) return '/assets/icons/weather/64/partly-cloudy-skies.png'
  if (description.includes('clear') || description.includes('sun')) return '/assets/icons/weather/64/clear-skies.png'
  return '/assets/icons/weather/64/cloudy-skies.png'
}

function weatherTone(current = {}) {
  const text = String(`${current.condition || ''} ${current.description || ''}`).toLowerCase()
  if (text.includes('thunder') || text.includes('storm')) return 'storm'
  if (text.includes('rain') || text.includes('drizzle') || text.includes('shower')) return 'rain'
  if (text.includes('clear') || text.includes('sun')) return 'clear'
  return 'cloud'
}

function WeatherIcon({ weather, className, alt = '' }) {
  return <img className={className} src={weatherIconPath(weather)} alt={alt || weather?.description || weather?.condition || ''} />
}

function hasAirQuality(weather) {
  const values = weather?.airQuality
  return Boolean(values && ['index', 'pm25', 'pm10', 'carbonMonoxide', 'nitrogenDioxide', 'ozone', 'sulfurDioxide'].some(key => hasValue(values[key])))
}

function hasAstronomy(weather) {
  const values = weather?.astronomy
  return Boolean(values && ['sunrise', 'sunset', 'daylightDuration', 'moonrise', 'moonset', 'moonPhase', 'moonIllumination'].some(key => hasValue(values[key])))
}

function hasAlerts(weather) { return Array.isArray(weather?.alerts) && weather.alerts.length > 0 }

function hasPrecipitation(weather) {
  const current = weather?.current || {}
  return ['precipitationProbability', 'precipitation', 'rain', 'snow', 'precipitationUntil'].some(key => hasValue(current[key])) || (weather?.hourly || []).some(hour => hasValue(hour.precipitationProbability) || hasValue(hour.precipitation) || hasValue(hour.rain) || hasValue(hour.snow))
}

function hasUV(weather) { return hasValue(weather?.current?.uvIndex) || (weather?.hourly || []).some(hour => hasValue(hour.uvIndex)) }
function hasVisibility(weather) { return hasValue(weather?.current?.visibility) || (weather?.hourly || []).some(hour => hasValue(hour.visibility)) }
function hasWindGust(weather) { return hasValue(weather?.current?.windGust) || (weather?.hourly || []).some(hour => hasValue(hour.windGust)) }
function hasHourlyForecast(weather) { return Array.isArray(weather?.hourly) && weather.hourly.length > 0 }
function hasWind(weather) { return hasValue(weather?.current?.windSpeed) || hasValue(weather?.current?.windDirection) || hasWindGust(weather) }

function currentDetailRows(weather) {
  const { current = {}, location = {} } = weather || {}
  const visibility = hasValue(current.visibility) ? `${compactNumber(Number(current.visibility) / 1000)} km` : null
  const rows = [
    ['Condition', current.condition], ['Description', current.description],
    ['Weather code', hasValue(current.code) ? String(current.code) : null], ['Icon code', current.icon],
    ['Day/night', typeof current.isDay === 'boolean' ? (current.isDay ? 'Day' : 'Night') : null],
    ['Cloud cover', unitValue(current.cloudCover, '%')], ['Humidity', unitValue(current.humidity, '%')],
    ['Dew point', unitValue(current.dewPoint, '°C', 1)], ['Sea-level pressure', unitValue(current.pressure, 'hPa', 2)],
    ['Surface pressure', unitValue(current.surfacePressure, 'hPa', 2)], ['Visibility', visibility],
    ['UV index', compactNumber(current.uvIndex)], ['Wind speed', unitValue(current.windSpeed, 'm/s', 1)],
    ['Wind direction', current.windDirection], ['Wind bearing', unitValue(current.windDegrees, '°')],
    ['Wind gust', unitValue(current.windGust, 'm/s', 1)], ['Precipitation', unitValue(current.precipitation, 'mm', 1)],
    ['Rain', unitValue(current.rain, 'mm', 1)],
    ['Snow', hasValue(current.snow) && Number(current.snow) > 0 ? unitValue(current.snow, 'mm', 1) : null],
    ['Precipitation type', current.precipitationType],
    ['Chance of precipitation', unitValue(current.precipitationProbability, '%')],
    ['Sunrise', localDateTime(current.sunrise, location.timezone, { hour: 'numeric', minute: '2-digit' })],
    ['Sunset', localDateTime(current.sunset, location.timezone, { hour: 'numeric', minute: '2-digit' })],
    ['Timezone', location.timezone],
    ['Observation time', localDateTime(current.observationTime, location.timezone, { dateStyle: 'medium', timeStyle: 'short' })],
  ]
  return rows.filter(([, value]) => value !== null && value !== undefined && value !== '')
}

function MetricList({ rows, className = '' }) {
  const visibleRows = rows.filter(([, value]) => value !== null && value !== undefined && value !== '')
  if (!visibleRows.length) return null
  return <dl className={`weather-detail-list ${className}`}>{visibleRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

const chartDefinitions = [
  { id: 'temperature', label: 'Temperature', lines: [{ key: 'temperature', label: 'Temperature', color: '#1e689e', unit: '°C' }, { key: 'feelsLike', label: 'Feels like', color: '#d38c3b', unit: '°C' }] },
  { id: 'rain', label: 'Rain', lines: [{ key: 'precipitationProbability', label: 'Rain chance', color: '#287ba9', unit: '%' }], bars: { key: 'precipitation', label: 'Rainfall', unit: 'mm' } },
  { id: 'wind', label: 'Wind', lines: [{ key: 'windSpeed', label: 'Wind', color: '#257d69', unit: 'm/s' }, { key: 'windGust', label: 'Gust', color: '#e19947', unit: 'm/s' }] },
  { id: 'humidity', label: 'Humidity', lines: [{ key: 'humidity', label: 'Humidity', color: '#4a83ba', unit: '%' }] },
  { id: 'pressure', label: 'Pressure', lines: [{ key: 'pressure', label: 'Pressure', color: '#765ca6', unit: 'hPa' }] },
  { id: 'cloudCover', label: 'Cloud cover', lines: [{ key: 'cloudCover', label: 'Cloud cover', color: '#627c96', unit: '%' }] },
]

function HourlyForecast({ hours = [], timezone, panelRef, requestedChart, onChartChange }) {
  const [activeChart, setActiveChart] = useState('temperature')
  const [activePoint, setActivePoint] = useState(null)
  const [selectedHour, setSelectedHour] = useState(null)
  const points = useMemo(() => hours.slice(0, 12), [hours])
  const availableCharts = useMemo(() => chartDefinitions.filter(chart => points.some(point => chart.lines.some(line => hasValue(point[line.key])) || (chart.bars && hasValue(point[chart.bars.key])))), [points])
  const selectedChart = availableCharts.find(chart => chart.id === activeChart) || availableCharts[0]
  const chart = useMemo(() => {
    if (!selectedChart || !points.length) return null
    const width = 900, left = 24, right = 876, top = 19, bottom = 150
    const values = points.flatMap(point => selectedChart.lines.map(line => point[line.key])).filter(hasValue).map(Number)
    if (!values.length) return null
    let min = Math.min(...values), max = Math.max(...values)
    if (selectedChart.id === 'rain') { min = 0; max = 100 }
    if (min === max) { min -= 1; max += 1 }
    const barValues = selectedChart.bars ? points.map(point => hasValue(point[selectedChart.bars.key]) ? Math.max(0, Number(point[selectedChart.bars.key])) : 0) : []
    const barMax = Math.max(0.1, ...barValues)
    const xAt = index => points.length === 1 ? width / 2 : left + (right - left) * index / (points.length - 1)
    const yAt = value => bottom - (Number(value) - min) / (max - min) * (bottom - top)
    const paths = selectedChart.lines.map(line => {
      let connected = false
      return { ...line, path: points.map((point, index) => {
        if (!hasValue(point[line.key])) { connected = false; return '' }
        const command = connected ? 'L' : 'M'
        connected = true
        return `${command} ${xAt(index)} ${yAt(point[line.key])}`
      }).filter(Boolean).join(' ') }
    })
    const barY = value => bottom - value / barMax * 40
    return { width, left, right, top, bottom, xAt, yAt, paths, barValues, barY }
  }, [points, selectedChart])
  const tooltipPoint = activePoint === null ? null : points[activePoint]

  useEffect(() => {
    if (availableCharts.some(item => item.id === activeChart)) return
    setActiveChart(availableCharts[0]?.id || '')
  }, [activeChart, availableCharts])

  useEffect(() => {
    if (requestedChart && availableCharts.some(item => item.id === requestedChart)) setActiveChart(requestedChart)
  }, [requestedChart, availableCharts])

  function changeChart(id) {
    setActiveChart(id)
    onChartChange?.(id)
  }

  const selectedRows = selectedHour ? [
    ['Condition', selectedHour.description || selectedHour.condition],
    ['Temperature', unitValue(selectedHour.temperature, '°C')],
    ['Feels like', unitValue(selectedHour.feelsLike, '°C')],
    ['Rain chance', unitValue(selectedHour.precipitationProbability, '%')],
    ['Precipitation', unitValue(selectedHour.precipitation, 'mm', 1)],
    ['Rainfall', unitValue(selectedHour.rain, 'mm', 1)],
    ['Snowfall', hasValue(selectedHour.snow) && Number(selectedHour.snow) > 0 ? unitValue(selectedHour.snow, 'mm', 1) : null],
    ['Humidity', unitValue(selectedHour.humidity, '%')],
    ['Cloud cover', unitValue(selectedHour.cloudCover, '%')],
    ['Wind', unitValue(selectedHour.windSpeed, 'm/s', 1)],
    ['Wind direction', selectedHour.windDirection], ['Wind bearing', unitValue(selectedHour.windDegrees, '°')],
    ['Wind gust', unitValue(selectedHour.windGust, 'm/s', 1)],
    ['Pressure', unitValue(selectedHour.pressure, 'hPa', 2)],
    ['Visibility', hasVisibility({ hourly: hours }) && hasValue(selectedHour.visibility) ? `${compactNumber(Number(selectedHour.visibility) / 1000)} km` : null],
    ['UV index', hasUV({ hourly: hours }) && hasValue(selectedHour.uvIndex) ? compactNumber(selectedHour.uvIndex) : null],
    ['Weather code', hasValue(selectedHour.code) ? String(selectedHour.code) : null],
    ['Day/night', typeof selectedHour.isDay === 'boolean' ? (selectedHour.isDay ? 'Day' : 'Night') : null],
    ['Precipitation type', selectedHour.precipitationType],
  ] : []

  return <section className="weather-hourly" aria-labelledby="weather-hourly-title" ref={panelRef}>
    <div className="weather-panel-heading"><div><p className="eyebrow">Next several hours</p><h3 id="weather-hourly-title">Hourly forecast</h3></div><span className="weather-hourly-timezone">{timezone}</span></div>
    {availableCharts.length > 0 && <div className="weather-chart-tabs" role="tablist" aria-label="Hourly weather charts">{availableCharts.map(item => <button type="button" role="tab" aria-selected={selectedChart?.id === item.id} className={selectedChart?.id === item.id ? 'active' : ''} key={item.id} onClick={() => changeChart(item.id)}>{item.label}</button>)}</div>}
    {chart && selectedChart && <div className="weather-chart-area" onMouseLeave={() => setActivePoint(null)}>
      <div className="weather-chart-legend">{selectedChart.lines.map(line => <span key={line.key}><i style={{ background: line.color }} />{line.label}</span>)}{selectedChart.bars && <span><i className="weather-chart-legend-bar" />{selectedChart.bars.label}</span>}</div>
      {tooltipPoint && <div className={`weather-data-tooltip ${activePoint > points.length * .72 ? 'align-right' : activePoint < points.length * .28 ? 'align-left' : ''}`} style={{ left: `${activePoint / Math.max(1, points.length - 1) * 100}%` }} role="status">
        <strong>{localDateTime(tooltipPoint.time, timezone, { hour: 'numeric', minute: '2-digit' })}</strong>
        {[
          { key: 'temperature', label: 'Temperature', color: '#1e689e', unit: '°C' },
          { key: 'precipitationProbability', label: 'Rain chance', color: '#287ba9', unit: '%' },
          { key: 'precipitation', label: 'Rainfall', color: '#b5d8eb', unit: 'mm' },
        ].filter(item => hasValue(tooltipPoint[item.key])).map(item => <span key={item.key}><i className={item.key === 'precipitation' ? 'weather-chart-tooltip-bar' : ''} style={{ background: item.color }} />{item.label}<b>{unitValue(tooltipPoint[item.key], item.unit, item.key === 'precipitation' ? 1 : 0)}</b></span>)}
        {selectedChart.lines.filter(line => !['temperature', 'precipitationProbability'].includes(line.key) && hasValue(tooltipPoint[line.key])).map(line => <span key={line.key}><i style={{ background: line.color }} />{line.label}<b>{unitValue(tooltipPoint[line.key], line.unit, line.unit === 'hPa' ? 1 : 0)}</b></span>)}
        {selectedChart.bars && selectedChart.bars.key !== 'precipitation' && hasValue(tooltipPoint[selectedChart.bars.key]) && <span><i className="weather-chart-tooltip-bar" />{selectedChart.bars.label}<b>{unitValue(tooltipPoint[selectedChart.bars.key], selectedChart.bars.unit, 1)}</b></span>}
      </div>}
      <svg className="weather-chart" viewBox={`0 0 ${chart.width} 170`} preserveAspectRatio="none" aria-label={`${selectedChart.label} by hour`}>
        {[0, 1, 2].map(index => <line key={index} x1={chart.left} x2={chart.right} y1={chart.top + (chart.bottom - chart.top) * index / 2} y2={chart.top + (chart.bottom - chart.top) * index / 2} className="weather-chart-gridline" />)}
        {chart.barValues.map((amount, index) => <rect key={`bar-${points[index].time}`} x={chart.xAt(index) - 11} y={chart.barY(amount)} width="22" height={chart.bottom - chart.barY(amount)} rx="5" className="weather-chart-rainbar" />)}
        {chart.paths.map(line => <path key={line.key} d={line.path} fill="none" stroke={line.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
        {points.map((point, index) => <g key={point.time} className="weather-chart-point" onMouseEnter={() => setActivePoint(index)}>
          {selectedChart.lines.filter(line => hasValue(point[line.key])).map(line => <circle key={line.key} cx={chart.xAt(index)} cy={chart.yAt(point[line.key])} r="4" fill="#fff" stroke={line.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />)}
          <circle cx={chart.xAt(index)} cy={chart.bottom - 10} r="17" fill="transparent" tabIndex="0" role="button" aria-label={`${localDateTime(point.time, timezone, { hour: 'numeric' })} hourly forecast details`} onFocus={() => setActivePoint(index)} onBlur={() => setActivePoint(null)} />
        </g>)}
      </svg>
    </div>}
    {points.length > 0 ? <>
      <div className="weather-hourly-scroll" aria-label="Upcoming hourly conditions">
        {points.map((point, index) => <button type="button" className={`weather-hour-cell ${selectedHour?.time === point.time ? 'selected' : ''}`} aria-expanded={selectedHour?.time === point.time} key={point.time} onClick={() => setSelectedHour(selectedHour?.time === point.time ? null : point)}>
          <time dateTime={new Date(point.time * 1000).toISOString()}>{localDateTime(point.time, timezone, { hour: 'numeric' })}</time>
          <WeatherIcon weather={point} alt={point.description || point.condition || 'Weather'} />
          {point.description && <span className="weather-hour-condition">{point.description}</span>}
          {hasValue(point.precipitationProbability) && <span className="weather-hour-rain"><Droplets size={12} aria-hidden="true" />{compactNumber(point.precipitationProbability, 0)}%</span>}
          {hasValue(point.temperature) && <strong>{compactNumber(point.temperature, 0)}°</strong>}
        </button>)}
      </div>
      {selectedHour && <div className="weather-hour-details"><div><strong>{localDateTime(selectedHour.time, timezone, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong><button type="button" onClick={() => setSelectedHour(null)} aria-label="Close hourly details" data-icon-button="ghost"><X size={15} /></button></div><MetricList rows={selectedRows} className="weather-hour-detail-grid" /></div>}
    </> : <p className="weather-hourly-empty">Hourly forecast is not available in the cached weather response.</p>}
  </section>
}

function PrecipitationCard({ weather, onRainChart }) {
  const current = weather.current
  const hours = weather.hourly || []
  const nextHours = hours.slice(0, 12)
  const rainfallValues = nextHours.map(hour => hour.precipitation).filter(hasValue).map(Number)
  const maxRain = Math.max(.1, ...rainfallValues)
  const forecastTotal = hours.map(hour => hour.precipitation).filter(hasValue).reduce((sum, value) => sum + Number(value), 0)
  const hasForecastTotal = hours.some(hour => hasValue(hour.precipitation))
  const wetHours = hours.filter(hour => hasValue(hour.precipitation) && Number(hour.precipitation) > 0)
  const rainChance = hasValue(current.precipitationProbability) ? current.precipitationProbability : hours.find(hour => hasValue(hour.precipitationProbability))?.precipitationProbability
  const rows = [
    ['Chance of rain', unitValue(rainChance, '%')],
    ['Current precipitation', unitValue(current.precipitation, 'mm', 1)],
    ['Rainfall amount', unitValue(current.rain, 'mm', 1)],
    ['Expected next 24 hours', hasForecastTotal ? `${compactNumber(forecastTotal)} mm` : null],
    ['Precipitation type', current.precipitationType],
    ['Next precipitation time', localDateTime(current.precipitationUntil, weather.location.timezone, { hour: 'numeric', minute: '2-digit' })],
    ['Forecast rain window', wetHours.length ? `${localDateTime(wetHours[0].time, weather.location.timezone, { hour: 'numeric' })}–${localDateTime(wetHours.at(-1).time, weather.location.timezone, { hour: 'numeric' })}` : null],
    ['Snowfall', hasValue(current.snow) && Number(current.snow) > 0 ? unitValue(current.snow, 'mm', 1) : null],
  ]
  return <article className="weather-insight-card weather-rain-card"><div className="weather-insight-title"><span className="weather-insight-icon"><CloudRain size={17} /></span><div><p className="eyebrow">Rain</p><h3>Precipitation</h3></div></div>
    {hasPrecipitation(weather) ? <>
      <MetricList rows={rows} className="weather-insight-list" />
      {nextHours.some(hour => hasValue(hour.precipitation)) && <div className="weather-rain-bars" aria-label="Hourly rainfall forecast">{nextHours.map(hour => <div key={hour.time} title={`${localDateTime(hour.time, weather.location.timezone, { hour: 'numeric' })}: ${unitValue(hour.precipitation, 'mm', 1) || 'no rainfall value'}`}><span style={{ height: `${Math.max(3, (Number(hour.precipitation || 0) / maxRain) * 100)}%` }} /><small>{localDateTime(hour.time, weather.location.timezone, { hour: 'numeric' })}</small></div>)}</div>}
      <button className="weather-insight-link" type="button" onClick={onRainChart}>Open hourly rain chart</button>
    </> : <p className="weather-insight-empty">Precipitation details are not available.</p>}
  </article>
}

function WindCard({ weather, onWindChart }) {
  const current = weather.current
  const hours = (weather.hourly || []).slice(0, 8)
  const rows = [
    ['Wind speed', unitValue(current.windSpeed, 'm/s', 1)], ['Direction', current.windDirection],
    ['Bearing', unitValue(current.windDegrees, '°')], ['Gust speed', unitValue(current.windGust, 'm/s', 1)],
  ]
  return <article className="weather-insight-card weather-wind-card"><div className="weather-insight-title"><span className="weather-insight-icon"><Wind size={17} /></span><div><p className="eyebrow">Wind</p><h3>Wind conditions</h3></div></div>
    {hasWind(weather) ? <>
      <div className="weather-wind-summary">{hasValue(current.windDegrees) && <span className="weather-compass" aria-label={`Wind bearing ${compactNumber(current.windDegrees, 0)} degrees`}><span className="weather-compass-arrow" style={{ transform: `rotate(${Number(current.windDegrees)}deg)` }}>↑</span><small>N</small></span>}<MetricList rows={rows} className="weather-insight-list" /></div>
      {hours.some(hour => hasValue(hour.windSpeed)) && <div className="weather-wind-hourly"><span>Hourly wind</span><div>{hours.map(hour => <span key={hour.time} title={`${localDateTime(hour.time, weather.location.timezone, { hour: 'numeric' })}: ${unitValue(hour.windSpeed, 'm/s', 1) || '—'}${hasValue(hour.windGust) ? ` · gust ${unitValue(hour.windGust, 'm/s', 1)}` : ''}`}><b>{unitValue(hour.windSpeed, 'm/s', 1) || '—'}</b><small>{localDateTime(hour.time, weather.location.timezone, { hour: 'numeric' })}</small></span>)}</div></div>}
      <button className="weather-insight-link" type="button" onClick={onWindChart}>Open hourly wind chart</button>
    </> : <p className="weather-insight-empty">Wind details are not available.</p>}
  </article>
}

function SunMoonCard({ weather, now }) {
  const { astronomy = {}, location = {} } = weather
  const sunrise = astronomy.sunrise
  const sunset = astronomy.sunset
  const hasProgress = hasValue(sunrise) && hasValue(sunset) && Number(sunset) > Number(sunrise)
  const progress = hasProgress ? Math.min(100, Math.max(0, (now.getTime() / 1000 - Number(sunrise)) / (Number(sunset) - Number(sunrise)) * 100)) : null
  const rows = [
    ['Sunrise', localDateTime(astronomy.sunrise, location.timezone, { hour: 'numeric', minute: '2-digit' })],
    ['Sunset', localDateTime(astronomy.sunset, location.timezone, { hour: 'numeric', minute: '2-digit' })],
    ['Daylight', formatDuration(astronomy.daylightDuration)],
    ['Moonrise', localDateTime(astronomy.moonrise, location.timezone, { hour: 'numeric', minute: '2-digit' })],
    ['Moonset', localDateTime(astronomy.moonset, location.timezone, { hour: 'numeric', minute: '2-digit' })],
    ['Moon phase', phaseLabel(astronomy.moonPhase)],
    ['Moon illumination', unitValue(astronomy.moonIllumination, '%')],
  ]
  return <article className="weather-insight-card"><div className="weather-insight-title"><span className="weather-insight-icon"><Sunrise size={17} /></span><div><p className="eyebrow">Daylight & lunar</p><h3>Sun & Moon</h3></div></div>
    {hasAstronomy(weather) ? <>
      <MetricList rows={rows} className="weather-insight-list" />
      {hasProgress && <div className="weather-daylight-progress"><div><span>Sunrise</span><b>{Math.round(progress)}% daylight</b><span>Sunset</span></div><div className="weather-daylight-track"><span style={{ width: `${progress}%` }} /></div></div>}
    </> : <p className="weather-insight-empty">Sun and moon data are not available.</p>}
  </article>
}

function AirQualityCard({ weather }) {
  const air = weather.airQuality
  const unit = air.unit ? ` ${air.unit}` : ''
  const rows = [
    ['Air quality index', compactNumber(air.index, 0)], ['PM2.5', hasValue(air.pm25) ? `${compactNumber(air.pm25)}${unit}` : null],
    ['PM10', hasValue(air.pm10) ? `${compactNumber(air.pm10)}${unit}` : null],
    ['Carbon monoxide', hasValue(air.carbonMonoxide) ? `${compactNumber(air.carbonMonoxide)}${unit}` : null],
    ['Nitrogen dioxide', hasValue(air.nitrogenDioxide) ? `${compactNumber(air.nitrogenDioxide)}${unit}` : null],
    ['Ozone', hasValue(air.ozone) ? `${compactNumber(air.ozone)}${unit}` : null],
    ['Sulfur dioxide', hasValue(air.sulfurDioxide) ? `${compactNumber(air.sulfurDioxide)}${unit}` : null],
  ]
  return <article className="weather-insight-card"><div className="weather-insight-title"><span className="weather-insight-icon"><Activity size={17} /></span><div><p className="eyebrow">Air quality</p><h3>Air quality</h3></div></div><MetricList rows={rows} className="weather-insight-list" />{air.provider && <small className="weather-insight-source">Source: {air.provider}</small>}</article>
}

function dailyRows(day, timezone) {
  const rows = [
    ['Date', day.date ? new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'short', day: 'numeric', timeZone: timezone || 'Asia/Manila' }).format(new Date(`${day.date}T12:00:00+08:00`)) : null],
    ['Condition', day.condition], ['Maximum temperature', unitValue(day.temperatureMax, '°C')],
    ['Minimum temperature', unitValue(day.temperatureMin, '°C')], ['Average temperature', unitValue(day.temperatureMean, '°C', 1)],
    ['Maximum feels-like', unitValue(day.feelsLikeMax, '°C')], ['Rain probability', unitValue(day.precipitationProbabilityMax, '%')],
    ['Total precipitation', unitValue(day.precipitation, 'mm', 1)], ['Rainfall', unitValue(day.rain, 'mm', 1)],
    ['Snowfall', hasValue(day.snow) && Number(day.snow) > 0 ? unitValue(day.snow, 'mm', 1) : null],
    ['Maximum wind', unitValue(day.windSpeedMax, 'm/s', 1)], ['Wind gust', unitValue(day.windGustMax, 'm/s', 1)],
    ['Dominant wind direction', day.windDirection], ['Wind bearing', unitValue(day.windDegrees, '°')],
    ['Average humidity', unitValue(day.humidityMean, '%', 0)], ['Average cloud cover', unitValue(day.cloudCoverMean, '%', 0)],
    ['Visibility', hasValue(day.visibilityMean) ? `${compactNumber(Number(day.visibilityMean) / 1000)} km` : null],
    ['UV index', compactNumber(day.uvIndexMax)],
    ['Sunrise', localDateTime(day.sunrise, timezone, { hour: 'numeric', minute: '2-digit' })],
    ['Sunset', localDateTime(day.sunset, timezone, { hour: 'numeric', minute: '2-digit' })],
    ['Daylight duration', formatDuration(day.daylightDuration)], ['Moon phase', phaseLabel(day.moonPhase)],
    ['Moonrise', localDateTime(day.moonrise, timezone, { hour: 'numeric', minute: '2-digit' })],
    ['Moonset', localDateTime(day.moonset, timezone, { hour: 'numeric', minute: '2-digit' })],
    ['Moon illumination', unitValue(day.moonIllumination, '%')],
  ]
  return rows.filter(([, value]) => value !== null && value !== undefined && value !== '')
}

function FiveDayOutlook({ days = [], location }) {
  const [expandedDate, setExpandedDate] = useState(null)
  if (!days.length) return null
  return <section className="weather-outlook" aria-labelledby="weather-outlook-title"><div className="weather-outlook-heading"><div><p className="eyebrow">Plan ahead</p><h2 id="weather-outlook-title">5-day outlook for {location.name}</h2></div><span>Daily forecast</span></div>
    <div className="weather-outlook-grid">{days.slice(0, 5).map(day => {
      const expanded = expandedDate === day.date
      const weekday = formatForecastDate(day.date, location.timezone, { weekday: 'short' })
      const dateLabel = formatForecastDate(day.date, location.timezone, { month: 'short', day: 'numeric' })
      return <article className={`weather-outlook-card ${expanded ? 'expanded' : ''}`} key={day.date}>
        <button type="button" className="weather-day-toggle" aria-expanded={expanded} onClick={() => setExpandedDate(expanded ? null : day.date)}>
          <span className="weather-day-date">{weekday && <b>{weekday}</b>}{dateLabel && <small>{dateLabel}</small>}</span>
          <WeatherIcon weather={day} />
          <strong>{hasValue(day.temperatureMax) && <>{compactNumber(day.temperatureMax, 0)}°</>}{hasValue(day.temperatureMax) && hasValue(day.temperatureMin) && <small> / </small>}{hasValue(day.temperatureMin) && <small>{compactNumber(day.temperatureMin, 0)}°</small>}</strong>
          {day.condition && <span className="weather-day-condition">{day.condition}</span>}
          {hasValue(day.precipitationProbabilityMax) && <span className="weather-day-rain"><Droplets size={13} />{compactNumber(day.precipitationProbabilityMax, 0)}% rain chance</span>}
          <ChevronDown size={15} className="weather-day-chevron" aria-hidden="true" />
        </button>
        {expanded && <MetricList rows={dailyRows(day, location.timezone)} className="weather-day-details" />}
      </article>
    })}</div>
  </section>
}

function AlertDetails({ alerts, onClose, timezone }) {
  return <div className="weather-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="weather-modal weather-alert-modal" role="dialog" aria-modal="true" aria-labelledby="weather-alert-modal-title"><button type="button" className="weather-modal-close" onClick={onClose} aria-label="Close weather alerts" data-icon-button="ghost"><X size={19} /></button><p className="eyebrow">Official weather advisories</p><h2 id="weather-alert-modal-title">Weather alerts ({alerts.length})</h2><div className="weather-alert-list">{alerts.map((alert, index) => <article className={`weather-alert-detail ${alert.severity ? `severity-${String(alert.severity).toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}`} key={`${alert.type || alert.headline || 'alert'}-${alert.effective || index}`}>
    <div className="weather-alert-detail-heading"><div>{alert.type && <span className="weather-alert-type">{alert.type}</span>}<h3>{alert.headline || alert.type || 'Weather alert'}</h3></div>{alert.severity && <b>{alert.severity}</b>}</div>
    <MetricList rows={[
      ['Urgency', alert.urgency], ['Certainty', alert.certainty], ['Effective', localDateTime(alert.effective, timezone, { dateStyle: 'medium', timeStyle: 'short' })],
      ['Expires', localDateTime(alert.expires, timezone, { dateStyle: 'medium', timeStyle: 'short' })], ['Affected areas', alert.areas], ['Source', alert.source],
    ]} className="weather-alert-meta" />
    {alert.description && <p>{alert.description}</p>}{alert.instructions && <p className="weather-alert-instructions"><strong>Instructions:</strong> {alert.instructions}</p>}
  </article>)}</div></section></div>
}

function WeatherDetailsModal({ weather, onClose }) {
  const { location, current } = weather
  return <div className="weather-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="weather-modal weather-details-modal" role="dialog" aria-modal="true" aria-labelledby="weather-details-title"><button type="button" className="weather-modal-close" onClick={onClose} aria-label="Close weather details" data-icon-button="ghost"><X size={19} /></button><div className="weather-modal-heading"><div><p className="eyebrow">Current conditions</p><h2 id="weather-details-title">{location.name}</h2>{current.description && <p>{current.description}</p>}</div><WeatherIcon weather={current} /></div><div className="weather-modal-temp">{hasValue(current.temperature) && <strong>{compactNumber(current.temperature, 0)}°</strong>}{hasValue(current.feelsLike) && <span>Feels like {compactNumber(current.feelsLike, 0)}°C</span>}</div><MetricList rows={currentDetailRows(weather)} className="weather-modal-weather-list" /></section></div>
}

function CurrentWeatherCard({ weather, now, onOpenAlerts }) {
  const { current, location } = weather
  const metrics = [
    { label: 'Wind', value: unitValue(current.windSpeed, 'm/s', 1), icon: Wind },
    { label: 'Humidity', value: unitValue(current.humidity, '%'), icon: Droplets },
    { label: 'Visibility', value: hasValue(current.visibility) ? `${compactNumber(Number(current.visibility) / 1000)} km` : null, icon: Eye },
    { label: 'Pressure', value: unitValue(current.pressure, 'hPa', 2), icon: Gauge },
    { label: 'UV index', value: compactNumber(current.uvIndex), icon: Sun },
    { label: 'Dew point', value: unitValue(current.dewPoint, '°C', 1), icon: Thermometer },
  ].filter(item => item.value !== null)
  return <article className={`weather-current weather-sky-${weatherTone(current)}`} aria-label={`Current weather for ${location.name}`}>
    <div className="weather-current-topline"><div><p className="weather-current-eyebrow">Current weather</p><p className="weather-location"><MapPin size={14} aria-hidden="true" />{location.name}</p>{(location.province || location.region) && <p className="weather-location-area">{[location.province, location.region].filter(Boolean).join(' · ')}</p>}</div>{hasAlerts(weather) && <button className="weather-alert-badge" type="button" onClick={onOpenAlerts}><AlertTriangle size={13} />{weather.alerts.length} {weather.alerts.length === 1 ? 'Alert' : 'Alerts'}</button>}</div>
    <div className="weather-current-time"><CalendarDays size={13} /><span>{localNow(now, location.timezone, { weekday: 'short', month: 'short', day: 'numeric' })}</span><b>{localNow(now, location.timezone, { hour: 'numeric', minute: '2-digit' })}</b></div>
    <div className="weather-current-summary"><div className="weather-current-reading">{hasValue(current.temperature) && <strong className="weather-temp" id="weather-current-title">{compactNumber(current.temperature, 0)}<sup>°C</sup></strong>}{current.description && <p className="weather-description">{current.description}</p>}{hasValue(current.feelsLike) && <p className="weather-feels-like"><Thermometer size={14} aria-hidden="true" /> Feels like {compactNumber(current.feelsLike, 0)}°C</p>}{typeof current.isDay === 'boolean' && <span className="weather-day-night">{current.isDay ? 'Daytime' : 'Nighttime'}</span>}</div><div className="weather-current-art"><WeatherIcon weather={current} className="weather-current-icon" alt={current.description || 'Current conditions'} /></div></div>
    {metrics.length > 0 && <div className="weather-current-metrics" aria-label="Current weather metrics">{metrics.map(({ label, value, icon: Icon }) => <div className="weather-metric" key={label}><Icon size={15} aria-hidden="true" /><span>{label}</span><strong>{value}</strong></div>)}</div>}
    <div className="weather-current-meta"><span>{location.timezone && `Timezone · ${location.timezone}`}</span>{hasValue(current.observationTime) && <span>Observed {localNow(new Date(Number(current.observationTime) * 1000), location.timezone, { hour: 'numeric', minute: '2-digit' })}</span>}</div>
    <details className="weather-more-details"><summary>More current details <ChevronDown size={15} /></summary><MetricList rows={currentDetailRows(weather)} className="weather-current-details" /></details>
  </article>
}

function WeatherLocations({ items, selected, onSelect }) {
  if (items.length < 2) return null
  return <section className="weather-locations" aria-labelledby="weather-locations-title"><div className="weather-locations-heading"><h3 id="weather-locations-title">Weather across the Philippines</h3><span>Choose a city to view its current details</span></div><div className="weather-grid">{items.map(item => {
    const { location, current } = item
    return <button type="button" className={`weather-card ${item === selected ? 'selected' : ''}`} key={`${location.name}-${location.latitude}`} onClick={() => onSelect(item)} aria-label={`View detailed weather for ${location.name}`}><div className="weather-card-top"><span>{location.name}</span><WeatherIcon weather={current} /></div>{hasValue(current.temperature) && <strong>{compactNumber(current.temperature, 0)}°C</strong>}{current.description && <p>{current.description}</p>}{hasValue(current.feelsLike) && hasValue(current.humidity) && <small>Feels like {compactNumber(current.feelsLike, 0)}° · Humidity {compactNumber(current.humidity, 0)}%</small>}<span className="weather-card-hint">View details</span></button>
  })}</div></section>
}

export default function Weather() {
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [requestedChart, setRequestedChart] = useState('temperature')
  const [now, setNow] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const hourlyPanelRef = useRef(null)
  const load = () => {
    setLoading(true)
    setError('')
    fetch('/api/weather')
      .then(response => response.ok ? response.json() : response.json().then(value => Promise.reject(new Error(value.error))))
      .then(setLocations)
      .catch(value => setError(value.message || 'Weather data is unavailable right now.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const refresh = setInterval(load, 15 * 60 * 1000)
    const clock = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => { clearInterval(refresh); clearInterval(clock) }
  }, [])
  useEffect(() => {
    if (!selectedLocation && !alertsOpen) return undefined
    const closeOnEscape = event => { if (event.key === 'Escape') { setSelectedLocation(null); setAlertsOpen(false) } }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selectedLocation, alertsOpen])

  const currentWeather = locations.find(item => item.location?.municipality === 'Getafe') || locations[0]
  const hourly = currentWeather?.hourly || []
  const daily = currentWeather?.daily || []
  const providerName = currentWeather?.providers?.name || currentWeather?.providers?.sources?.join(' · ') || null
  const current = currentWeather?.current

  function focusHourlyChart(mode) {
    setRequestedChart(mode)
    hourlyPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return <main className="weather-page"><section className="section"><div className="container">
    <div className="weather-heading"><div><h2>Weather updates</h2></div><a className="weather-heading-help" href="#weather-about-title" aria-label="Learn about weather data" data-icon-button="ghost"><CircleHelp size={16} aria-hidden="true" /></a></div>
    {error ? <div className="weather-error"><strong>Weather unavailable</strong><p>{error}</p><button onClick={load}>Try again</button></div> : currentWeather ? <>
      <div className={`weather-dashboard ${hasHourlyForecast(currentWeather) ? '' : 'solo'}`}><CurrentWeatherCard weather={currentWeather} now={now} onOpenAlerts={() => setAlertsOpen(true)} />{hasHourlyForecast(currentWeather) && <HourlyForecast hours={hourly} timezone={currentWeather.location.timezone} panelRef={hourlyPanelRef} requestedChart={requestedChart} onChartChange={setRequestedChart} />}</div>
      <div className="weather-insights-grid">
        {hasPrecipitation(currentWeather) && <PrecipitationCard weather={currentWeather} onRainChart={() => focusHourlyChart('rain')} />}
        {hasWind(currentWeather) && <WindCard weather={currentWeather} onWindChart={() => focusHourlyChart('wind')} />}
        {hasAstronomy(currentWeather) && <SunMoonCard weather={currentWeather} now={now} />}
        {hasAirQuality(currentWeather) && <AirQualityCard weather={currentWeather} />}
      </div>
      <FiveDayOutlook days={daily} location={currentWeather.location} />
      {hasAlerts(currentWeather) && <section className="weather-alerts" aria-labelledby="weather-alerts-title"><div className="weather-outlook-heading"><div><p className="eyebrow">Official advisories</p><h2 id="weather-alerts-title">Weather alerts</h2></div><button className="weather-alert-badge" type="button" onClick={() => setAlertsOpen(true)}><AlertTriangle size={14} />{currentWeather.alerts.length} {currentWeather.alerts.length === 1 ? 'Alert' : 'Alerts'}</button></div><div className="weather-alert-summary-list">{currentWeather.alerts.map((alert, index) => <button type="button" key={`${alert.type || alert.headline}-${alert.effective || index}`} onClick={() => setAlertsOpen(true)}><b>{alert.headline || alert.type || 'Weather advisory'}</b>{(alert.severity || alert.urgency || alert.source) && <span>{alert.severity || alert.urgency || alert.source}</span>}</button>)}</div></section>}
      <WeatherLocations items={locations} selected={currentWeather} onSelect={setSelectedLocation} />
      {hasValue(current.lastUpdatedAt) && <p className="weather-data-footer">Last updated: {localDateTime(current.lastUpdatedAt, currentWeather.location.timezone, { hour: 'numeric', minute: '2-digit' })}{providerName && <> · Weather data: {providerName}</>}{hasValue(current.observationTime) && <> · Observation: {localDateTime(current.observationTime, currentWeather.location.timezone, { hour: 'numeric', minute: '2-digit' })}</>}</p>}
    </> : loading ? <p className="weather-loading">Loading the latest weather conditions…</p> : null}
    <section className="weather-about" aria-labelledby="weather-about-title"><h2 id="weather-about-title">About Weather Data</h2><p className="weather-about-intro">Current conditions, hourly trends, and the 5-day outlook use the municipality weather feed, combining available observations with global forecast models.</p><p className="weather-about-refresh-note"><strong>Refresh schedule:</strong> Weather information refreshes every 15 minutes from a shared cached response.</p><div className="weather-about-grid"><article className="weather-about-item"><h3>Understanding the Data</h3><p>Temperatures are displayed in Celsius. Measurements appear when a weather provider supplies a valid value; unsupported fields are omitted.</p></article><article className="weather-about-item"><h3>Weather Advisories</h3><p>For official weather advisories, warnings, and detailed forecasts, visit the <a href="https://bagong.pagasa.dost.gov.ph/" target="_blank" rel="noreferrer">PAGASA official website</a>.</p></article></div><p className="weather-about-source">Sources: {currentWeather?.providers?.sources?.join(' · ') || currentWeather?.providers?.name || 'Weather providers'}</p></section>
  </div></section>
  {selectedLocation && <WeatherDetailsModal weather={selectedLocation} onClose={() => setSelectedLocation(null)} />}
  {alertsOpen && currentWeather && <AlertDetails alerts={currentWeather.alerts} timezone={currentWeather.location.timezone} onClose={() => setAlertsOpen(false)} />}
  </main>
}
