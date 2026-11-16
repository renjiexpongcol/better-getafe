import { useDataRevision } from '../hooks/usePublicResource'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, CalendarDays, X } from 'lucide-react'
import { Link } from 'react-router-dom'
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

function announcementDetails(notice) {
  const type = String(notice.content_type || 'news').toLowerCase()
  if (!['event', 'meeting'].includes(type)) {
    const published = validDate(notice.published_at)
    return published ? [{ label: 'Published', value: dateFormatter.format(published), icon: CalendarDays }] : []
  }

  const start = validDate(notice.event_start_at)
  const end = validDate(notice.event_end_at)
  if (!start) return []

  const dateValue = end && dateFormatter.format(end) !== dateFormatter.format(start)
    ? `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`
    : dateFormatter.format(start)
  const timeValue = end ? `${timeFormatter.format(start)} - ${timeFormatter.format(end)}` : timeFormatter.format(start)
  return [{ label: type === 'meeting' ? 'Meeting schedule' : 'Event schedule', value: `${dateValue} • ${timeValue} PHT`, icon: CalendarDays }]
}

export default function ImportantAnnouncement() {
  const dataRevision = useDataRevision()
  const [notice, setNotice] = useState(null)
  const [dismissed, setDismissed] = useState(() => new Set())
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const previousActiveRef = useRef(null)
  const impressionIdRef = useRef(null)
  const visible = Boolean(notice && !dismissed.has(notice.id))
  const details = useMemo(() => (notice ? announcementDetails(notice) : []), [notice])

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

  useEffect(() => {
    if (!visible) return undefined
    const dialog = dialogRef.current
    if (!dialog) return undefined

    previousActiveRef.current = document.activeElement
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
      const previousActive = previousActiveRef.current
      if (previousActive?.isConnected && typeof previousActive.focus === 'function') {
        window.requestAnimationFrame(() => previousActive.focus())
      }
    }
  }, [visible, notice?.id])

  if (!visible) return null

  const dismiss = (interaction = 'dismiss') => {
    const version = notice.version || notice.updated_at || 1
    trackAnnouncementInteraction(interaction, notice.id, impressionIdRef.current)
    dismissAnnouncement(notice.id, version)
    setDismissed((previous) => new Set([...previous, notice.id]))
  }
  const image = notice.featured_image || notice.featured_image_path
  const description = notice.excerpt?.trim()

  return createPortal(
    <dialog
      ref={dialogRef}
      className="important-announcement"
      role="dialog"
      aria-modal="true"
      aria-labelledby="important-announcement-title"
      aria-describedby={description ? 'important-announcement-title important-announcement-summary' : 'important-announcement-title'}
      onCancel={(event) => { event.preventDefault(); dismiss('dismiss') }}
    >
      <button ref={closeRef} type="button" className="important-announcement-close" aria-label="Close announcement" onClick={() => dismiss('dismiss')} data-icon-button="ghost">
        <X size={20} aria-hidden="true" />
      </button>
      <div className={`important-announcement-body${image ? ' has-image' : ' no-image'}`}>
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

          {description && <p id="important-announcement-summary">{description}</p>}

          <div className="important-announcement-actions">
            <Link className="important-announcement-primary" to={`/news/${notice.slug}`} onClick={() => dismiss('open')}>
              Read full announcement <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
