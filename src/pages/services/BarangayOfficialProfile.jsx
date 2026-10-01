import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { barangays as fallback } from '../../data/barangays'
import { ErrorPage, ResourceNotFound } from '../../components/RouteStatusPages'
import { publicApi } from '../../services/apiClient'

const PLACEHOLDER = '/assets/brgy-user-vector/profile-circle.svg'
const slug = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const matches = (item, id) => slug(item?.id) === slug(id) || slug(item?.name) === slug(id)
const dateLabel = value => value ? new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${value}T00:00:00Z`)) : '—'

export default function BarangayOfficialProfile() {
  const { id, officialSlug } = useParams()
  const [barangay, setBarangay] = useState(() => fallback.find(item => matches(item, id)) || null)
  const [official, setOfficial] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    let active = true
    Promise.all([publicApi('/barangays'), publicApi('/officials/directory?barangay=' + encodeURIComponent(slug(id)))]).then(async ([items, directory]) => {
      const nextBarangay = items.find(item => matches(item, id)) || fallback.find(item => matches(item, id)) || null

      if (!active) return
      setBarangay(nextBarangay)
      setOfficial((directory.items || []).find(item => item.slug === officialSlug) || null)
      setLoadError(false)
    }).catch(() => { if (active) setLoadError(!fallback.find(item => matches(item, id))) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, officialSlug])
  if (loading) return <main className="section"><div className="container"><p>Loading official profile…</p></div></main>
  if (loadError) return <ErrorPage code="503" title="Official profiles are temporarily unavailable" message="Please try again later." secondaryAction={{ label: 'Back to Barangay Officials', to: `/barangays/${id}/officials` }} />
  if (!barangay) return <ResourceNotFound type="barangay" />
  const fallbackCaptain = slug(barangay.captain) === slug(officialSlug) ? { name: barangay.captain, role: 'Punong Barangay', biography: barangay.captainBio, photo: barangay.captainPhoto, term: { start: barangay.termStart, end: barangay.termEnd, status: 'unknown' } } : null
  const record = official || fallbackCaptain
  if (!record) return <ResourceNotFound type="official" browseLabel="Back to Barangay Officials" browseTo={`/barangays/${barangay.id}/officials`} />
  const term = record.term || {}
  return <main className="barangay-official-profile"><section className="page-header"><div className="container official-profile-header"><Link className="barangay-detail-back" to={`/barangays/${barangay.id}/officials`}><ArrowLeft size={16} /> Barangay Officials</Link><span className="official-profile-icon"><img src={record.photo || PLACEHOLDER} alt={`${record.name} profile`} onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = PLACEHOLDER }} /></span><p className="barangay-hero-eyebrow">BARANGAY OFFICIAL · GETAFE, BOHOL</p><h1>{record.name}</h1><p>{record.role || record.position?.name} · Barangay {barangay.name}</p></div></section><div className="container official-profile-content"><article className="official-public-profile"><div className="official-profile-summary"><span className="official-directory-avatar large"><UserRound size={34} /></span><div><p className="history-kicker">{term.status === 'current' ? 'CURRENTLY SERVING' : 'BARANGAY OFFICIAL'}</p><h2>{record.name}</h2><p>{record.role || record.position?.name} · Barangay {barangay.name}</p></div></div><dl className="official-transparency"><div><dt>Position</dt><dd>{record.role || record.position?.name}</dd></div><div><dt>Barangay</dt><dd>{barangay.name}</dd></div>{term.start && <div><dt>Term started</dt><dd>{dateLabel(term.start)}</dd></div>}{term.end && <div><dt>Term end</dt><dd>{dateLabel(term.end)}</dd></div>}</dl><section><h3>About the Official</h3><p>{record.biography || barangay.captainBio || `Public profile information for the ${record.role || 'barangay official'} of Barangay ${barangay.name}.`}</p></section>{(term.start || term.end) && <section><h3>Term</h3><p>{dateLabel(term.start)} – {dateLabel(term.end)}</p></section>}<section><h3>Data source</h3><p>Profile and term information are maintained by the Municipality of Getafe CMS. No municipal-election data is inferred for barangay officials.</p></section></article><section className="other-officials"><h2>Other Barangay Officials</h2><Link to={`/barangays/${barangay.id}/officials`}>View the Barangay Officials directory <ArrowRight size={16} /></Link></section></div></main>
}
