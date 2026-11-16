import { securityFetch as fetch } from '../services/securityFetch.js'
import { useEffect, useRef, useState } from 'react'
import { Check, CheckCircle2, Info, LoaderCircle, Mail, RotateCw, Search, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import SettingsPermissions from './SettingsPermissions'
import { categoryDescriptions, categoryLabels, categorySections, sectionIcon, fieldDescription, settingIsVisible, storageFieldIsVisible } from './settingsPresentation'
import { ModuleAccessDeniedPage, ModuleNotFoundPage } from './RouteStatusPages'
import { ROUTES } from '../routeRegistry'
import { normalizePublicError } from '../services/publicError'
import './AdminSettings.css'

const sources = { database: 'Saved', 'secret-manager': 'Secure storage', environment: 'Managed by environment' }
const storageLabels = { azure: 'Microsoft Azure Blob Storage', backblaze: 'Backblaze B2', local: 'Local storage' }
const azureAuthenticationLabels = { 'connection-string': 'Connection string', 'managed-identity': 'Managed identity', ...storageLabels }
async function request(path, options = {}, { connectionTest = false } = {}) {
  const response = await fetch(`/api/admin/settings${path}`, {
    credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options,
  })
  const raw = await response.text()
  let body = null
  if (raw.trim()) { try { body = JSON.parse(raw) } catch { /* Report invalid responses below. */ } }
  if (connectionTest && body?.databaseConnectionTest) return body.databaseConnectionTest
  if (!response.ok) throw new Error(normalizePublicError({ status: response.status, body }, 'unknown').message)
  if (!body) throw new Error('The server returned an empty response.')
  return body
}

function useUnsavedSettingsWarning(enabled) {
  useEffect(() => {
    if (!enabled) return
    const original = window.history.state?.idx
    const pathname = window.location.pathname
    let restoring = false
    let approvedTraversal
    const confirmLeave = () => window.confirm('Discard unsaved settings and leave this page?')
    const unload = event => { event.preventDefault(); event.returnValue = '' }
    const navigate = event => {
      if (!event.cancelable || !event.destination.sameDocument) return
      if (new URL(event.destination.url).pathname === pathname) return
      if (!confirmLeave()) event.preventDefault()
      else if (event.navigationType === 'traverse') approvedTraversal = event.destination.url
    }
    const pop = event => {
      if (restoring) {
        restoring = false
        event.stopImmediatePropagation()
        return
      }
      if (approvedTraversal === window.location.href) {
        approvedTraversal = undefined
        return
      }
      if (window.location.pathname === pathname || !Number.isInteger(original) || !Number.isInteger(event.state?.idx)) return
      const delta = original - event.state.idx
      if (!delta || confirmLeave()) return
      event.stopImmediatePropagation()
      restoring = true
      window.history.go(delta)
    }
    const click = event => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const link = event.target.closest?.('a[href]')
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return
      const url = new URL(link.href)
      if (url.origin === window.location.origin && url.pathname !== pathname && !confirmLeave()) event.preventDefault()
    }
    window.addEventListener('beforeunload', unload)
    window.addEventListener('popstate', pop, true)
    if (window.navigation) window.navigation.addEventListener('navigate', navigate)
    else document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', unload)
      window.removeEventListener('popstate', pop, true)
      window.navigation?.removeEventListener('navigate', navigate)
      document.removeEventListener('click', click, true)
    }
  }, [enabled])
}

