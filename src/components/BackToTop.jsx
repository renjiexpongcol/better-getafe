import { useEffect, useState } from 'react'
import { Accessibility, ArrowUp, Eye, EyeOff, FileText } from 'lucide-react'

// Global "Back to top" floating button shown on every page once the user
// scrolls down far enough. Smoothly scrolls back to the top on click.
export default function BackToTop() {
  const [visible, setVisible] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [highContrast, setHighContrast] = useState(() => {
    try { return localStorage.getItem('getafe-high-contrast') === 'true' } catch { return false }
  })

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast)
    document.documentElement.toggleAttribute('data-high-contrast', highContrast)
    try { localStorage.setItem('getafe-high-contrast', String(highContrast)) } catch { /* storage may be unavailable */ }
  }, [highContrast])

  const toggleHighContrast = () => setHighContrast(value => !value)

  const skipToMainContent = () => {
    const main = document.querySelector('main')
    if (!main) return
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
    main.focus({ preventScroll: true })
    main.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <div className={`floating-accessibility-tools${collapsed ? ' is-collapsed' : ''}${visible ? '' : ' is-at-top'}`} aria-label="Page accessibility tools">
    {!collapsed && <>
      <button type="button" aria-label="Skip to main content" title="Skip to main content" onClick={skipToMainContent}><FileText size={25} aria-hidden="true" /></button>
      <a href="/info/accessibility#statement" aria-label="Accessibility" title="Accessibility"><Accessibility size={24} aria-hidden="true" /></a>
      <button type="button" aria-label={highContrast ? 'Disable high contrast' : 'Enable high contrast'} title={highContrast ? 'Disable high contrast' : 'Enable high contrast'} aria-pressed={highContrast} onClick={toggleHighContrast}>{highContrast ? <Eye size={22} aria-hidden="true" /> : <EyeOff size={22} aria-hidden="true" />}</button>
    </>}
    <button type="button" className="accessibility-collapse" aria-label={collapsed ? 'Expand accessibility menu' : 'Close accessibility menu'} aria-expanded={!collapsed} title={collapsed ? 'Expand accessibility menu' : 'Close accessibility menu'} onClick={() => setCollapsed(value => !value)}><img src="/assets/icons/icon pack/accessibility.png" alt="" aria-hidden="true" /></button>
    <span className={`back-to-top-slot${visible ? ' is-visible' : ''}`} aria-hidden={!visible}>
      <button type="button" className={`back-to-top${visible ? ' is-visible' : ''}`} tabIndex={visible ? 0 : -1} aria-label="Back to top" title="Back to top" onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}><ArrowUp size={20} aria-hidden="true" /></button>
    </span>
  </div>
}
