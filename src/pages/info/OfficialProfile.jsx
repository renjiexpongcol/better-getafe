import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ErrorPage, ResourceNotFound } from '../../components/RouteStatusPages'
import { publicApi } from '../../services/apiClient'

const PLACEHOLDER = '/assets/brgy-user-vector/profile-circle.svg'
const formatDate = value => {
  if (!value) return null
  const text = String(value)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00Z`) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(date)
}
const biographyParagraphs = value => String(value || '').split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z][a-z])/).map(part => part.trim()).filter(Boolean)
const statusLabel = value => ({ current: 'Current term', previous: 'Previous term', future: 'Future term', unknown: 'Term status unavailable' })[value] || 'Term status unavailable'

function TermDetails({ official }) {
  const term = official.term || {}
  if (!term.start && !term.end && !term.service?.start && !term.service?.end) return null
  return <section className="official-profile-section"><h2>{term.status === 'current' ? 'Current term' : 'Term of office'}</h2><dl className="official-detail-list"><div><dt>Office</dt><dd>{official.role || official.position?.name}</dd></div>{term.start && <div><dt>Term started</dt><dd>{formatDate(term.start)}</dd></div>}{term.end && <div><dt>Expected end</dt><dd>{formatDate(term.end)}</dd></div>}{term.assumption_type && term.assumption_type !== 'unknown' && <div><dt>Assumed office through</dt><dd>{term.assumption_type[0].toUpperCase() + term.assumption_type.slice(1)}</dd></div>}{term.service?.start && <div><dt>Actual service started</dt><dd>{formatDate(term.service.start)}</dd></div>}{term.service?.end && <div><dt>Actual service ended</dt><dd>{formatDate(term.service.end)}</dd></div>}</dl></section>
}

function ElectionDetails({ election }) {
  if (!election) return null
  return <section className="official-profile-section"><h2>Election information</h2><dl className="official-detail-list"><div><dt>Election</dt><dd>{election.year}{election.type ? ` ${election.type.replace(/-/g, ' ')}` : ' Local Election'}</dd></div><div><dt>Result</dt><dd>Elected</dd></div>{election.party && <div><dt>Party</dt><dd>{election.party}</dd></div>}{Number.isInteger(election.votes) && <div><dt>Votes</dt><dd>{election.votes.toLocaleString('en-PH')}</dd></div>}</dl></section>
}

export default function OfficialProfile() {
  const { id } = useParams()
  const [directory, setDirectory] = useState(null)
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    setDirectory(null)
    setLoadError(false)
    let active = true
    publicApi('/officials/directory').then(value => { if (active) setDirectory(value) }).catch(() => { if (active) setLoadError(true) })
    return () => { active = false }
  }, [])
  const official = useMemo(() => directory?.items?.find(item => item.slug === id) || null, [directory, id])
  if (!directory && loadError) return <ErrorPage code="503" title="Official profiles are temporarily unavailable" message="Please try again later." secondaryAction={{ label: 'Browse Officials', to: '/officials' }} />
  if (!directory) return <main className="section"><div className="container"><p role="status">Loading official profile…</p></div></main>
  if (!official) return <ResourceNotFound type="official" />
  const previousTerms = directory.items.filter(item => item.personSlug === official.personSlug && item.publicKey !== official.publicKey && item.term?.status === 'previous')
  const isBarangayOfficial = official.jurisdiction?.type === 'barangay'
  const location = isBarangayOfficial ? `Barangay ${official.jurisdiction?.id || ''}, Getafe, Bohol` : 'Municipality of Getafe · Bohol'
  return <main className="barangay-official-page"><section className="page-header"><div className="container official-profile-header"><Link className="barangay-detail-back" to={isBarangayOfficial ? `/barangays/${official.jurisdiction?.id}/officials` : '/officials'}><ArrowLeft size={16} /> {isBarangayOfficial ? 'Barangay Officials' : 'Municipal Officials'}</Link><img className="official-profile-photo" src={official.photo || PLACEHOLDER} alt={`${official.name} profile`} onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = PLACEHOLDER }} /><p className="barangay-hero-eyebrow">{location.toUpperCase()}</p><h1>{official.name}</h1><p>{official.role || official.position?.name} · {statusLabel(official.term?.status)}</p></div></section><div className="container official-profile-content"><article className="barangay-detail-card official-profile-record"><section><p className="history-kicker">OFFICIAL PROFILE</p><h2>About</h2>{official.biography ? <div className="official-biography">{biographyParagraphs(official.biography).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div> : <p>Biography information for {official.name} is not currently available.</p>}</section><TermDetails official={official} /><ElectionDetails election={official.election} />{previousTerms.length > 0 && <section className="official-profile-section"><h2>Previous terms</h2><ul className="official-history-list">{previousTerms.map(item => <li key={item.publicKey}><strong>{item.role || item.position?.name}</strong><span>{formatDate(item.term?.start) || 'Date unavailable'} – {formatDate(item.term?.end) || 'Date unavailable'}</span></li>)}</ul></section>}</article></div></main>
}
