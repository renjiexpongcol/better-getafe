import { useEffect, useState } from 'react'
import { ArrowRight, Bell, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function EmergencyAlert() {
  const [notice, setNotice] = useState(null)
  const [dismissedNoticeKey, setDismissedNoticeKey] = useState(null)
  const [isDismissing, setIsDismissing] = useState(false)

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

  const noticeKey = notice ? String(notice.id ?? notice.slug ?? notice.title ?? '') : ''

  useEffect(() => {
    setIsDismissing(false)
    if (!noticeKey) return undefined

    const timeout = setTimeout(() => setIsDismissing(true), 10000)
    return () => clearTimeout(timeout)
  }, [noticeKey])

  useEffect(() => {
    if (!isDismissing || !noticeKey) return undefined

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timeout = setTimeout(() => setDismissedNoticeKey(noticeKey), prefersReducedMotion ? 0 : 500)
    return () => clearTimeout(timeout)
  }, [isDismissing, noticeKey])

  if (!notice || dismissedNoticeKey === noticeKey) return null

  const noticeType = notice.category?.name || 'Announcement'
  const summary = String(notice.excerpt || '').replace(/\s+/g, ' ').trim()
  const shortSummary = summary.length > 120 ? `${summary.slice(0, 117).replace(/\s+\S*$/, '')}…` : summary
  const handleTransitionEnd = (event) => {
    if (event.target === event.currentTarget && event.propertyName === 'transform' && isDismissing) {
      setDismissedNoticeKey(noticeKey)
    }
  }

  return <div className="home-notice-viewport"><section className={`home-notice${isDismissing ? ' home-notice--dismissing' : ''}`} onTransitionEnd={handleTransitionEnd} aria-label={`${noticeType}: ${notice.title}`} aria-live="polite"><div className="container home-notice-inner"><span className="home-notice-icon"><ShieldAlert size={17} aria-hidden="true" /></span><div className="home-notice-copy"><span className="home-notice-label">{noticeType}</span><Link className="home-notice-title" to={`/news/${notice.slug}`}>{notice.title}</Link>{shortSummary && <span className="home-notice-description">{shortSummary}</span>}</div><Link to={`/news/${notice.slug}`}>View details <ArrowRight size={15} /></Link></div></section></div>
}

export function NoticePlaceholder() {
  return <div className="home-notice-loading" aria-hidden="true"><Bell size={16} /> Loading official notices…</div>
}
