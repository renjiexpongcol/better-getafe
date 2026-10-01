import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function ProfileModal({
  children,
  title = 'My Account',
  onClose,
  returnFocusRef,
  closeGuardRef,
  focusKey = 'profile',
  className = '',
  showHeader = true,
  labelledBy,
  description = 'Manage your personal and contact information without leaving this page.',
  closeLabel,
  footer,
}) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFirstControl = () => {
      const first = dialogRef.current?.querySelector(focusableSelector)
      first?.focus()
    }
    const frame = window.requestAnimationFrame(focusFirstControl)
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (closeGuardRef?.current?.requestClose) closeGuardRef.current.requestClose()
        else onClose()
        return
      }
      if (event.key !== 'Tab') return
      const controls = [...(dialogRef.current?.querySelectorAll(focusableSelector) || [])]
        .filter(control => control.getClientRects().length)
      const first = controls[0]
      const last = controls.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [closeGuardRef, focusKey, onClose, returnFocusRef])

  useEffect(() => () => {
    window.requestAnimationFrame(() => returnFocusRef?.current?.focus())
  }, [returnFocusRef])

  const requestClose = () => {
    if (closeGuardRef?.current?.requestClose) closeGuardRef.current.requestClose()
    else onClose()
  }

  return createPortal(
    <div
      className="profile-modal-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <section
        ref={dialogRef}
        className={`profile-modal-card ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || (showHeader ? 'profile-modal-title' : undefined)}
        aria-label={!showHeader ? title : undefined}
        tabIndex="-1"
      >
        {showHeader && (
          <header className="profile-modal-header">
            <div>
              <p className="profile-modal-eyebrow">RESIDENT ACCOUNT</p>
              <h1 id="profile-modal-title">{title}</h1>
              <p>{description}</p>
            </div>
            <button type="button" className="profile-modal-close" aria-label={closeLabel || 'Close profile editor'} onClick={requestClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </header>
        )}
        {!showHeader && <button type="button" className="profile-modal-close" aria-label="Close change password dialog" onClick={requestClose}><X size={20} aria-hidden="true" /></button>}
        <div className="profile-modal-body">{children}</div>
        {footer}
      </section>
    </div>,
    document.body,
  )
}
