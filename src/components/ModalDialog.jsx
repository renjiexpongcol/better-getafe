import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './ModalDialog.css'

let openDialogs = 0
let previousOverflow = ''

// Native modal dialogs provide background isolation and a focus trap, including
// when a confirmation dialog is opened above another modal.
export default function ModalDialog({ children, onClose, busy = false, labelledBy, label, returnFocusRef, backdropClass = 'portal-action-backdrop' }) {
  const dialogRef = useRef(null)
  const current = useRef({ onClose, busy })
  current.current = { onClose, busy }
  useEffect(() => {
    const dialog = dialogRef.current
    const trigger = returnFocusRef?.current || document.activeElement
    if (openDialogs++ === 0) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    dialog.showModal()
    return () => {
      dialog.close()
      if (--openDialogs === 0) document.body.style.overflow = previousOverflow
      window.requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true })
      })
    }
  }, [])
  const close = () => { if (!current.current.busy) current.current.onClose() }
  const containFocus = event => {
    if (event.key !== 'Tab') return
    const controls = [...dialogRef.current.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
      .filter(node => node.getClientRects().length && !node.closest('[inert]') && node.tabIndex >= 0)
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return createPortal(<div className="modal-theme citizen-portal portal-v2"><dialog ref={dialogRef} className={`modal-layer ${backdropClass}`} aria-labelledby={labelledBy} aria-label={!labelledBy ? label : undefined} aria-busy={busy || undefined}
    onKeyDown={containFocus}
    onCancel={event => { event.preventDefault(); close() }}
    onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    {children}
  </dialog></div>, document.body)
}
