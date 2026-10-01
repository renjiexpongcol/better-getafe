import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Bell, CalendarDays, Clock3, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import './ImportantAnnouncement.css'
import { clearExpiredAnnouncementDismissals, dismissAnnouncement, isAnnouncementDismissed } from '../services/announcementDismissals'
import { publicApi } from '../services/apiClient'

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

function validDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function announcementDetails(notice) {
  const start = validDate(notice.event_start_at)
  const end = validDate(notice.event_end_at)
  if (!start) return []

  const dateValue = end && end.toDateString() !== start.toDateString()
    ? `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`
    : dateFormatter.format(start)
  const timeValue = end
    ? `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`
    : timeFormatter.format(start)

  return [
    { label: 'Date', value: dateValue, icon: CalendarDays },
    { label: 'Time', value: timeValue, icon: Clock3 },
  ]
}

export default function ImportantAnnouncement() {
  const [notice, setNotice] = useState(null)
  const [dismissed, setDismissed] = useState(() => new Set())
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const previousActiveRef = useRef(null)
  const visible = Boolean(notice && !dismissed.has(notice.id))
  const details = useMemo(() => (notice ? announcementDetails(notice) : []), [notice])

  useEffect(() => {
    clearExpiredAnnouncementDismissals()
    const load = async () => {
      try {
        const data = await publicApi('/news?important=true&limit=1')
        const next = data.items?.[0] || null
        setNotice(next)
        const nextVersion = next?.version || next?.updated_at || 1
        setDismissed(next && isAnnouncementDismissed(next.id, nextVersion) ? new Set([next.id]) : new Set())
      } catch {
        setNotice(null)
      }
    }
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!visible) return undefined
    const dialog = dialogRef.current
    if (!dialog) return undefined

    previousActiveRef.current = document.activeElement
    const previousBodyOverflow = document.body.style.overflow
    const previousDocumentOverflow = document.documentElement.style.overflow

    if (!dialog.open) dialog.showModal()
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    const focusTarget = [...dialog.querySelectorAll('button, a[href]')].find(element => element.offsetParent !== null)
    focusTarget?.focus()

    return () => {
      if (dialog.open) dialog.close()
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousDocumentOverflow
      const previousActive = previousActiveRef.current
      if (previousActive?.isConnected && typeof previousActive.focus === 'function') {
        window.requestAnimationFrame(() => previousActive.focus())
      }
    }
  }, [visible])

  if (!visible) return null

  const dismiss = () => {
    const version = notice.version || notice.updated_at || 1
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
      aria-labelledby="important-announcement-heading"
      aria-describedby={description ? 'important-announcement-title important-announcement-summary' : 'important-announcement-title'}
      onCancel={(event) => { event.preventDefault(); dismiss() }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          dismiss()
        }
      }}
    >
      <header className="important-announcement-header">
        <div className="important-announcement-heading">
          <span className="important-announcement-header-icon" aria-hidden="true"><Bell size={18} strokeWidth={2.2} /></span>
          <h2 id="important-announcement-heading">Important Announcement</h2>
        </div>
        <button ref={closeRef} type="button" className="important-announcement-close" aria-label="Close important announcement" onClick={dismiss}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>

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
                  <span className="important-announcement-detail-icon" aria-hidden="true"><Icon size={14} /></span>
                  <div>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          )}

          {description && <p id="important-announcement-summary">{description}</p>}

          <div className="important-announcement-actions">
            <Link className="important-announcement-primary" to={`/news/${notice.slug}`} onClick={dismiss}>
              Read full announcement <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <button type="button" className="important-announcement-secondary" onClick={dismiss}>Close</button>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
