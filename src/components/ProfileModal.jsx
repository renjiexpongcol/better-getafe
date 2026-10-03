import ModalDialog from './ModalDialog'
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
    const frame = window.requestAnimationFrame(() => {
      const control = [...(dialogRef.current?.querySelectorAll(focusableSelector) || [])].find(node => node.getClientRects().length)
      control?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusKey])

  const requestClose = () => {
    if (closeGuardRef?.current?.requestClose) closeGuardRef.current.requestClose()
    else onClose()
  }

  return <ModalDialog backdropClass="profile-modal-backdrop" labelledBy={labelledBy || (showHeader ? 'profile-modal-title' : undefined)} label={title} onClose={requestClose} returnFocusRef={returnFocusRef}>
      <section
        ref={dialogRef}
        className={`profile-modal-card ${className}`.trim()}
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
            <button type="button" className="profile-modal-close" aria-label={closeLabel || 'Close profile editor'} onClick={requestClose} data-icon-button="ghost">
              <X size={20} aria-hidden="true" />
            </button>
          </header>
        )}
        {!showHeader && <button type="button" className="profile-modal-close" aria-label="Close change password dialog" onClick={requestClose} data-icon-button="ghost"><X size={20} aria-hidden="true" /></button>}
        <div className="profile-modal-body">{children}</div>
        {footer}
      </section>
    </ModalDialog>
}
