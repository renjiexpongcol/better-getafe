import { useDataRevision } from '../hooks/usePublicResource'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, CalendarDays, X } from 'lucide-react'
import './ImportantAnnouncement.css'
import { clearExpiredAnnouncementDismissals, dismissAnnouncement, isAnnouncementDismissed } from '../services/announcementDismissals'
import { publicApi } from '../services/apiClient'
import { trackAnnouncementInteraction } from '../services/websiteAnalytics.js'

const dateFormatter = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })

function validDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function announcementDetails(notice, expanded) {
  const type = String(notice.content_type || 'news').toLowerCase()
  if (!['event', 'meeting'].includes(type)) {
    const published = validDate(notice.published_at)
    if (!published) return []
    const date = dateFormatter.format(published)
    const value = expanded ? `${date} • ${timeFormatter.format(published)} PHT` : date
    return [{ label: 'Published', value, icon: CalendarDays }]
  }

  const start = validDate(notice.event_start_at)
  const end = validDate(notice.event_end_at)
  if (!start) return []

  const dateValue = end && dateFormatter.format(end) !== dateFormatter.format(start)
    ? `${dateFormatter.format(start)} - ${dateFormatter.format(end)}`
    : dateFormatter.format(start)
  const timeValue = end ? `${timeFormatter.format(start)} - ${timeFormatter.format(end)}` : timeFormatter.format(start)
  return [{ label: type === 'meeting' ? 'Meeting schedule' : 'Event schedule', value: `${dateValue} • ${timeValue} PHT`, icon: CalendarDays }]
}

export default function ImportantAnnouncement() {
  const dataRevision = useDataRevision()
  const [notice, setNotice] = useState(null)
  const [dismissed, setDismissed] = useState(() => new Set())
  useEffect(() => {
    let active = true
    clearExpiredAnnouncementDismissals()
    const load = async () => {
      if (!active || document.visibilityState === 'hidden') return
      try {
        const data = await publicApi('/news?important=true&limit=1')
        if (!active) return
        const next = data.items?.[0] || null
        setNotice(next)
        const nextVersion = next?.version || next?.updated_at || 1
        setDismissed(next && isAnnouncementDismissed(next.id, nextVersion) ? new Set([next.id]) : new Set())
      } catch {
        if (active) setNotice(null)
      }
    }
    load()
    const interval = setInterval(load, 60000)
    return () => { active = false; clearInterval(interval) }
  }, [dataRevision])

  if (!notice || dismissed.has(notice.id)) return null

  function dismiss() {
    dismissAnnouncement(notice.id, notice.version || notice.updated_at || 1)
    setDismissed(previous => new Set([...previous, notice.id]))
  }

  return <AnnouncementDialog key={notice.id} notice={notice} onDismiss={dismiss} />
}

function AnnouncementDialog({ notice, onDismiss }) {
  const [expanded, setExpanded] = useState(false)
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const readRef = useRef(null)
  const scrollRef = useRef(null)
  const impressionIdRef = useRef(null)
  const returningToPreview = useRef(false)
  const details = announcementDetails(notice, expanded)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const previousActive = document.activeElement
    const previousBodyOverflow = document.body.style.overflow
    const previousDocumentOverflow = document.documentElement.style.overflow

    if (!dialog.open) dialog.showModal()
    impressionIdRef.current = trackAnnouncementInteraction('impression', notice.id)
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    closeRef.current?.focus()

    return () => {
      if (dialog.open) dialog.close()
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousDocumentOverflow
      if (previousActive?.isConnected && typeof previousActive.focus === 'function') {
        previousActive.focus({ preventScroll: true })
      }
    }
  }, [notice.id])

  useLayoutEffect(() => {
    scrollRef.current.scrollTop = 0
    if (expanded) closeRef.current.focus({ preventScroll: true })
    else if (returningToPreview.current) readRef.current.focus({ preventScroll: true })
  }, [expanded])

  function expand() {
    trackAnnouncementInteraction('open', notice.id, impressionIdRef.current)
    setExpanded(true)
  }

  function close() {
    if (expanded) {
      returningToPreview.current = true
      setExpanded(false)
    } else {
      trackAnnouncementInteraction('dismiss', notice.id, impressionIdRef.current)
      onDismiss()
    }
  }

  function handleClick(event) {
    if (event.target === event.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) {
        close()
        return
      }
    }
    if (!expanded) expand()
  }
  const image = notice.featured_image || notice.featured_image_path
  const description = notice.excerpt?.trim()

  return createPortal(
    <dialog
      ref={dialogRef}
      className={`important-announcement ${expanded ? 'is-expanded' : 'is-preview'}`}
      onClick={handleClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="important-announcement-title"
      aria-describedby={description && !expanded ? 'important-announcement-summary' : undefined}
      onCancel={(event) => { event.preventDefault(); close() }}
    >
      <button ref={closeRef} type="button" className="important-announcement-close" aria-label={expanded ? 'Close full announcement' : 'Close announcement'} onClick={event => { event.stopPropagation(); close() }}>
        <X size={20} aria-hidden="true" />
      </button>
      <div ref={scrollRef} className={`important-announcement-body${image ? ' has-image' : ' no-image'}`}>
        {image && (
          <div className="important-announcement-media">
            <img className="important-announcement-image" src={image} alt={`Announcement artwork for ${notice.title}`} />
          </div>
        )}

        <div className="important-announcement-content">
          <h3 id="important-announcement-title">{notice.title}</h3>

          {details.length > 0 && (
            <dl className="important-announcement-details">
              {details.map(({ label, value, icon: Icon }) => (
                <div key={label}>
                  <span className="important-announcement-detail-icon" aria-hidden="true"><Icon size={15} /></span>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {(!expanded || !notice.content?.trim()) && description && <p id="important-announcement-summary">{description}</p>}

          {expanded && notice.content?.trim() && (
            <div className="important-announcement-article" dangerouslySetInnerHTML={{ __html: notice.content }} />
          )}
          {!expanded && (
            <div className="important-announcement-actions">
              <button ref={readRef} type="button" className="important-announcement-primary">
                Read full announcement <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
