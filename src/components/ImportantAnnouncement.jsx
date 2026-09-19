import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import './ImportantAnnouncement.css'
import { clearExpiredAnnouncementDismissals, dismissAnnouncement, isAnnouncementDismissed } from '../services/announcementDismissals'

export default function ImportantAnnouncement() {
  const [notice, setNotice] = useState(null)
  const [dismissed, setDismissed] = useState(() => new Set())
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const visible = Boolean(notice && !dismissed.has(notice.id))

  useEffect(() => {
    clearExpiredAnnouncementDismissals()
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch('/api/news?important=true&limit=1', { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('Announcements unavailable')
        const data = await response.json()
        if (!controller.signal.aborted) {
          const next = data.items?.[0] || null
          setNotice(next)
          const nextVersion = next?.version || next?.updated_at || 1
          setDismissed(next && isAnnouncementDismissed(next.id, nextVersion) ? new Set([next.id]) : new Set())
        }
      } catch {
        if (!controller.signal.aborted) setNotice(null)
      }
    }
    load()
    const interval = setInterval(load, 60000)
    return () => { controller.abort(); clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (!visible) return undefined
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    closeRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [visible])

  if (!visible) return null
  const dismiss = () => {
    const version = notice.version || notice.updated_at || 1
    dismissAnnouncement(notice.id, version)
    setDismissed((previous) => new Set([...previous, notice.id]))
  }
  const image = notice.featured_image || notice.featured_image_path

  return createPortal(
    <dialog
      ref={dialogRef}
      className="important-announcement"
      aria-labelledby="important-announcement-heading"
      aria-describedby="important-announcement-title important-announcement-summary"
      onCancel={(event) => { event.preventDefault(); dismiss() }}
    >
      <h2 id="important-announcement-heading">Important Announcement</h2>
      {image && <img className="important-announcement-image" src={image} alt="" />}
      <h3 id="important-announcement-title">{notice.title}</h3>
      <p id="important-announcement-summary">{notice.excerpt}</p>
      <div className="important-announcement-actions">
        <Link to={`/news/${notice.slug}`} onClick={dismiss}>Read full announcement</Link>
        <button ref={closeRef} type="button" onClick={dismiss}>Close</button>
      </div>
    </dialog>,
    document.body,
  )
}
