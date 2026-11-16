import { useEffect, useRef, useState } from 'react'
import { Cookie, Settings, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import ModalDialog from './ModalDialog'
import { COOKIE_KEY as PREFERENCES_KEY, CONSENT_VERSION, defaultPreferences, readPreferences } from '../services/cookiePreferences'
import { analyticsConsentChanged } from '../services/websiteAnalytics'

export default function CookieCacheBanner() {
  const [preferences, setPreferences] = useState(() => ({ ...defaultPreferences, ...(readPreferences() || {}) }))
  const [open, setOpen] = useState(() => !readPreferences()?.acknowledged), [customize, setCustomize] = useState(false)
  const saveRef = useRef(null)
  saveRef.current = next => { try { window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ essential: true, functional: next.functional === true, publicCache: next.publicCache === true, analytics: next.analytics === true, acknowledged: true, consentVersion: CONSENT_VERSION })); document.cookie = `getafe_cache=${next.publicCache ? 'on' : 'off'}; Max-Age=31536000; Path=/; SameSite=Lax` } catch { /* Preferences remain active for this visit if storage is unavailable. */ } setPreferences(next); analyticsConsentChanged(); setOpen(false) }
  useEffect(() => {
    const reopen = () => { setPreferences({ ...defaultPreferences, ...(readPreferences() || {}) }); setCustomize(true); setOpen(true) }
    window.addEventListener('open-cookie-preferences', reopen)
    return () => window.removeEventListener('open-cookie-preferences', reopen)
  }, [])
  if (!open) return null
  const save = next => saveRef.current?.(next)
  return <ModalDialog labelledBy="cookie-cache-title" onClose={() => save(preferences)} backdropClass="cookie-cache-backdrop">
    <section className={`cookie-cache-dialog ${customize ? 'cookie-cache-customize' : 'cookie-cache-default'}`} aria-labelledby="cookie-cache-title" tabIndex="-1">
      <button type="button" className="cookie-cache-dialog-close" aria-label="Close cookie and cache settings" onClick={() => save(preferences)} data-icon-button="ghost"><X size={18}/></button>
      {!customize ? <>
        <span className="cookie-cache-banner-icon" aria-hidden="true"><Cookie size={20}/></span>
        <h2 id="cookie-cache-title">Cookies and cache notice</h2>
          <p>Essential storage is required to operate the portal. Analytics is on by default and measures page visits, broad viewport sizes, content views, announcement popup use, navigation placement impressions and clicks, service steps, search result clicks, and Open Data activity. You can change your choice on the <Link to="/legal/cookies" target="_blank">Cookies &amp; Cache Notice</Link> page. Read our <Link to="/legal/privacy" target="_blank">Privacy Policy</Link> for details.</p>
        <div className="cookie-cache-dialog-actions"><button type="button" className="cookie-cache-secondary" onClick={() => setCustomize(true)}><Settings size={15}/> Customize choices</button><button type="button" className="cookie-cache-primary" onClick={() => save(preferences)}>Save selected choices</button></div>
      </> : <>
        <h2 id="cookie-cache-title">Choose your preferences</h2>
        <p>Essential storage is always enabled for required session and preference handling. Analytics is on by default; turn it off here to opt out. Read our <Link to="/legal/cookies" target="_blank">Cookies &amp; Cache Notice</Link> and <Link to="/legal/privacy" target="_blank">Privacy Policy</Link> for details.</p>
        <div className="cookie-cache-options">
          <PreferenceToggle title="Essential session and preference storage" description="Required to operate the portal, maintain secure sign-in, and remember your choices." checked disabled/>
          <PreferenceToggle title="Functional preferences" description="Remembers convenience settings on this device." checked={preferences.functional} onChange={value => setPreferences(current => ({ ...current, functional: value }))}/>
          <PreferenceToggle title="Public content caching" description="Allows public, non-personal website files to load faster from your browser cache." checked={preferences.publicCache} onChange={value => setPreferences(current => ({ ...current, publicCache: value }))}/>
            <PreferenceToggle title="Analytics" description="Measures page views, broad viewport sizes, content and popup views, navigation placement impressions and clicks, service steps, search result clicks, dataset views, query requests, and download clicks. It is on by default and can be turned off. No visitor ID is created." checked={preferences.analytics} onChange={value => setPreferences(current => ({ ...current, analytics: value }))}/>
        </div>
        <div className="cookie-cache-dialog-actions"><button type="button" className="cookie-cache-secondary" onClick={() => setCustomize(false)}>Back</button><button type="button" className="cookie-cache-primary" onClick={() => save(preferences)}>Save choices</button></div>
      </>}
    </section>
  </ModalDialog>
}

function PreferenceToggle({ title, description, checked, disabled, onChange }) { return <label className={`cookie-cache-option${disabled ? ' required' : ''}`}><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" aria-label={title} checked={checked} disabled={disabled} onChange={event => onChange?.(event.target.checked)}/></label> }
