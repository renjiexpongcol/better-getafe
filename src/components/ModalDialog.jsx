import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import './ModalDialog.css'

let openDialogs = 0
let previousOverflow = ''
const dialogStack = []

// Native modal dialogs provide background isolation and a focus trap, including
// when a confirmation dialog is opened above another modal.
export default function ModalDialog({ children, onClose, busy = false, labelledBy, describedBy, label, returnFocusRef, size, portal = true, themeClass = '', backdropClass = 'portal-action-backdrop' }) {
  const dialogRef = useRef(null)
  const closeHostRef = useRef(null)
  const [closeHost, setCloseHost] = useState(null)
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
    dialogStack.push(dialog)
    document.addEventListener('keydown', containFocus, true)

    const updateCloseControls = () => {
      const host = [...dialog.children].find(node => node instanceof HTMLElement && !node.classList.contains('modal-dialog-close')) || null
      if (closeHostRef.current !== host) {
        if (closeHostRef.current) delete closeHostRef.current.dataset.modalCloseHost
        closeHostRef.current = host
        if (host) host.dataset.modalCloseHost = 'true'
        setCloseHost(host)
      }

      const isVisible = node => {
        const style = window.getComputedStyle(node)
        return node.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden' && !node.closest('[hidden], [inert]')
      }
      const buttons = [...dialog.querySelectorAll('button')]
      const hasCloseAction = buttons.some(button => {
        if (button.classList.contains('modal-dialog-close') || !isVisible(button)) return false
        const text = (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim()
        return button.hasAttribute('data-dialog-close-action') || /^close$/i.test(text) || (/^close$/i.test(button.getAttribute('aria-label') || '') && !/^[×✕✖x]$/i.test(text))
      })
      let hasCloseIcon = false
      buttons.forEach(button => {
        if (button.classList.contains('modal-dialog-close')) return
        const accessibleName = button.getAttribute('aria-label') || ''
        const text = (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim()
        const iconOnlyClose = /^close(?:\b|$)/i.test(accessibleName) && (!text || /^[×✕✖x]$/i.test(text))
        if (iconOnlyClose) {
          button.dataset.modalDismissIcon = 'true'
          if (accessibleName !== 'Close dialog') button.setAttribute('aria-label', 'Close dialog')
          if (isVisible(button)) hasCloseIcon = true
        } else {
          delete button.dataset.modalDismissIcon
        }
      })
      dialog.dataset.modalCloseMode = hasCloseAction ? 'action' : hasCloseIcon ? 'icon' : 'shared'
    }
    updateCloseControls()
    const closeObserver = new MutationObserver(updateCloseControls)
    closeObserver.observe(dialog, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'aria-hidden', 'class', 'hidden', 'inert', 'style', 'data-dialog-close-action'] })
    return () => {
      closeObserver.disconnect()
      if (closeHostRef.current) delete closeHostRef.current.dataset.modalCloseHost
      document.removeEventListener('keydown', containFocus, true)
      dialogStack.splice(dialogStack.indexOf(dialog), 1)
      dialog.close()
      if (--openDialogs === 0) document.body.style.overflow = previousOverflow
      window.requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true })
      })
    }
  }, [])
  const close = () => { if (!current.current.busy) current.current.onClose() }
  const containFocus = event => {
    if (event.key !== 'Tab' || dialogStack.at(-1) !== dialogRef.current) return
    const controls = [...dialogRef.current.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
      .filter(node => node.getClientRects().length && !node.closest('[inert]') && node.tabIndex >= 0)
    const first = controls[0], last = controls.at(-1)
    // Disabling the focused submit control can move focus to the body. Recover
    // within the top dialog before Tab can reach browser chrome or the page.
    if (!first || !dialogRef.current.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); if (!first) dialogRef.current.focus() }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  const content = <div className={`modal-theme citizen-portal portal-v2 ${themeClass}`}><dialog ref={dialogRef} className={`modal-layer ${backdropClass}`} data-dialog-size={size} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-label={!labelledBy ? label : undefined} aria-busy={busy || undefined}
    onCancel={event => { event.preventDefault(); close() }}
    onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    {children}
    {closeHost && createPortal(<button type="button" className="modal-dialog-close" aria-label="Close dialog" disabled={busy} onClick={close} data-icon-button="ghost"><X size={19} aria-hidden="true" /></button>, closeHost)}
  </dialog></div>
  return portal ? createPortal(content, document.body) : content
}
