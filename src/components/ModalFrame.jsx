import { useEffect, useRef } from 'react'
import './ModalFrame.css'

// Layout only: ModalDialog continues to own focus, Escape and background isolation.
export default function ModalFrame({ as: Root = 'section', header, footer, children, className = '', ...props }) {
  const frameRef = useRef(null)
  useEffect(() => {
    const dialog = frameRef.current?.closest('dialog')
    const viewport = window.visualViewport
    const resize = () => dialog?.style.setProperty('--modal-viewport-height', `${viewport?.height || window.innerHeight}px`)
    resize()
    viewport?.addEventListener('resize', resize)
    window.addEventListener('resize', resize)
    return () => { viewport?.removeEventListener('resize', resize); window.removeEventListener('resize', resize); dialog?.style.removeProperty('--modal-viewport-height') }
  }, [])
  return <Root {...props} className={`modal-frame ${className}`} ref={frameRef}>
    <header className="modal-frame-header">{header}</header>
    <div className="modal-frame-body">{children}</div>
    {footer && <footer className="modal-frame-footer">{footer}</footer>}
  </Root>
}
