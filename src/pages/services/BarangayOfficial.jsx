import { useEffect, useState } from 'react'
import { ArrowLeft, UserRound } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { barangays as fallback } from '../../data/barangays'
const PLACEHOLDER = '/assets/brgy-user-vector/profile-circle.svg'

const slug = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const matchesBarangay = (item, id) => slug(item?.id) === slug(id) || slug(item?.name) === slug(id)

export default function BarangayOfficial() {
  const { id } = useParams()
  const [barangay, setBarangay] = useState(() => fallback.find((item) => matchesBarangay(item, id)) || null)
  const [official, setOfficial] = useState(null)
  const [loading, setLoading] = useState(Boolean(id) && !barangay)
  useEffect(() => {
    if (!id) return undefined
    setLoading(true)
    Promise.all([fetch('/api/barangays'), fetch('/api/officials')]).then(async ([barangaysResponse, officialsResponse]) => {
      const items = barangaysResponse.ok ? await barangaysResponse.json() : fallback
      const nextBarangay = items.find((item) => matchesBarangay(item, id)) || fallback.find((item) => matchesBarangay(item, id)) || null
      const officials = officialsResponse.ok ? await officialsResponse.json() : {}
      const nextOfficial = (officials.punongBarangays || []).find((item) => String(item.role || '').toLowerCase().trim() === String(nextBarangay?.name || '').toLowerCase().trim()) || null
      setBarangay(nextBarangay)
      setOfficial(nextOfficial)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])
  if (!id) return <Navigate to="/services/barangays" replace />
  if (loading) return <main className="section"><div className="container"><p>Loading official details…</p></div></main>
  if (!barangay) return <main className="section"><div className="container"><h1>Official not found</h1><Link to="/services/barangays">Back to Barangays</Link></div></main>
  const format = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : null
  const officialName = official?.name || barangay.captain || 'Barangay Official'
  const biography = official?.biography || barangay.captainBio
  const profilePhoto = official?.photo || barangay.captainPhoto || barangay.photo || PLACEHOLDER
  return <main className="barangay-official-page"><section className="page-header"><div className="container official-profile-header"><Link className="barangay-detail-back" to={`/services/barangays/${barangay.id}`}><ArrowLeft size={16} /> Back to {barangay.name}</Link><div className="official-profile-icon"><img src={profilePhoto} alt={`${officialName} profile`} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = PLACEHOLDER }} /></div><p className="barangay-hero-eyebrow">PUNONG BARANGAY · GETAFE, BOHOL</p><h1>{officialName}</h1><p>Barangay {barangay.name}</p></div></section><div className="container official-profile-content"><article className="barangay-detail-card"><p className="history-kicker">OFFICIAL PROFILE</p><h2>About the Punong Barangay</h2>{biography ? <p>{biography}</p> : <p>Biography information for {officialName} is not currently available.</p>}{barangay.captainDetails && <div className="barangay-rich-content" dangerouslySetInnerHTML={{ __html: barangay.captainDetails }} />}{barangay.termStart || barangay.termEnd ? <p className="official-term"><strong>Term:</strong> {format(barangay.termStart) || '—'} – {format(barangay.termEnd) || 'Present'}</p> : null}</article></div></main>
}
