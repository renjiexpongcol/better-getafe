import { useEffect, useState } from 'react'
import { ArrowLeft, UserRound } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { barangays as fallback } from '../../data/barangays'
import { ErrorPage, ResourceNotFound } from '../../components/RouteStatusPages'
import { publicApi } from '../../services/apiClient'
const PLACEHOLDER = '/assets/brgy-user-vector/profile-circle.svg'

const slug = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const matchesBarangay = (item, id) => slug(item?.id) === slug(id) || slug(item?.name) === slug(id)

export default function BarangayOfficial() {
  const { id } = useParams()
  const [barangay, setBarangay] = useState(() => fallback.find((item) => matchesBarangay(item, id)) || null)
  const [official, setOfficial] = useState(null)
  const [loading, setLoading] = useState(Boolean(id) && !barangay)
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    if (!id) return undefined
    setLoading(true)
    let active = true
    Promise.all([publicApi('/barangays'), publicApi('/officials')]).then(async ([items, officials]) => {
      const nextBarangay = items.find((item) => matchesBarangay(item, id)) || fallback.find((item) => matchesBarangay(item, id)) || null
      const nextOfficial = (officials.punongBarangays || []).find((item) => String(item.role || '').toLowerCase().trim() === String(nextBarangay?.name || '').toLowerCase().trim()) || null
      if (!active) return
      setBarangay(nextBarangay)
      setOfficial(nextOfficial)
    }).catch(() => { if (active) setLoadError(!fallback.find((item) => matchesBarangay(item, id))) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])
  if (!id) return <Navigate to="/barangays" replace />
  if (loading) return <main className="section"><div className="container"><p>Loading official details…</p></div></main>
  if (loadError) return <ErrorPage code="503" title="Official details are temporarily unavailable" message="Please try again later." secondaryAction={{ label: 'Browse Barangays', to: '/barangays' }} />
  if (!barangay) return <ResourceNotFound type="barangay" />
  const format = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : null
  const officialName = official?.name || barangay.captain || 'Barangay Official'
  const biography = official?.biography || barangay.captainBio
  const profilePhoto = official?.photo || barangay.captainPhoto || barangay.photo || PLACEHOLDER
  return <main className="barangay-official-page"><section className="page-header"><div className="container official-profile-header"><Link className="barangay-detail-back" to={`/barangays/${barangay.id}`}><ArrowLeft size={16} /> Back to {barangay.name}</Link><div className="official-profile-icon"><img src={profilePhoto} alt={`${officialName} profile`} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = PLACEHOLDER }} /></div><p className="barangay-hero-eyebrow">PUNONG BARANGAY · GETAFE, BOHOL</p><h1>{officialName}</h1><p>Barangay {barangay.name}</p></div></section><div className="container official-profile-content"><article className="barangay-detail-card"><p className="history-kicker">OFFICIAL PROFILE</p><h2>About the Punong Barangay</h2>{biography ? <p>{biography}</p> : <p>Biography information for {officialName} is not currently available.</p>}{barangay.captainDetails && <div className="barangay-rich-content" dangerouslySetInnerHTML={{ __html: barangay.captainDetails }} />}{barangay.termStart || barangay.termEnd ? <p className="official-term"><strong>Term:</strong> {format(barangay.termStart) || '—'} – {format(barangay.termEnd) || 'Present'}</p> : null}</article></div></main>
}
