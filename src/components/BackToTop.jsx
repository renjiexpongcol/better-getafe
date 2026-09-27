import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Accessibility, ArrowUp, Eye, FileText, X, ZoomIn, ZoomOut, Contrast, Lightbulb, Link as LinkIcon, Type, RotateCcw } from 'lucide-react'

const preferenceDefaults = { textScale: 1, grayscale: false, negativeContrast: false, lightBackground: false, linksUnderlined: false, readableFont: false }

function loadAccessibilityPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('getafe-accessibility-preferences') || '{}')
    const scale = Number(saved?.textScale)
    return {
      textScale: Number.isFinite(scale) ? Math.min(1.5, Math.max(0.8, Math.round(scale * 10) / 10)) : 1,
      grayscale: saved?.grayscale === true,
      negativeContrast: saved?.negativeContrast === true,
      lightBackground: saved?.lightBackground === true,
      linksUnderlined: saved?.linksUnderlined === true,
      readableFont: saved?.readableFont === true,
    }
  } catch { return preferenceDefaults }
}

// Global "Back to top" floating button shown on every page once the user
// scrolls down far enough. Smoothly scrolls back to the top on click.
export default function BackToTop() {
  const [visible, setVisible] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const triggerRef = useRef(null)
  const firstOptionRef = useRef(null)
  const [highContrast, setHighContrast] = useState(() => {
    try { return localStorage.getItem('getafe-high-contrast') === 'true' } catch { return false }
  })
  const [preferences, setPreferences] = useState(loadAccessibilityPreferences)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast)
    if (highContrast) document.documentElement.setAttribute('data-high-contrast', 'true')
    else document.documentElement.removeAttribute('data-high-contrast')
    try { localStorage.setItem('getafe-high-contrast', String(highContrast)) } catch { /* storage may be unavailable */ }
  }, [highContrast])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accessibility-text-scale', String(preferences.textScale))
    for (const [key, className] of Object.entries({ grayscale: 'accessibility-grayscale', negativeContrast: 'accessibility-negative-contrast', lightBackground: 'accessibility-light-background', linksUnderlined: 'accessibility-links-underlined', readableFont: 'accessibility-readable-font' })) {
      root.classList.toggle(className, Boolean(preferences[key]))
    }
    try { localStorage.setItem('getafe-accessibility-preferences', JSON.stringify(preferences)) } catch { /* storage may be unavailable */ }
  }, [preferences])

  const updatePreference = (key, value) => setPreferences(current => ({ ...current, [key]: value }))
  const togglePreference = key => setPreferences(current => ({ ...current, [key]: !current[key] }))
  const resetAccessibility = () => {
    setHighContrast(false)
    setPreferences(preferenceDefaults)
  }

  const toggleHighContrast = () => setHighContrast(value => !value)

  const closeAccessibilityMenu = (restoreFocus = true) => {
    setCollapsed(true)
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }
  }

  useEffect(() => {
    if (collapsed) return undefined
    const frame = window.requestAnimationFrame(() => {
      firstOptionRef.current?.focus()
      firstOptionRef.current?.scrollIntoView({ block: 'nearest' })
    })
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeAccessibilityMenu()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    function onPointerDown(event) {
      if (!event.target.closest?.('.accessibility-control')) closeAccessibilityMenu(false)
    }
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [collapsed])

  const skipToMainContent = () => {
    const main = document.querySelector('main')
    if (!main) { closeAccessibilityMenu(); return }
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
    setCollapsed(true)
    main.focus({ preventScroll: true })
    main.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  return <div className={`floating-accessibility-tools${collapsed ? ' is-collapsed' : ''}${visible ? '' : ' is-at-top'}`} role="group" aria-label="Page accessibility tools">
    <div className="accessibility-control">
      {!collapsed && <div ref={firstOptionRef} id="accessibility-options" className="accessibility-options" role="group" aria-label="Accessibility options" tabIndex={-1}>
        <div className="accessibility-options-heading">Accessibility Tools</div>
        <button type="button" className="accessibility-option" aria-label={`Increase text size${preferences.textScale >= 1.5 ? ', maximum reached' : ''}`} title="Increase text size" disabled={preferences.textScale >= 1.5} onClick={() => updatePreference('textScale', Math.min(1.5, +(preferences.textScale + 0.1).toFixed(1)))}>
          <span className="accessibility-option-icon" aria-hidden="true"><ZoomIn size={17} /></span><span className="accessibility-option-label">Increase Text</span>
        </button>
        <button type="button" className="accessibility-option" aria-label={`Decrease text size${preferences.textScale <= 0.8 ? ', minimum reached' : ''}`} title="Decrease text size" disabled={preferences.textScale <= 0.8} onClick={() => updatePreference('textScale', Math.max(0.8, +(preferences.textScale - 0.1).toFixed(1)))}>
          <span className="accessibility-option-icon" aria-hidden="true"><ZoomOut size={17} /></span><span className="accessibility-option-label">Decrease Text</span>
        </button>
        <button type="button" className="accessibility-option" aria-pressed={preferences.grayscale} onClick={() => togglePreference('grayscale')}>
          <span className="accessibility-option-icon" aria-hidden="true"><span className="accessibility-grayscale-icon">▥</span></span><span className="accessibility-option-label">Grayscale</span>
        </button>
        <button type="button" className="accessibility-option" aria-pressed={highContrast} onClick={toggleHighContrast}>
          <span className="accessibility-option-icon" aria-hidden="true"><Contrast size={17} /></span><span className="accessibility-option-label">High Contrast</span>
        </button>
        <button type="button" className="accessibility-option" aria-pressed={preferences.negativeContrast} onClick={() => togglePreference('negativeContrast')}>
          <span className="accessibility-option-icon" aria-hidden="true"><Eye size={17} /></span><span className="accessibility-option-label">Negative Contrast</span>
        </button>
        <button type="button" className="accessibility-option" aria-pressed={preferences.lightBackground} onClick={() => togglePreference('lightBackground')}>
          <span className="accessibility-option-icon" aria-hidden="true"><Lightbulb size={17} /></span><span className="accessibility-option-label">Light Background</span>
        </button>
        <button type="button" className="accessibility-option" aria-pressed={preferences.linksUnderlined} onClick={() => togglePreference('linksUnderlined')}>
          <span className="accessibility-option-icon" aria-hidden="true"><LinkIcon size={17} /></span><span className="accessibility-option-label">Links Underline</span>
        </button>
        <button type="button" className="accessibility-option" aria-pressed={preferences.readableFont} onClick={() => togglePreference('readableFont')}>
          <span className="accessibility-option-icon" aria-hidden="true"><Type size={17} /></span><span className="accessibility-option-label">Readable Font</span>
        </button>
        <button type="button" className="accessibility-option" onClick={resetAccessibility}>
          <span className="accessibility-option-icon" aria-hidden="true"><RotateCcw size={17} /></span><span className="accessibility-option-label">Reset</span>
        </button>
        <div className="accessibility-menu-divider" />
        <button type="button" className="accessibility-option" aria-label="Skip to main content" title="Skip to main content" onClick={skipToMainContent}>
          <span className="accessibility-option-icon" aria-hidden="true"><FileText size={19} /></span>
          <span className="accessibility-option-label">Skip to content</span>
        </button>
        <Link className="accessibility-option" to="/accessibility#accessibility" aria-label="Accessibility page" title="Accessibility page" onClick={() => setCollapsed(true)}>
          <span className="accessibility-option-icon" aria-hidden="true"><Accessibility size={19} /></span>
          <span className="accessibility-option-label">Accessibility page</span>
        </Link>
        <button type="button" className="accessibility-option" aria-label="Close accessibility options" title="Close accessibility options" onClick={() => closeAccessibilityMenu()}>
          <span className="accessibility-option-icon" aria-hidden="true"><X size={19} /></span>
          <span className="accessibility-option-label">Close</span>
        </button>
      </div>}
      <button ref={triggerRef} type="button" className="floating-action-button accessibility-trigger" aria-label={collapsed ? 'Show accessibility options' : 'Close accessibility options'} aria-expanded={!collapsed} aria-controls="accessibility-options" title={collapsed ? 'Show accessibility options' : 'Close accessibility options'} onClick={() => collapsed ? setCollapsed(false) : closeAccessibilityMenu()}><Accessibility size={21} aria-hidden="true" /></button>
    </div>
    <span className={`back-to-top-slot${visible ? ' is-visible' : ''}`} aria-hidden={!visible}>
      <button type="button" className={`floating-action-button back-to-top${visible ? ' is-visible' : ''}`} tabIndex={visible ? 0 : -1} aria-label="Back to top" title="Back to top" onClick={() => window.scrollTo({ top: 0, left: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}><ArrowUp size={21} aria-hidden="true" /></button>
    </span>
  </div>
}