export default function AdminSettings({ category = 'general', settings, settingsLoading, setSettings, onSaved }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [patch, setPatch] = useState({})
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const templateOpen = category === 'email' && searchParams.get('config') === 'email-templates'
  const showTemplate = open => {
    const params = new URLSearchParams(searchParams)
    if (open) params.set('config', 'email-templates')
    else params.delete('config')
    setSearchParams(params, { replace: true })
  }
  const [connectionState, setConnectionState] = useState('idle')
  const [databaseTests, setDatabaseTests] = useState({})
  const [testingDatabase, setTestingDatabase] = useState(null)
  const effectiveSettingsValues = { ...settings?.dependencyValues, ...settings?.values, ...patch }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null && Object.hasOwn(settings?.metadata?.[key] || {}, 'resetValue')) effectiveSettingsValues[key] = settings.metadata[key].resetValue
  }
  if (patch['storage.configuredProvider'] === null) effectiveSettingsValues['storage.configuredProvider'] = settings?.values?.['storage.provider']
  const fieldVisible = (key, definition) => key !== 'storage.provider'
    && !(['host', 'port', 'name', 'username', 'password', 'connectionMode', 'ssl', 'sslMode'].includes(key.split('.')[1])
      && settings?.databaseRuntime?.[key.split('.')[0]]?.usesConnectionUrl)
    && ((key.startsWith('storage.') ? storageFieldIsVisible(key, effectiveSettingsValues) : undefined)
      ?? settingIsVisible(definition.editVisibleWhen || definition.visibleWhen, effectiveSettingsValues))
  const visiblePatch = Object.fromEntries(Object.entries(patch).filter(([key]) =>
    settings?.metadata?.[key] && fieldVisible(key, settings.metadata[key])))
  const dirty = Object.keys(visiblePatch).length > 0
  const can = permission => settings?.permissions?.includes(permission)
  const tabs = [...(settings?.categories || []), 'status', ...(can('settings.audit.view') ? ['history'] : [])]
  const activeTab = category
  const writable = (key, definition) => can('settings.edit') && (!definition.secret || can('settings.secrets.edit'))
    && (!['database', 'portalDatabase'].includes(key.split('.')[0]) || can('settings.database.edit'))
    && (!['storage', 'google'].includes(key.split('.')[0]) || can('settings.storage.edit'))
    && (!['security', 'authentication'].includes(key.split('.')[0]) || can('settings.security.edit'))

  useEffect(() => {
    setPatch({})
    setMessage(null)
    setConnectionState('idle')
  }, [activeTab])
  useUnsavedSettingsWarning(dirty || busy)
  useEffect(() => {
    if (!['history', 'status'].includes(activeTab)) return
    let active = true
    const controller = new AbortController()
    setLoading(true)
    request(`/${activeTab}`, { signal: controller.signal })
      .then(body => { if (active) (activeTab === 'history' ? setHistory : setStatus)(body) })
      .catch(error => { if (active && error?.name !== 'AbortError') setMessage({ error: true, text: error.message }) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort('settings-view-changed') }
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
  const change = (key, value) => {
    setMessage(null)
    setPatch(previous => {
      const next = { ...previous }
      if ((value !== null && value === settings.values[key]) || (settings.metadata[key]?.secret && value === '')) delete next[key]
      else next[key] = value
      return next
    })
  }
  const undo = key => { setConnectionState('idle'); setPatch(previous => { const next = { ...previous }; delete next[key]; return next }) }
  const save = event => {
    event.preventDefault()
    if (!dirty || busy) return
    run(async () => {
      const body = await request(`/${activeTab}`, { method: 'PUT', body: JSON.stringify({ values: visiblePatch }) })
      setSettings(body); setPatch({}); setConnectionState('idle')
      setMessage({ type: 'success', text: 'Your settings have been saved.' })
      onSaved?.('Changes saved')
      window.dispatchEvent(new Event('configuration-changed'))
    })
  }

  const globalQuery = globalSearch.trim().toLowerCase()
  const categoryKeywords = { email: 'smtp sender mail password delivery templates acknowledgement', database: 'postgresql connection database pool ssl tls health', portalDatabase: 'postgresql portal database connection resident', google: 'oauth sign-in credentials', storage: 'bucket upload storage files media', authentication: 'login registration password session verification', security: 'captcha security headers rate limiting permissions', notifications: 'email alerts system notifications', integrations: 'connected services api webhooks', general: 'application facebook branding regional preferences', features: 'feature flags uploads reports', publicData: 'public datasets catalog', maintenance: 'maintenance mode', legal: 'privacy terms cookies', advanced: 'diagnostics' }
  const globalMatches = tabs.filter(key => {
    if (!globalQuery) return true
    if (['status', 'history'].includes(key)) return (categoryLabels[key] || key).toLowerCase().includes(globalQuery)
    const categoryFields = Object.entries(settings?.metadata || {}).filter(([fieldKey]) => fieldKey.startsWith(`${key}.`))
    return `${categoryLabels[key] || key} ${categoryKeywords[key] || ''} ${categoryFields.map(([fieldKey, definition]) => `${fieldKey} ${definition.label} ${fieldDescription(fieldKey, definition)}`).join(' ')}`.toLowerCase().includes(globalQuery)
  })
  if (!settings) return <section className="settings-panel" aria-label="Loading settings" aria-busy="true"><div className="settings-skeleton" /><div className="settings-skeleton" /><div className="settings-skeleton tall" /></section>
  if (activeTab === 'history' && !can('settings.audit.view')) return <ModuleAccessDeniedPage />
  if (!tabs.includes(activeTab)) return <ModuleNotFoundPage home={ROUTES.admin.setting('general')} />
  const allFields = Object.entries(settings.metadata || {}).filter(([key]) => key.startsWith(`${activeTab}.`))
  const fields = allFields.filter(([key, definition]) => fieldVisible(key, definition))
  const smsConfigured = Object.hasOwn(patch, 'authentication.smsApiKey')
    ? Boolean(patch['authentication.smsApiKey']?.trim())
    : settings.metadata['authentication.smsApiKey']?.configured
  const categoryReady = allFields.some(([key]) => Object.hasOwn(settings.values || {}, key))
  const sections = categorySections(activeTab, fields)
  const filteredSections = sections
  const storageSchemaOutdated = activeTab === 'storage' && !settingsLoading
    && !settings.metadata?.['storage.configuredProvider']?.options?.includes('azure')
  const storageUpdateNotice = storageSchemaOutdated && <p className="settings-notice" role="status">
    Azure setup requires the updated portal backend. Restart the backend and reopen Storage settings.
  </p>
  const databaseTab = ['database', 'portalDatabase'].includes(activeTab)
  const databaseTest = databaseTests[activeTab]
  const runDatabaseTest = async target => {
    const category = activeTab
    setTestingDatabase(target)
    setDatabaseTests(previous => ({ ...previous, [category]: null }))
    try {
      const result = await request(`/test/${category}`, {
        method: 'POST', body: JSON.stringify({ target }),
      }, { connectionTest: true })
      setDatabaseTests(previous => ({ ...previous, [category]: result }))
    } catch (failure) {
      setDatabaseTests(previous => ({ ...previous, [category]: { message: failure.message, connection: { target } } }))
    } finally {
      setTestingDatabase(null)
    }
  }
  const testable = ['storage', 'email'].includes(activeTab)
    && can('settings.edit') && fields.every(([key, definition]) => definition.secret || writable(key, definition))
    && (activeTab !== 'email' || effectiveSettingsValues['email.enabled'] === true)
    && (activeTab !== 'storage' || ['backblaze', 'local'].includes(effectiveSettingsValues['storage.configuredProvider']))
  const testLabel = activeTab === 'storage'
    ? (effectiveSettingsValues['storage.configuredProvider'] === 'local' ? 'Test local storage' : 'Test Backblaze B2 connection')
    : 'Test connection'

  const testConnection = async form => {
    if (!form.reportValidity()) return
    setConnectionState('testing')
    await run(async () => {
      await request(`/test/${activeTab}`, { method: 'POST', body: JSON.stringify({ values: visiblePatch }) })
      setConnectionState('connected')
    }, error => { setConnectionState('failed'); return { type: 'connection-error', text: `Connection test failed: ${error.message}` } })
  }

  const connectionAction = testable && <div className="settings-test-action"><button className="settings-button secondary" type="button" disabled={busy} onClick={event => testConnection(event.currentTarget.form)}><RotateCw size={14} aria-hidden="true" /> {connectionState === 'testing' ? 'Testing…' : testLabel}</button>{connectionState === 'connected' && <span className="settings-connection-state is-connected" role="status">Connected</span>}{connectionState === 'failed' && <span className="settings-connection-state is-failed" role="status">Failed</span>}</div>

  const categoryContent = <div className="settings-content" id={`settings-panel-${activeTab}`} aria-labelledby="settings-category-title">
    <header className="settings-category-heading">
      <div><h2 id="settings-category-title">{categoryLabels[activeTab]}</h2><p>{categoryDescriptions[activeTab]}</p></div>
      {activeTab === 'email' && <button type="button" className="settings-button secondary" disabled={busy} onClick={() => showTemplate(true)}><Mail size={15} aria-hidden="true" /> Email templates</button>}
    </header>
    {message && <div className={`settings-message ${message.error ? 'is-error' : ''} ${message.type ? `is-${message.type}` : ''}`} role={message.error ? 'alert' : 'status'} aria-live={message.error ? 'assertive' : 'polite'}>
      <span className="settings-message-icon">{message.error ? <Info size={18} /> : message.type === 'success' ? <CheckCircle2 size={19} /> : <Info size={18} />}</span><span className="settings-message-copy"><strong>{message.error ? message.type === 'connection-error' ? 'Connection test failed' : 'Unable to save changes' : message.type === 'success' ? 'Changes saved' : 'Configuration priority'}</strong><span>{message.text}</span></span>
      <button type="button" aria-label="Dismiss message" onClick={() => setMessage(null)} data-icon-button="ghost"><X size={14} /></button>
    </div>}
    {activeTab === 'status' ? <SettingsSection title="System status" description="Service health and the latest connection checks." icon={sectionIcon('status')}>
      {loading ? <p className="settings-empty" role="status">Loading service status…</p> : <div className="settings-status">{Object.entries(status).map(([name, service]) =>
        <article key={name}><div><h3>{categoryLabels[name] || name}</h3><p>{service.latencyMs !== undefined && `${service.latencyMs} ms · `}{service.checkedAt ? new Date(service.checkedAt).toLocaleString() : 'Not checked'}</p></div><StatusBadge>{service.status || 'Not checked'}</StatusBadge></article>,
      )}</div>}
    </SettingsSection> : activeTab === 'history' ? <AuditHistory history={history} loading={loading} /> : <>
      {settingsLoading || !categoryReady ? <p role="status">{settingsLoading ? "Loading settings…" : "Settings could not be loaded. Reload this page to try again."}</p> :
      <form id={`cms-settings-form-${activeTab}`} onSubmit={save}>
        {activeTab === 'google' && <p className="settings-notice" role="status">Google OAuth is <strong>not verified</strong> until a fresh sign-in completes Google’s callback, token exchange, verified account lookup, and session creation. Confirm the client ID, secret, and exact callback URI together in Google Cloud Console.</p>}
        {storageUpdateNotice}
        {activeTab === 'storage' && <StorageProviderStatus settings={settings} selected={effectiveSettingsValues['storage.configuredProvider']} />}
        {activeTab === 'storage' && can('settings.storage.edit') && <MediaMigrationPanel canStart={can('settings.edit')} disabled={busy || dirty} onActivated={() => setSettings(current => ({ ...current, storageRuntime: { activeProvider: 'azure', source: 'migration' } }))} />}
        {databaseTab && <DatabaseRuntimeStatus runtime={settings?.databaseRuntime?.[activeTab]} category={activeTab} />}
        {filteredSections.map(section => <SettingsSection key={section.title} title={section.title} description={section.description} icon={section.icon}>
          <div className="settings-fields">{section.fields.map(([key, definition]) => <SettingsField key={key} settingKey={key} definition={definition}
            diagnostic={databaseTest?.connection?.target === 'active' && key === `${activeTab}.${databaseTest.field}` ? databaseTest.message : null}
            value={Object.hasOwn(patch, key) && patch[key] !== null ? patch[key] : settings.values[key]}
            secretValue={patch[key] || ''} reset={Object.hasOwn(patch, key) && patch[key] === null}
            edited={Object.hasOwn(patch, key)} disabled={busy || definition.managedByEnvironment || !writable(key, definition) ||
              (key === 'authentication.requireMobileVerification' && !smsConfigured && !effectiveSettingsValues[key])} canEdit={writable(key, definition)}
            onChange={value => { setConnectionState('idle'); change(key, value) }} onUndo={() => undo(key)} />)}</div>
          {section.fields.some(([key, definition]) => key === 'storage.azureAccount' && writable(key, definition)) &&
            <AzureConnectionTest busy={busy} patch={visiblePatch} />}
          {section.fields.some(([key]) => key === 'storage.configuredProvider') && connectionAction}
        </SettingsSection>)}
        {!filteredSections.length && <p className="settings-empty">{fields.length ? 'No matching settings in this category.' : 'No settings are available in this category.'}</p>}
        {activeTab !== 'storage' && connectionAction}
        {databaseTab && can('settings.edit') && can('settings.database.edit') && <SettingsSection title="Database connection checks" icon={sectionIcon(activeTab)}>
          <p className="settings-help">The active check uses the running backend connection settings. The server connection URL controls which Supabase database is tested.</p>
          <div className="settings-test-action">
            <button type="button" className="settings-button secondary" disabled={busy || Boolean(testingDatabase)}
              onClick={() => runDatabaseTest('active')}>{testingDatabase ? 'Testing.' : 'Test active database'}</button>
          </div>
          {databaseTest && <DatabaseConnectionResult result={databaseTest} />}
        </SettingsSection>}
        <div className="settings-page-actions">
          <span aria-live="polite">{dirty ? 'You have unsaved changes.' : ''}</span>
          <button className="settings-button secondary" type="button" disabled={!Object.keys(patch).length || busy} onClick={() => { setPatch({}); setMessage(null); setConnectionState('idle') }}>Discard changes</button>
          <button className="settings-button primary" type="submit" disabled={!dirty || busy}>
            {busy && connectionState !== 'testing' ? <LoaderCircle className="settings-spinner" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
            {busy && connectionState !== 'testing' ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>}
    </>}
  </div>
  return <section className="settings-panel">
    <header className="settings-heading">
      <div><h1>Settings</h1><p>Manage system configuration and integrations.</p></div>
      <label className="settings-search settings-global-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Search settings" placeholder="Search settings..." value={globalSearch} onChange={event => setGlobalSearch(event.target.value)} /></label>
    </header>
    <div className="settings-page-grid">
      <div className="settings-category-navigation">
        <nav aria-label="Settings categories">
          {globalMatches.map(key => {
            const Icon = sectionIcon(key)
            return <Link key={key} to={ROUTES.admin.setting(key)} aria-current={key === activeTab ? 'page' : undefined}>
              <Icon size={16} aria-hidden="true" />{categoryLabels[key]}
            </Link>
          })}
        </nav>
        <div className="settings-category-picker">
          <label htmlFor="settings-category-select">Settings category</label>
          <select id="settings-category-select" value={globalMatches.includes(activeTab) ? activeTab : ''} onChange={event => {
            if (!window.navigation && (dirty || busy) && !window.confirm('Discard unsaved settings and leave this page?')) return
            navigate(ROUTES.admin.setting(event.target.value))
          }}>
            {!globalMatches.includes(activeTab) && <option value="" disabled>Choose a category</option>}
            {globalMatches.map(key => <option key={key} value={key}>{categoryLabels[key]}</option>)}
          </select>
        </div>
        {!globalMatches.length && <p role="status">No matching categories.</p>}
      </div>
      {categoryContent}
    </div>
    {templateOpen && <EmailTemplateModal onClose={() => showTemplate(false)} />}
  </section>
}

function EmailTemplateModal({ onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector('button')?.focus()
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key !== 'Tab') return
      const buttons = dialog.current?.querySelectorAll('button:not(:disabled)')
      if (!buttons?.length) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus?.() }
  }, [onClose])
  return <div className="settings-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="settings-modal settings-template-modal" role="dialog" aria-modal="true" aria-labelledby="email-template-title" aria-describedby="email-template-description" ref={dialog}>
      <header className="settings-modal-header"><span className="settings-section-icon"><Mail size={18} aria-hidden="true" /></span><div><h2 id="email-template-title">Email templates</h2><p id="email-template-description">Preview the automated contact acknowledgement email.</p></div><button type="button" className="settings-modal-close" aria-label="Close email templates" onClick={onClose} data-icon-button="ghost"><X size={19} strokeWidth={1.8} /></button></header>
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

function SettingSourceBadge({ source }) {
  return <span className="settings-source-badge">{source}</span>
}

function StorageProviderStatus({ settings, selected }) {
  const runtime = settings.storageRuntime
  const configured = settings.values['storage.configuredProvider']
  const active = storageLabels[runtime?.activeProvider]
  const saved = storageLabels[configured]
  return <section className="storage-provider-status" aria-label="Storage provider status">
    <dl>
      <div><dt>Configured provider</dt><dd>{saved || 'Unknown'}</dd></div>
      <div><dt>Active provider</dt><dd>{active || 'Unavailable'}</dd></div>
      <div><dt>Activation source</dt><dd>{runtime?.environmentVariable ? <code>{runtime.environmentVariable}</code> : runtime?.source === 'migration' ? 'Verified Azure migration' : runtime?.source === 'database' ? 'Saved server setting' : runtime?.source === 'default' ? 'Server default' : 'Server configuration'}</dd></div>
    </dl>
    {saved && active && configured !== runtime.activeProvider && <p>{saved} is saved. {active} is still active{runtime.environmentVariable && <> because <code>{runtime.environmentVariable}</code> is set on the server</>}. Change the server provider after verifying the migration, then restart the backend.</p>}
    {selected && selected !== configured && <p>Saving applies the {storageLabels[selected]} setup. Testing and saving do not switch the active provider.</p>}
  </section>
}

function MediaMigrationPanel({ canStart, disabled, onActivated }) {
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [recheck, setRecheck] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => request('/media-migration', { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return
        setSnapshot(result)
        setError('')
      })
      .catch(() => { if (!controller.signal.aborted) setError('Migration status could not be loaded. Check the backend and PostgreSQL migration 047.') })
    refresh()
    const timer = snapshot?.job?.status === 'running' ? setInterval(refresh, 5000) : null
    return () => { controller.abort(); clearInterval(timer) }
  }, [recheck, snapshot?.job?.status])
  const job = snapshot?.job
  const totals = job?.totals || {}
  const locked = disabled || pending || job?.status === 'running'
  const act = async action => {
    if (action === 'cutover' && !window.confirm('Pause portal uploads and run final verification? If another app writes directly to Backblaze, pause it before continuing.')) return
    if (action === 'activate' && !window.confirm('Check the private container and activate Azure for verified media? Uploads remain paused until you accept the cutover.')) return
    if (action === 'accept' && !window.confirm('Accept this cutover and resume uploads on Azure after checking existing public and restricted media?')) return
    setPending(true)
    setError('')
    try {
      await request('/media-migration', { method: 'POST', body: JSON.stringify({ action, confirmed: ['cutover', 'activate', 'accept'].includes(action) }) })
      if (action === 'activate') onActivated()
      setRecheck(value => value + 1)
    } catch (failure) { setError(failure.message) }
    finally { setPending(false) }
  }
  return <section className="storage-provider-status" aria-label="Migrate media to Azure">
    <h3>Migrate media to Azure</h3>
    {error && <p role="alert">{error} <button type="button" onClick={() => setRecheck(value => value + 1)}>Retry status</button></p>}
    {!snapshot && !error && <p role="status">Loading migration status…</p>}
    {snapshot && <>
      <dl>
        <div><dt>Source bucket</dt><dd>{snapshot.sourceBucket || 'Unavailable'}</dd></div>
        <div><dt>Private target</dt><dd>{snapshot.target}</dd></div>
        <div><dt>Active provider</dt><dd>{storageLabels[snapshot.activeProvider] || 'Unavailable'}</dd></div>
      </dl>
      {job && <>
        <p role="status"><strong>{job.status === 'restart_required' ? 'Ready to activate' : job.status.replaceAll('_', ' ')}</strong>{job.status !== 'restart_required' && <> · {job.stage}</>}</p>
        {job.error && <p role="alert">{job.error}</p>}
        <dl>
          {[['Discovered', 'sourceFiles', 'sourceBytes'], ['Copied', 'copied', 'copiedBytes'], ['Verified', 'verified', 'verifiedBytes'], ['Unresolved files', 'unresolvedFiles', 'unresolvedBytes']].map(([label, count, bytes]) =>
            <div key={label}><dt>{label}</dt><dd>{Number(totals[count] || 0).toLocaleString()} files · {Number(totals[bytes] || 0).toLocaleString()} bytes</dd></div>)}
          <div><dt>Unresolved references</dt><dd>{totals.unresolvedReferences ?? 'Pending audit'}</dd></div>
        </dl>
        {totals.referenceFindings?.length > 0 && <ul>{totals.referenceFindings.map((item, index) =>
          <li key={index}>{item.table}.{item.column} · {item.count} · {item.reason}</li>)}</ul>}
        {job.status === 'ready' && <p>Switch to Azure pauses portal uploads and waits for outstanding upload links before final verification. Public media remains available.</p>}
        {job.status === 'restart_required' && <p>Final verification passed. Activate Azure to run the connection checks and switch the portal. Uploads stay paused until you accept the cutover.</p>}
        {job.status === 'active' && <p>Check the Media Library, public images, and restricted downloads. Accept the cutover to resume uploads on Azure.</p>}
        {job.status === 'accepted' && <p>Cutover accepted. Keep the original bucket available until the rollback window ends.</p>}
      </>}
      {canStart && <div className="settings-test-action">
        {snapshot.activeProvider === 'backblaze' && job?.status !== 'restart_required' && <>
          <button type="button" className="settings-button secondary" disabled={locked} onClick={() => act('inventory')}>Run inventory</button>
          <button type="button" className="settings-button secondary" disabled={locked} onClick={() => act('copy')}>{['blocked', 'interrupted'].includes(job?.status) ? 'Resume migration' : 'Start migration'}</button>
          <button type="button" className="settings-button primary" disabled={locked || job?.status !== 'ready'} onClick={() => act('cutover')}>Switch to Azure</button>
        </>}
        {job?.status === 'restart_required' && <button type="button" className="settings-button primary" disabled={locked} onClick={() => act('activate')}>{pending ? 'Checking Azure…' : 'Activate Azure'}</button>}
        {job?.status === 'active' && <button type="button" className="settings-button primary" disabled={locked} onClick={() => act('accept')}>Accept cutover</button>}
      </div>}
    </>}
  </section>
}

