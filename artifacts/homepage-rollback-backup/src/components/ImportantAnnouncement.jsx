import { useEffect, useState } from 'react'
import { ArrowRight, Bell, ShieldAlert, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { dismissAnnouncement, isAnnouncementDismissed, clearExpiredAnnouncementDismissals } from '../services/announcementDismissals'
import { publicApi } from '../services/apiClient'
import { municipalDate, noticeKind, noticeVersion } from '../services/homepagePresentation'

// Inline delivery avoids competing automatic dialogs. Publication is server-owned.
export default function ImportantAnnouncement({ important = true }) {
  const [notice, setNotice] = useState(null)
  const [dismissedKey, setDismissedKey] = useState('')
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    clearExpiredAnnouncementDismissals()
    const load = () => publicApi(important
      ? '/news?important=true&limit=1&public=true'
      : '/news?category=announcements&limit=1&public=true', { cacheTtl: 0, persist: false, force: true })
      .then(data => {
        if (!active) return
        const next = data.items?.[0] || null
        setNotice(next)
        setFailed(false)
        setDismissedKey(next && isAnnouncementDismissed(next.id, noticeVersion(next)) ? `${next.id}:${noticeVersion(next)}` : '')
      }).catch(() => { if (active) { setNotice(null); setFailed(true) } })
    load()
    const interval = setInterval(load, 60000)
    return () => { active = false; clearInterval(interval) }
  }, [important, attempt])
  const version = notice && noticeVersion(notice)
  const key = notice && `${notice.id}:${version}`
  if (failed && important) return <aside className="homepage-notice-unavailable container" role="status">Current advisories could not be loaded. <button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button> <Link to="/services/hotlines">Emergency contacts</Link></aside>
  if (!notice || key === dismissedKey || (!important && notice.is_important)) return null
  const kind = noticeKind(notice)
  const dismiss = () => { dismissAnnouncement(notice.id, version); setDismissedKey(key) }
  return <aside className={`homepage-notice ${kind === 'Emergency alert' ? 'homepage-notice-emergency' : ''}`} aria-label={kind}>
    <div className="container homepage-notice-inner">
      {kind === 'Emergency alert' ? <ShieldAlert aria-hidden="true" size={22} /> : <Bell aria-hidden="true" size={22} />}
      <div><strong>{kind}</strong><h2>{notice.title}</h2>{notice.excerpt && <p>{notice.excerpt}</p>}
        {notice.event_start_at && <p><time dateTime={notice.event_start_at}>{municipalDate(notice.event_start_at, { hour: 'numeric', minute: '2-digit' })}</time>{notice.event_end_at && <> – <time dateTime={notice.event_end_at}>{municipalDate(notice.event_end_at, { hour: 'numeric', minute: '2-digit' })}</time></>} (Philippine time)</p>}
        <Link to={`/news/${encodeURIComponent(notice.slug)}`}>View announcement <ArrowRight aria-hidden="true" size={16} /></Link>
      </div>
      <button type="button" aria-label={`Dismiss ${kind.toLowerCase()}`} onClick={dismiss} data-icon-button="ghost"><X size={20} aria-hidden="true" /></button>
    </div>
  </aside>
}
