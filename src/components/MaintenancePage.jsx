import { Clock3 } from 'lucide-react'
import { usePublicConfig } from '../context/PublicConfig'
import { useAuth } from '../context/AuthContext'

export default function MaintenancePage() {
  const settings = usePublicConfig()
  const { user, loading } = useAuth()
  if (loading || (user && ['admin', 'super_admin'].includes(user.role))) return null
  const expected = settings['maintenance.expectedCompletion']
  const date = expected ? new Date(expected) : null
  return <main className="maintenance-page"><section className="maintenance-card" aria-labelledby="maintenance-title"><div className="maintenance-icon" aria-hidden="true"><Clock3 size={32} /></div><p className="maintenance-kicker">{settings['general.name'] || 'Municipality of Getafe'}</p><h1 id="maintenance-title">We’ll be back soon</h1><p>{settings['maintenance.message'] || 'The portal is undergoing maintenance. Please try again later.'}</p>{date && !Number.isNaN(date.getTime()) && <p className="maintenance-time">Expected completion: {date.toLocaleString(settings['general.locale'] || 'en-PH', { timeZone: settings['general.timezone'] || 'Asia/Manila' })}</p>}<p className="maintenance-note">Please check back shortly.</p></section></main>
}
