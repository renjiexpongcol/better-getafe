import { useEffect, useRef, useState } from 'react'
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Info, LoaderCircle, Mail, RotateCw, Search, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SettingsPermissions from './SettingsPermissions'
import { categoryLabels, categorySections, sectionIcon, fieldDescription } from './settingsPresentation'
import { ModuleAccessDeniedPage, ModuleNotFoundPage } from './RouteStatusPages'
import { ROUTES } from '../routeRegistry'
import { normalizePublicError } from '../services/publicError'
import './AdminSettings.css'

const sources = { database: 'Saved', 'secret-manager': 'Secure storage', environment: 'Environment', default: 'Default' }
async function request(path, options = {}) {
  const response = await fetch(`/api/admin/settings${path}`, {
    credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options,
  })
  const raw = await response.text()
  let body = null
  if (raw.trim()) { try { body = JSON.parse(raw) } catch { /* Report invalid responses below. */ } }
  if (!response.ok) throw new Error(normalizePublicError({ status: response.status, body }, 'unknown').message)
  if (!body) throw new Error('The server returned an empty response.')
  return body
}

export default function AdminSettings({ category = 'general', settings, settingsLoading = false, setSettings, onSaved }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [patch, setPatch] = useState({})
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const configQuery = searchParams.get('config') || ''
  const [openGroup, setOpenGroup] = useState(configQuery)
  const [connectionState, setConnectionState] = useState('idle')
  const dirty = Object.keys(patch).length > 0
  const can = permission => settings?.permissions?.includes(permission)
  const tabs = [...(settings?.categories || []), 'status', ...(can('settings.audit.view') ? ['history'] : [])]
  const activeTab = category
  const writable = (key, definition) => can('settings.edit') && (!definition.secret || can('settings.secrets.edit'))
    && (!['database', 'portalDatabase'].includes(key.split('.')[0]) || can('settings.database.edit'))
    && (!['storage', 'google'].includes(key.split('.')[0]) || can('settings.storage.edit'))
    && (!['security', 'authentication'].includes(key.split('.')[0]) || can('settings.security.edit'))

  useEffect(() => {
    setOpenGroup(configQuery)
  }, [configQuery])
  useEffect(() => {
    setPatch({})
    setCategorySearch('')
    setMessage(null)
    setConnectionState('idle')
  }, [activeTab])
  useEffect(() => {
    if (!dirty) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => {
    if (!['history', 'status'].includes(activeTab)) return
    let active = true
    const controller = new AbortController()
    setLoading(true)
    request(`/${activeTab}`, { signal: controller.signal })
      .then(body => { if (active) (activeTab === 'history' ? setHistory : setStatus)(body) })
      .catch(error => { if (active && error?.name !== 'AbortError') setMessage({ error: true, text: error.message }) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [activeTab])
  useEffect(() => {
    if (!message || message.error) return
    const timer = window.setTimeout(() => setMessage(null), 5000)
    return () => window.clearTimeout(timer)
  }, [message])

  const run = async (operation, onError) => {
    setBusy(true); setMessage(null)
    try { await operation() } catch (error) {
      const details = onError?.(error)
      setMessage({ error: true, type: details?.type, text: details?.text || error.message })
    }
    finally { setBusy(false) }
  }
  const selectTab = next => {
    if (busy) return
    if (next === activeTab) return
    if (dirty && !window.confirm('You have unsaved changes. Discard them and leave this section?')) return
    setPatch({}); setCategorySearch(''); setMessage(null); setOpenGroup('')
    navigate(ROUTES.admin.setting(next))
  }
  const updateConfigUrl = (next, section) => {
    const params = new URLSearchParams(searchParams)
    if (next) params.set('config', sectionSlug(section))
    else params.delete('config')
    setSearchParams(params, { replace: true })
  }
  const closeSection = () => {
    if (busy) return
    if (dirty && !window.confirm('Discard unsaved changes?\n\nYou have changes that have not been saved.')) return
    setPatch({}); setOpenGroup(''); updateConfigUrl(false)
  }
  const change = (key, value) => setPatch(previous => {
    const next = { ...previous }
    if ((value !== null && value === settings.values[key]) || (settings.metadata[key]?.secret && value === '')) delete next[key]
    else next[key] = value
    return next
  })
  const undo = key => { setConnectionState('idle'); setPatch(previous => { const next = { ...previous }; delete next[key]; return next }) }
  const save = event => {
    event.preventDefault()
    if (!dirty || busy) return
    run(async () => {
      const body = await request(`/${activeTab}`, { method: 'PUT', body: JSON.stringify({ values: patch }) })
      setSettings(body); setPatch({}); setOpenGroup(''); setConnectionState('idle'); updateConfigUrl(false); setMessage(null)
      onSaved?.('Changes saved')
      window.dispatchEvent(new Event('configuration-changed'))
    })
  }

  const query = categorySearch.trim().toLowerCase()
  const globalQuery = globalSearch.trim().toLowerCase()
  const categoryKeywords = { email: 'smtp sender mail password delivery templates acknowledgement', database: 'postgresql connection database pool ssl tls health', portalDatabase: 'postgresql portal database connection resident', google: 'oauth google cloud project credentials', storage: 'bucket upload storage files media', authentication: 'login registration password session verification', security: 'captcha security headers rate limiting permissions', notifications: 'email alerts system notifications', integrations: 'connected services api webhooks', general: 'application facebook branding regional preferences', features: 'feature flags uploads reports', publicData: 'public datasets catalog', maintenance: 'maintenance mode', legal: 'privacy terms cookies', advanced: 'diagnostics' }
  const globalMatches = tabs.filter(key => {
    if (!globalQuery) return true
    if (['status', 'history'].includes(key)) return (categoryLabels[key] || key).toLowerCase().includes(globalQuery)
    const categoryFields = Object.entries(settings?.metadata || {}).filter(([fieldKey]) => fieldKey.startsWith(`${key}.`))
    return `${categoryLabels[key] || key} ${categoryKeywords[key] || ''} ${categoryFields.map(([fieldKey, definition]) => `${fieldKey} ${definition.label} ${fieldDescription(fieldKey, definition)}`).join(' ')}`.toLowerCase().includes(globalQuery)
  })
  useEffect(() => {
    if (!settings || !globalQuery || dirty || globalMatches.includes(activeTab) || !globalMatches.length) return
    selectTab(globalMatches[0])
  }, [globalQuery, globalMatches.join('|'), activeTab, dirty, Boolean(settings)])
  if (!settings || settingsLoading) return <section className="settings-panel" aria-label="Loading settings" aria-busy="true"><div className="settings-skeleton" /><div className="settings-skeleton" /><div className="settings-skeleton tall" /></section>
  if (activeTab === 'history' && !can('settings.audit.view')) return <ModuleAccessDeniedPage />
  if (!tabs.includes(activeTab)) return <ModuleNotFoundPage home={ROUTES.admin.setting('general')} />
  const fields = Object.entries(settings.metadata || {}).filter(([key]) => key.startsWith(`${activeTab}.`))
  // A category-scoped response replaces the previous category in the parent
  // state. During a fast route change, render a stable loading state until
  // the new category values arrive instead of briefly showing an empty panel.
  if (!['history', 'status'].includes(activeTab) && !fields.some(([key]) => Object.hasOwn(settings.values || {}, key))) return <section className="settings-panel" aria-label="Loading settings" aria-busy="true"><div className="settings-skeleton" /><div className="settings-skeleton" /><div className="settings-skeleton tall" /></section>
  const sections = categorySections(activeTab, fields)
  const filteredSections = sections.map(section => ({ ...section, fields: section.fields.filter(([key, definition]) =>
    `${section.title} ${key} ${definition.label} ${fieldDescription(key, definition)}`.toLowerCase().includes(query),
  ) })).filter(section => section.fields.length)
  const testable = ['database', 'portalDatabase', 'storage', 'email'].includes(activeTab)
    && can('settings.edit') && fields.every(([key, definition]) => definition.secret || writable(key, definition))

  const testConnection = async form => {
    if (!form.reportValidity()) return
    setConnectionState('testing')
    await run(async () => {
      const result = await request(`/test/${activeTab}`, { method: 'POST', body: JSON.stringify({ values: patch }) })
      setConnectionState('connected')
      setMessage({ type: 'success', text: `Connected${result.latencyMs !== undefined ? ` · ${result.latencyMs} ms` : ''}` })
    }, error => { setConnectionState('failed'); return { type: 'connection-error', text: `Connection test failed: ${error.message}` } })
  }

  const categoryContent = <div className="settings-content" id={`settings-panel-${activeTab}`} role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`}>
    {message && <div className={`settings-message ${message.error ? 'is-error' : ''} ${message.type ? `is-${message.type}` : ''}`} role={message.error ? 'alert' : 'status'} aria-live={message.error ? 'assertive' : 'polite'}>
      <span className="settings-message-icon">{message.error ? <Info size={18} /> : message.type === 'success' ? <CheckCircle2 size={19} /> : <Info size={18} />}</span><span className="settings-message-copy"><strong>{message.error ? message.type === 'connection-error' ? 'Connection test failed' : 'Unable to save changes' : message.type === 'success' ? 'Changes saved' : 'Configuration priority'}</strong><span>{message.text}</span></span>
      <button type="button" aria-label="Dismiss message" onClick={() => setMessage(null)}><X size={14} /></button>
    </div>}
    {activeTab === 'status' ? <SettingsSection title="System status" description="Service health and the latest connection checks." icon={sectionIcon('status')}>
      {loading ? <p className="settings-empty" role="status">Loading service status…</p> : <div className="settings-status">{Object.entries(status).map(([name, service]) =>
        <article key={name}><div><h3>{categoryLabels[name] || name}</h3><p>{service.latencyMs !== undefined && `${service.latencyMs} ms · `}{service.checkedAt ? new Date(service.checkedAt).toLocaleString() : 'Not checked'}</p></div><StatusBadge>{service.status || 'Not checked'}</StatusBadge></article>,
      )}</div>}
    </SettingsSection> : activeTab === 'history' ? <AuditHistory history={history} loading={loading} /> : <>
      <div className="settings-category-heading"><div><h2>{categoryLabels[activeTab] || activeTab}</h2><p>{categoryLabels[activeTab] === 'Email' ? 'Configure outgoing email and SMTP delivery.' : `Configure ${String(categoryLabels[activeTab] || activeTab).toLowerCase()} settings.`}</p></div>
        <label className="settings-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Search this category" placeholder="Search this category…" value={categorySearch} onChange={event => setCategorySearch(event.target.value)} /></label>
      </div>
      <div className="settings-notice"><Info size={14} aria-hidden="true" /><span><strong>Configuration priority</strong> Values saved here override environment defaults where supported. Removing an override restores the configured environment/default value.</span></div>
      <form id={`cms-settings-form-${activeTab}`} onSubmit={save}>
        {filteredSections.map(section => <SettingsSection key={section.title} title={section.title} description={section.description} icon={section.icon}>
          <div className="settings-fields">{section.fields.map(([key, definition]) => <SettingsField key={key} settingKey={key} definition={definition}
            value={Object.hasOwn(patch, key) && patch[key] !== null ? patch[key] : settings.values[key]}
            secretValue={patch[key] || ''} reset={Object.hasOwn(patch, key) && patch[key] === null}
            edited={Object.hasOwn(patch, key)} disabled={busy || !writable(key, definition)} canEdit={writable(key, definition)}
            onChange={value => { setConnectionState('idle'); change(key, value) }} onUndo={() => undo(key)} />)}</div>
        </SettingsSection>)}
        {!filteredSections.length && <p className="settings-empty">{query ? 'No matching settings in this category.' : 'No settings are available in this category.'}</p>}
        {testable && <div className="settings-test-action"><button className="settings-button secondary" type="button" disabled={busy} onClick={event => testConnection(event.currentTarget.form)}><RotateCw size={14} aria-hidden="true" /> {connectionState === 'testing' ? 'Testing…' : 'Test connection'}</button>{connectionState === 'connected' && <span className="settings-connection-state is-connected" role="status">Connected</span>}{connectionState === 'failed' && <span className="settings-connection-state is-failed" role="status">Failed</span>}</div>}
        {!dirty && <div className="settings-save-row"><button className="settings-button primary" type="submit" disabled><Check size={15} aria-hidden="true" /> Save changes</button></div>}
      </form>
      {dirty && <div className="settings-unsaved-bar"><span><span className="settings-dirty-dot" />You have unsaved changes.</span><div>
        <button className="settings-button secondary" type="button" disabled={busy} onClick={() => { setPatch({}); setMessage(null); setConnectionState('idle') }}>Cancel</button>
        <button className="settings-button primary" type="submit" form={`cms-settings-form-${activeTab}`} disabled={busy}>{busy ? <LoaderCircle className="settings-spinner" /> : <Check size={15} aria-hidden="true" />}{busy ? 'Working…' : 'Save changes'}</button>
      </div></div>}
    </>}
  </div>
  return <section className="settings-panel">
    <header className="settings-heading">
      <div><h1>Settings</h1><p>Manage system configuration and integrations.</p></div>
      <label className="settings-search settings-global-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Search settings" placeholder="Search settings..." value={globalSearch} onChange={event => setGlobalSearch(event.target.value)} /></label>
    </header>
    <div className="settings-workspace"><SettingsTabs tabs={tabs} activeTab={activeTab} onSelect={selectTab} disabled={busy} search={globalSearch} settings={settings} />
      {categoryContent}
    </div>
    {openGroup && (() => {
      if (openGroup === 'email-templates') return <EmailTemplateModal onClose={closeSection} />
      const section = sections.find(item => sectionSlug(item) === openGroup)
      return section ? <SettingsModal section={section} settings={settings} patch={patch} busy={busy} testable={testable} writable={writable} onChange={change} onUndo={undo} onSave={save} onTest={testConnection} onClose={closeSection} /> : null
    })()}
  </section>
}

function EmailTemplateModal({ onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector('button')?.focus()
    const onKeyDown = event => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus?.() }
  }, [onClose])
  return <div className="settings-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="settings-modal settings-template-modal" role="dialog" aria-modal="true" aria-labelledby="email-template-title" aria-describedby="email-template-description" ref={dialog}>
      <header className="settings-modal-header"><span className="settings-section-icon"><Mail size={18} aria-hidden="true" /></span><div><h2 id="email-template-title">Email templates</h2><p id="email-template-description">Preview the automated contact acknowledgement email.</p></div><button type="button" className="settings-modal-close" aria-label="Close email templates" onClick={onClose}><X size={19} strokeWidth={1.8} /></button></header>
      <div className="settings-template-body">
        <div className="settings-template-toolbar"><div><span className="settings-template-kicker">Available template</span><h3>Contact acknowledgement</h3></div><SettingSourceBadge source="Application template" /></div>
        <div className="settings-template-details"><div><span>Subject</span><strong>We received your message · Municipality of Getafe</strong></div><div><span>Sent when</span><strong>A public contact message is successfully received</strong></div><div><span>Includes</span><strong>Reference number, category, subject, and submission date</strong></div></div>
        <div className="settings-email-preview"><div className="settings-email-preview-bar"><span>Preview</span><small>Example content</small></div><div className="settings-email-preview-header"><small>Municipality of Getafe</small><h3>We received your message</h3></div><div className="settings-email-preview-content"><p>Dear Maria Santos,</p><p>Thank you for contacting the Municipality of Getafe. Your message has been successfully received.</p><div className="settings-email-preview-reference"><span>Submission details</span><p><b>Reference number:</b><br />GET-2026-00124</p><p><b>Category:</b><br />General inquiry</p><p><b>Subject:</b><br />Request for information</p></div><p className="settings-email-preview-muted">Please keep your reference number for future inquiries.</p></div><div className="settings-email-preview-footer">This is an automated acknowledgement from the Municipality of Getafe Official Portal.</div></div>
        <p className="settings-template-note">This template is currently managed by the application. SMTP, sender identity, and reply-to settings can be changed from the Email category.</p>
      </div>
      <footer className="settings-modal-footer"><button className="settings-button secondary" type="button" onClick={onClose}>Close</button></footer>
    </div>
  </div>
}

function sectionSlug(section) {
  return section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function SettingSourceBadge({ source }) {
  return <span className="settings-source-badge">{source}</span>
}

function SettingsModal({ section, settings, patch, busy, testable, writable, onChange, onUndo, onSave, onTest, onClose }) {
  const dialog = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const titleId = `settings-modal-title-${sectionSlug(section)}`
  const descriptionId = `settings-modal-description-${sectionSlug(section)}`
  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => [...dialog.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []]
    const focusFirst = () => focusable()[0]?.focus()
    focusFirst()
    const onKeyDown = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus?.() }
  }, [])
  return <div className="settings-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={dialog}>
      <header className="settings-modal-header"><span className="settings-section-icon"><section.icon size={18} aria-hidden="true" /></span><div><h2 id={titleId}>{section.title}</h2><p id={descriptionId}>{section.description}</p></div><button type="button" className="settings-modal-close" aria-label="Close configuration" onClick={onClose}><X size={19} strokeWidth={1.8} /></button></header>
      <form id="settings-modal-form" className="settings-modal-body" onSubmit={onSave}>
        <div className="settings-fields">{section.fields.map(([key, definition]) => <SettingsField key={key} settingKey={key} definition={definition}
          value={Object.hasOwn(patch, key) && patch[key] !== null ? patch[key] : settings.values[key]}
          secretValue={patch[key] || ''} reset={Object.hasOwn(patch, key) && patch[key] === null}
          edited={Object.hasOwn(patch, key)} disabled={busy || !writable(key, definition)} canEdit={writable(key, definition)}
          onChange={value => onChange(key, value)} onUndo={() => onUndo(key)} />)}</div>
        {testable && <div className="settings-test-action"><button className="settings-button secondary" type="button" disabled={busy} onClick={event => onTest(event.currentTarget.form)}><RotateCw size={14} aria-hidden="true" /> Test connection</button></div>}
      </form>
      <footer className="settings-modal-footer"><button className="settings-button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="settings-button primary" type="submit" form="settings-modal-form" disabled={busy || !Object.keys(patch).length}>{busy ? <LoaderCircle className="settings-spinner" size={15} /> : <Check size={15} aria-hidden="true" />}{busy ? 'Saving…' : 'Save changes'}</button></footer>
    </div>
  </div>
}

function SettingsTabs({ tabs, activeTab, onSelect, disabled, search, settings }) {
  const list = useRef(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })
  const updateOverflow = () => {
    const element = list.current
    if (element) setOverflow({ left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 })
  }
  useEffect(() => {
    const element = list.current
    if (!element) return undefined
    const observer = new ResizeObserver(updateOverflow)
    observer.observe(element); updateOverflow()
    return () => observer.disconnect()
  }, [tabs.join('|')])
  useEffect(() => {
    const element = list.current?.querySelector('[aria-selected="true"]')
    if (element) {
      const container = list.current
      const offset = element.offsetLeft
      if (offset < container.scrollLeft) container.scrollLeft = offset
      else if (offset + element.offsetWidth > container.scrollLeft + container.clientWidth) container.scrollLeft = offset + element.offsetWidth - container.clientWidth
      updateOverflow()
    }
  }, [activeTab])
  const categoryKeywords = { email: 'smtp sender mail password delivery templates acknowledgement', database: 'postgresql connection database pool ssl tls health', portalDatabase: 'postgresql portal database connection resident', google: 'oauth google cloud project credentials', storage: 'bucket upload storage files media', authentication: 'login registration password session verification', security: 'captcha security headers rate limiting permissions', weather: 'weather api' }
  const visibleTabs = tabs.filter(key => {
    if (!search) return true
    const categoryFields = Object.entries(settings?.metadata || {}).filter(([fieldKey]) => fieldKey.startsWith(`${key}.`))
    return `${categoryLabels[key] || key} ${categoryKeywords[key] || ''} ${categoryFields.map(([fieldKey, definition]) => `${fieldKey} ${definition.label} ${fieldDescription(fieldKey, definition)}`).join(' ')}`.toLowerCase().includes(search.toLowerCase())
  })
  const scrollTabs = direction => list.current?.scrollBy({ left: direction * Math.max(200, list.current.clientWidth * 0.65), behavior: 'smooth' })
  return <nav className="settings-tabs-wrap" aria-label="Settings category navigation">
    {overflow.left && <button className="settings-tabs-control previous" type="button" aria-label="Scroll categories left" onClick={() => scrollTabs(-1)}><ChevronLeft size={17} aria-hidden="true" /></button>}
    <div className="settings-tabs" role="tablist" aria-label="Settings categories" ref={list} onScroll={updateOverflow} onWheel={event => {
      const element = list.current
      if (!element || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const max = element.scrollWidth - element.clientWidth
      const next = Math.max(0, Math.min(max, element.scrollLeft + event.deltaY))
      if (max > 0 && next !== element.scrollLeft) { event.preventDefault(); element.scrollLeft = next }
    }}>
      {visibleTabs.length ? visibleTabs.map((key, index) => <button type="button" role="tab" key={key} id={`settings-tab-${key}`} aria-selected={key === activeTab} aria-label={`${categoryLabels[key] || key} settings`}
        aria-controls={`settings-panel-${key}`} tabIndex={key === activeTab ? 0 : -1} disabled={disabled} onClick={() => onSelect(key)}
        onKeyDown={event => {
          let next
          if (event.key === 'ArrowRight') next = (index + 1) % visibleTabs.length
          if (event.key === 'ArrowLeft') next = (index - 1 + visibleTabs.length) % visibleTabs.length
          if (event.key === 'Home') next = 0
          if (event.key === 'End') next = visibleTabs.length - 1
          if (next !== undefined) { event.preventDefault(); const target = list.current.querySelectorAll('[role="tab"]')[next]; target?.focus(); target?.click() }
        }}>{categoryLabels[key] || key}</button>) : <p className="settings-nav-empty">No settings found.<small>Try another search term.</small></p>}
    </div>
    {overflow.right && <button className="settings-tabs-control next" type="button" aria-label="Scroll categories right" onClick={() => scrollTabs(1)}><ChevronRight size={17} aria-hidden="true" /></button>}
  </nav>
}

function SettingsSection({ icon: Icon, title, description, children }) {
  return <section className="settings-section"><header className="settings-section-heading"><span className="settings-section-icon"><Icon size={17} strokeWidth={1.7} aria-hidden="true" /></span><div><h3>{title}</h3><p>{description}</p></div></header>{children}</section>
}
function StatusBadge({ children }) { return <span className="settings-badge">{children}</span> }

function SettingsField({ settingKey: key, definition, value, secretValue, reset, edited, disabled, canEdit, onChange, onUndo }) {
  const row = definition.type === 'boolean' || definition.type === 'number' || Boolean(definition.options)
  const description = fieldDescription(key, definition)
  const inputProps = { id: key, disabled: disabled || reset, 'aria-describedby': description ? `${key}-help` : undefined }
  const control = definition.type === 'boolean' ? <label className="settings-toggle">
    <input {...inputProps} type="checkbox" role="switch" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} /><span aria-hidden="true" />
  </label> : definition.options ? <select {...inputProps} value={value ?? ''} onChange={event => onChange(event.target.value)}>{definition.options.map(option => <option key={option} value={option}>{option === 'google' ? 'Google reCAPTCHA' : option === 'starttls' ? 'STARTTLS' : option === 'tls' ? 'TLS' : option === 'backblaze' ? 'Backblaze B2' : option === 'embed' ? 'Embed Facebook Page Plugin' : option === 'fallback' ? 'Use native Getafe fallback card' : option}</option>)}</select>
    : key === 'security.permissionGrants' ? <div className="settings-permissions" role="group" aria-labelledby={`${key}-label`}><SettingsPermissions disabled={disabled || reset} value={value} onChange={onChange} /></div>
      : definition.secret ? <SecretInput inputProps={inputProps} value={secretValue} configured={definition.configured} onChange={onChange} />
        : definition.multiline ? <textarea {...inputProps} rows={8} required={definition.required} value={value ?? ''} onChange={event => onChange(event.target.value)} />
          : <input {...inputProps} autoComplete="off" type={definition.type === 'number' ? 'number' : definition.format === 'email' ? 'email' : 'text'} min={definition.min} max={definition.max} required={definition.required} value={value ?? ''} onChange={event => onChange(definition.type === 'number' ? Number(event.target.value) : event.target.value)} />
  return <div className={`settings-field${row ? ' settings-row' : ''}${definition.multiline || key === 'security.permissionGrants' ? ' settings-field-wide' : ''}`}>
    <div className="settings-field-copy"><div className="settings-field-label"><label id={`${key}-label`} htmlFor={key}>{definition.label}{definition.required && <span aria-hidden="true"> *</span>}</label><div className="settings-field-badges">
      <StatusBadge>{reset ? 'Reset pending' : edited ? 'Edited' : definition.secret ? definition.configured ? 'Configured' : 'Not configured' : sources[definition.source] || definition.source || 'Default'}</StatusBadge>
      {definition.requiresRestart && <StatusBadge>Restart required</StatusBadge>}
    </div></div>{description && <p id={`${key}-help`} className="settings-field-help">{description}</p>}</div>
    <div className="settings-field-control">{control}</div>
    {(definition.overridden || edited) && canEdit && <button className="settings-reset" type="button" disabled={disabled} onClick={() => reset ? onUndo() : onChange(null)}>{reset ? 'Cancel reset' : 'Restore default'}</button>}
  </div>
}

function SecretInput({ inputProps, value, configured, onChange }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { if (!value) setVisible(false) }, [value])
  return <div className="settings-secret"><input {...inputProps} type={visible ? 'text' : 'password'} autoComplete="new-password" value={value} placeholder={configured ? 'Enter a new value to replace' : 'Enter a secret value'} onChange={event => onChange(event.target.value)} />
    <button type="button" disabled={inputProps.disabled || !value} aria-label={`${visible ? 'Hide' : 'Show'} new secret`} aria-pressed={visible} onClick={() => setVisible(previous => !previous)}>{visible ? 'Hide' : 'Show'}</button></div>
}
function AuditHistory({ history, loading }) {
  const [filter, setFilter] = useState('')
  const rows = history.filter(entry => JSON.stringify(entry).toLowerCase().includes(filter.toLowerCase()))
  return <SettingsSection title="Audit history" description="Review configuration changes. Secret values remain protected." icon={sectionIcon('history')}>
    <label className="settings-search settings-audit-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Search audit history" placeholder="Search activity…" value={filter} onChange={event => setFilter(event.target.value)} /></label>
    {loading ? <p className="settings-empty" role="status">Loading audit history…</p> : <>{rows.map(entry => <article className="settings-history-row" key={entry.id}><strong>{entry.setting_key}</strong><span>{String(entry.old_value ?? 'Default')} → {String(entry.new_value ?? 'Credential updated')}</span><small>{entry.created_at} · {entry.user_id} · {entry.ip_address}</small></article>)}{!rows.length && <p className="settings-empty">{filter ? 'No matching activity.' : 'No settings changes recorded.'}</p>}</>}
  </SettingsSection>
}
