import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Users, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { barangays as fallback } from '../../data/barangays'
import OpenStreetMap from '../../components/OpenStreetMap'
import BarangayRelatedSection from '../../components/BarangayRelatedSection'
import { ErrorPage, ResourceNotFound } from '../../components/RouteStatusPages'
import { publicApi } from '../../services/apiClient'

const safeCoverImage = (value) => {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value, window.location.origin)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.href
  } catch {
    return ''
  }
}

export default function BarangayDetail() {
  const { id } = useParams()
  const [barangay, setBarangay] = useState(() => fallback.find((item) => item.id === id) || null)
  const [loadState, setLoadState] = useState(() => fallback.some((item) => item.id === id) ? 'ready' : 'loading')
  useEffect(() => {
    let active = true
    const localRecord = fallback.find((item) => item.id === id || item.slug === id) || null
    setBarangay(localRecord)
    setLoadState(localRecord ? 'ready' : 'loading')
    publicApi('/barangays')
      .then((items) => {
        const record = items.find((item) => item.id === id || item.slug === id)
        if (!active) return
        setBarangay(record || localRecord)
        setLoadState(record || localRecord ? 'ready' : 'not-found')
      })
      .catch(() => { if (active) setLoadState(localRecord ? 'ready' : 'error') })
    return () => { active = false }
  }, [id])
  if (loadState === 'loading') return <main className="section"><div className="container"><p role="status">Loading barangay information…</p></div></main>
  if (loadState === 'error') return <ErrorPage code="503" title="Barangay information is temporarily unavailable" message="Please try again later." secondaryAction={{ label: 'Browse Barangays', to: '/barangays' }} />
  if (!barangay) return <ResourceNotFound type="barangay" />
  const coverImage = safeCoverImage(barangay.cover_image || barangay.heroImage)
  const map = barangay.coords && `https://www.openstreetmap.org/?mlat=${barangay.coords.lat}&mlon=${barangay.coords.lng}#map=15/${barangay.coords.lat}/${barangay.coords.lng}`
  const formatDate = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : null
  const heroStyle = coverImage ? { '--barangay-hero-image': `url(${JSON.stringify(coverImage)})` } : undefined
  return <main className="barangay-detail"><section className={`page-header barangay-hero${coverImage ? ' barangay-hero-with-image' : ''}`} style={heroStyle}><div className="container page-header-inner"><div><Link className="barangay-detail-back" to="/barangays"><ArrowLeft size={16} /> Barangays of Getafe</Link><div className="barangay-hero-content"><p className="barangay-hero-eyebrow">MUNICIPALITY OF GETAFE · BOHOL</p><h1 className="page-title">Barangay {barangay.name}</h1><p className="page-subtitle">Barangay information and community profile.</p></div></div></div></section><div className="container barangay-detail-content"><div className="barangay-detail-stats"><div><Users size={20}/><span>Population</span><strong>{typeof barangay.population === 'number' ? barangay.population.toLocaleString('en-PH') : '—'}</strong><small>2020 Census</small></div><div><UserRound size={20}/><span>Punong Barangay</span><Link className="barangay-captain-link" to={`/barangays/${barangay.id}/official`}><strong>{barangay.captain || 'View official'}</strong><ArrowRight size={15}/></Link><small>{barangay.termStart || barangay.termEnd ? `Term: ${formatDate(barangay.termStart) || '—'} – ${formatDate(barangay.termEnd) || 'Present'}` : 'View official profile'}</small></div><div className="barangay-location-card">{map ? <><div className="barangay-map-preview"><OpenStreetMap lat={Number(barangay.coords.lat)} lng={Number(barangay.coords.lng)} title={`${barangay.name} location map`} /></div><a className="barangay-map-link" href={map} target="_blank" rel="noreferrer">View map ↗</a></> : <strong>Unavailable</strong>}</div></div><nav className="barangay-action-links" aria-label={`Explore Barangay ${barangay.name}`}><Link to={`/barangays/${barangay.id}/official`} className="barangay-action-link"><UserRound size={17}/> View Punong Barangay <ArrowRight size={15}/></Link><Link to={`/barangays/${barangay.id}/officials`} className="barangay-action-link">Barangay officials <ArrowRight size={15}/></Link><Link to={`/services/barangay-clearance?barangay=${encodeURIComponent(barangay.name)}`} className="barangay-action-link">Barangay Clearance <ArrowRight size={15}/></Link></nav><article className="barangay-detail-card"><p className="history-kicker">ABOUT BARANGAY {barangay.name.toUpperCase()}</p><h2>Barangay information</h2>{barangay.description?.trim() ? <p>{barangay.description}</p> : <p>A detailed description for Barangay {barangay.name} is not currently available.</p>}{barangay.more_information?.trim() ? <div className="barangay-rich-content" dangerouslySetInnerHTML={{ __html: barangay.more_information }} /> : <><h3>More about {barangay.name}</h3><p>Population and location information for this barangay is maintained by the Municipality of Getafe. Check back for additional community profile details.</p></>}</article></div><BarangayRelatedSection barangay={barangay} /></main>
}
