import { useEffect, useState } from 'react'
import { ArrowRight, Bell, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function EmergencyAlert() {
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let cancelled = false
    const loadNotice = () => fetch('/api/news?category=announcements&limit=1')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Announcements unavailable')))
      .then((data) => { if (!cancelled) setNotice(data.items?.[0] || null) })
      .catch(() => { if (!cancelled) setNotice(null) })

    loadNotice()
    const interval = setInterval(loadNotice, 60000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (!notice) return null

  const noticeType = notice.category?.name || 'Announcement'
  return <section className="home-notice" aria-label={`${noticeType}: ${notice.title}`} aria-live="polite"><div className="container home-notice-inner"><span className="home-notice-icon"><ShieldAlert size={17} aria-hidden="true" /></span><div className="home-notice-copy"><span className="home-notice-label">{noticeType}</span><strong>{notice.title}</strong>{notice.excerpt && <span className="home-notice-description">{notice.excerpt}</span>}</div><Link to={`/news/${notice.slug}`}>View details <ArrowRight size={15} /></Link></div></section>
}

export function NoticePlaceholder() {
  return <div className="home-notice-loading" aria-hidden="true"><Bell size={16} /> Loading official notices…</div>
}