function DatabaseRuntimeStatus({ runtime, category }) {
  if (!runtime) return null
  const name = category === 'database' ? 'CMS' : 'Resident portal'
  const endpoint = runtime.connection
  return <section className="storage-provider-status" aria-label={`${name} database connection`}>
    <h3>{name} database connection</h3>
    <dl>
      <div><dt>Active provider</dt><dd>{runtime.provider === 'supabase' ? 'Supabase PostgreSQL' : 'Unavailable'}</dd></div>
      <div><dt>Host</dt><dd>{endpoint?.host || 'Unavailable'}</dd></div>
      <div><dt>Port</dt><dd>{endpoint?.port || 'Unavailable'}</dd></div>
      <div><dt>Database</dt><dd>{endpoint?.database || 'Unavailable'}</dd></div>
      <div><dt>Username</dt><dd>{endpoint?.username || 'Unavailable'}</dd></div>
    </dl>
    {runtime.degraded && <p role="status">The configured database connection is degraded.</p>}
    {runtime.usesConnectionUrl && <p>{runtime.environmentVariable
      ? <>Connection details are managed by <code>{runtime.environmentVariable}</code>.</>
      : 'Connection details come from the saved Supabase connection.'}</p>}
  </section>
}

function AzureConnectionTest({ busy, patch }) {
  const [result, setResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const unsaved = Object.keys(patch).some(key => key.startsWith('storage.azure'))
  const test = async (createMissingContainer = false) => {
    setTesting(true)
    setResult(null)
    try {
      setResult(await request('/test/azure-storage', { method: 'POST', body: JSON.stringify({ createMissingContainer }) }))
    } catch (error) {
      setResult({ error: error.message || 'Could not run the Azure test. Check storage settings permissions or try again.' })
    } finally {
      setTesting(false)
    }
  }
  return <div>
    <div className="settings-test-action">
      <button type="button" className="settings-button secondary" disabled={busy || testing || unsaved} onClick={() => test()}>
        <RotateCw size={14} aria-hidden="true" /> {testing ? 'Testing Azure connection…' : 'Test Azure connection'}
      </button>
      {unsaved && <span>Save Azure settings before testing.</span>}
    </div>
    {result && !unsaved && <div role={result.error ? 'alert' : 'status'}>
      {result.operations && <ul>
        <li>Write {result.operations.write}</li>
        <li>Read {result.operations.read}</li>
        <li>Delete {result.operations.delete}</li>
      </ul>}
      {result.error && <p>{result.error}</p>}
      {result.missingContainer && <button type="button" className="settings-button secondary" disabled={busy || testing} onClick={() => test(true)}>
        Create private container and test
      </button>}
    </div>}
  </div>
}

function SettingsSection({ icon: Icon, title, description, children }) {
  return <section className="settings-section">
    <header className="settings-section-heading">
      {Icon && <span className="settings-section-icon"><Icon size={17} strokeWidth={1.7} aria-hidden="true" /></span>}
      <div><h3>{title}</h3>{description && <p>{description}</p>}</div>
    </header>
    {children}
  </section>
}
function StatusBadge({ children }) { return <span className="settings-badge">{children}</span> }

function DatabaseConnectionResult({ result }) {
  const { connection } = result
  const environmentFields = Object.entries(connection.fieldSources || {}).filter(([, source]) => source.variable)
  return <div className="settings-help" role={result.ok ? 'status' : 'alert'}>
    <p><strong>Active Supabase database:</strong> {result.message}</p>
    {connection.host && <p>Host <code>{connection.host}</code> · Port <code>{connection.port}</code> · Database <code>{connection.database || 'Unavailable'}</code></p>}
    {connection.variable ? <p>Managed by <code>{connection.variable}</code>. Change it in the backend environment and restart the backend.</p>
      : connection.saved ? <p>Uses the connection saved in Database migration settings.</p>
      : connection.fromSetupForm ? <p>Uses the credentials entered in Connect Supabase.</p>
      : connection.fieldSources && <p>Configuration: {['host', 'port', 'name'].map(field => {
        const entry = connection.fieldSources[field]
        return `${field === 'name' ? 'database' : field} (${entry.variable || sources[entry.source] || 'default'})`
      }).join(', ')}.{environmentFields.length > 0 && <> Change environment-managed values in the backend environment and restart the backend.</>}</p>}
    {result.configurationVariable && result.configurationVariable !== connection.variable && <p>Affected setting is managed by <code>{result.configurationVariable}</code>.</p>}
    {result.ok && <p>This check only verifies connectivity. Migration readiness is checked separately.</p>}
    {result.requestId && <p>Request ID <code>{result.requestId}</code></p>}
  </div>
}

function SettingsField({ settingKey: key, definition, value, secretValue, reset, edited, disabled, canEdit, onChange, onUndo, diagnostic }) {
  const row = definition.type === 'boolean' || definition.type === 'number' || Boolean(definition.options)
  const description = fieldDescription(key, definition)
  const inputProps = { id: key, disabled: disabled || reset, 'aria-describedby': [description && `${key}-help`, diagnostic && `${key}-diagnostic`].filter(Boolean).join(' ') || undefined }
  const badge = definition.managedByEnvironment ? 'Managed by environment' : reset ? 'Reset pending' : edited ? 'Edited'
    : definition.secret ? (definition.configured ? 'Configured' : 'Not configured')
      : sources[definition.source]
  const control = definition.type === 'boolean' ? <label className="settings-toggle">
    <input {...inputProps} type="checkbox" role="switch" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} /><span aria-hidden="true" />
  </label> : definition.options ? <select {...inputProps} value={value ?? ''} onChange={event => onChange(event.target.value)}>{definition.options.map(option => <option key={option} value={option}>{azureAuthenticationLabels[option] || (option === 'google' || option === 'google-standard' ? 'Google reCAPTCHA (standard)' : option === 'google-enterprise' ? 'Google reCAPTCHA Enterprise' : option === 'starttls' ? 'STARTTLS' : option === 'tls' ? 'TLS' : option === 'backblaze' ? 'Backblaze B2' : option === 'embed' ? 'Embed Facebook Page Plugin' : option === 'fallback' ? 'Use native Getafe fallback card' : option)}</option>)}</select>
    : key === 'security.permissionGrants' ? <div className="settings-permissions" role="group" aria-labelledby={`${key}-label`}><SettingsPermissions disabled={disabled || reset} value={value} onChange={onChange} /></div>
      : key === 'storage.azureConnectionString' ? <input {...inputProps} type="password" autoComplete="new-password" value={secretValue} onChange={event => onChange(event.target.value)} />
      : definition.secret ? <SecretInput inputProps={inputProps} value={secretValue} configured={definition.configured} onChange={onChange} />
        : definition.multiline ? <textarea {...inputProps} rows={key.startsWith('contact.') ? 3 : 8} required={definition.required} value={value ?? ''} onChange={event => onChange(event.target.value)} />
          : <input {...inputProps} autoComplete="off" type={definition.type === 'number' ? 'number' : definition.format === 'email' ? 'email' : 'text'} min={definition.min} max={definition.max} required={definition.required} value={value ?? ''} onChange={event => onChange(definition.type === 'number' ? Number(event.target.value) : event.target.value)} />
  return <div className={`settings-field${row ? ' settings-row' : ''}${definition.multiline || key === 'security.permissionGrants' ? ' settings-field-wide' : ''}`}>
    <div className="settings-field-copy"><div className="settings-field-label"><label id={`${key}-label`} htmlFor={key}>{definition.label}{definition.required && <span aria-hidden="true"> *</span>}</label><div className="settings-field-badges">
      {badge && <StatusBadge>{badge}</StatusBadge>}
      {definition.requiresRestart && <StatusBadge>Restart required</StatusBadge>}
    </div></div>{definition.managedByEnvironment
      ? <p id={`${key}-help`} className="settings-field-help">Controlled by <code>{definition.environmentVariable || 'deployment environment'}</code>. Change it in the deployment environment and restart the backend.</p>
      : description && <p id={`${key}-help`} className="settings-field-help">{description}{definition.environmentVariable && definition.source === 'environment' ? <> Source: <code>{definition.environmentVariable}</code>.</> : null}</p>}</div>
    <div className="settings-field-control">{control}{diagnostic && <p className="settings-field-help" id={`${key}-diagnostic`}>{diagnostic}</p>}</div>
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
    {loading ? <p className="settings-empty" role="status">Loading audit history…</p> : <>{rows.map(entry => <article className="settings-history-row" key={entry.id}><strong>{entry.setting_key}</strong><span>{String(entry.old_value ?? 'Default')} → {String(entry.new_value ?? 'Credential updated')}</span><small>{entry.created_at} · {entry.employee_label || 'System'} · {entry.ip_address}</small></article>)}{!rows.length && <p className="settings-empty">{filter ? 'No matching activity.' : 'No settings changes recorded.'}</p>}</>}
  </SettingsSection>
}
