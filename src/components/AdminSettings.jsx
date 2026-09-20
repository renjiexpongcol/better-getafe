import { useEffect, useRef, useState } from 'react'
import { Check, Info, LoaderCircle, RotateCw, Search, X } from 'lucide-react'
import SettingsPermissions from './SettingsPermissions'
import { categoryLabels, categorySections, sectionIcon, fieldDescription } from './settingsPresentation'
import './AdminSettings.css'

const sources = { database: 'Saved', 'secret-manager': 'Secure storage', environment: 'Environment', default: 'Default' }
async function request(path, options = {}) {
  const response = await fetch(`/api/admin/settings${path}`, {
    credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options,
  })
  const raw = await response.text()
  let body = null
  if (raw.trim()) { try { body = JSON.parse(raw) } catch { /* Report invalid responses below. */ } }
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status}).`)
  if (!body) throw new Error('The server returned an empty response.')
  return body
}

export default function AdminSettings({ settings, setSettings, onSaved }) {
  const [patch, setPatch] = useState({})
  const [tab, setTab] = useState('general')
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const dirty = Object.keys(patch).length > 0
  const can = permission => settings?.permissions?.includes(permission)
  const tabs = [...(settings?.categories || []), 'status', ...(can('settings.audit.view') ? ['history'] : [])]
  const activeTab = tabs.includes(tab) ? tab : tabs[0]
  const writable = (key, definition) => can('settings.edit') && (!definition.secret || can('settings.secrets.edit'))
    && (!['database', 'portalDatabase'].includes(key.split('.')[0]) || can('settings.database.edit'))
    && (!['storage', 'google'].includes(key.split('.')[0]) || can('settings.storage.edit'))
    && (!['security', 'authentication'].includes(key.split('.')[0]) || can('settings.security.edit'))

  useEffect(() => {
    if (!dirty) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => {
    if (!['history', 'status'].includes(activeTab)) return
    let active = true
    setLoading(true)
    request(`/${activeTab}`)
      .then(body => { if (active) (activeTab === 'history' ? setHistory : setStatus)(body) })
      .catch(error => { if (active) setMessage({ error: true, text: error.message }) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [activeTab])
  useEffect(() => {
    if (!message || message.error) return
    const timer = window.setTimeout(() => setMessage(null), 5000)
    return () => window.clearTimeout(timer)
  }, [message])

  const run = async operation => {
    setBusy(true); setMessage(null)
    try { await operation() } catch (error) { setMessage({ error: true, text: error.message }) }
    finally { setBusy(false) }
  }
  const selectTab = next => {
    if (next === activeTab || busy) return
    if (dirty && !window.confirm('You have unsaved changes. Discard them and leave this section?')) return
    setPatch({}); setTab(next); setSearch(''); setMessage(null)
  }
  const change = (key, value) => setPatch(previous => {
    const next = { ...previous }
    if ((value !== null && value === settings.values[key]) || (settings.metadata[key]?.secret && value === '')) delete next[key]
    else next[key] = value
    return next
  })
  const undo = key => setPatch(previous => { const next = { ...previous }; delete next[key]; return next })
  const save = event => {
    event.preventDefault()
    if (!dirty || busy) return
    run(async () => {
      const body = await request('', { method: 'PUT', body: JSON.stringify({ values: patch }) })
      setSettings(body); setPatch({}); setMessage({ text: 'Changes saved' })
      onSaved?.('Changes saved')
      window.dispatchEvent(new Event('configuration-changed'))
    })
  }

  if (!settings) return <section className="settings-panel" aria-label="Loading settings" aria-busy="true"><div className="settings-skeleton" /><div className="settings-skeleton" /><div className="settings-skeleton tall" /></section>
  const fields = Object.entries(settings.metadata || {}).filter(([key]) => key.startsWith(`${activeTab}.`))
  const sections = categorySections(activeTab, fields)
  const query = search.trim().toLowerCase()
  const filteredSections = sections.map(section => ({ ...section, fields: section.fields.filter(([key, definition]) =>
    `${section.title} ${key} ${definition.label} ${fieldDescription(key, definition)}`.toLowerCase().includes(query),
  ) })).filter(section => section.fields.length)
  const testable = ['database', 'portalDatabase', 'storage', 'email'].includes(activeTab)
    && can('settings.edit') && fields.every(([key, definition]) => definition.secret || writable(key, definition))

  return <section className="settings-panel">
    <header className="settings-heading">
      <div><h1>Settings</h1><p>Manage system configuration and integrations.</p></div>
      <button className="settings-button secondary" type="button" disabled={busy || dirty} onClick={() => run(async () => {
        setSettings(await request('')); setMessage({ text: 'Configuration refreshed' })
      })}><RotateCw size={14} aria-hidden="true" /> Refresh</button>
    </header>
    <div className="settings-workspace"><SettingsTabs tabs={tabs} activeTab={activeTab} onSelect={selectTab} disabled={busy} search={search} setSearch={setSearch} />
    <div className="settings-content" id={`settings-panel-${activeTab}`} role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`}>
      <div className="settings-notice"><Info size={14} aria-hidden="true" /><span><strong>Configuration priority</strong> Values saved here override environment defaults where supported. Removing an override restores the configured environment/default value.</span></div>
      {message && <div className={`settings-message ${message.error ? 'is-error' : ''}`} role={message.error ? 'alert' : 'status'}>
        {message.error ? <Info size={16} /> : <Check size={16} />}<span>{message.text}</span>
        <button type="button" aria-label="Dismiss message" onClick={() => setMessage(null)}><X size={14} /></button>
      </div>}
      {activeTab === 'status' ? <SettingsSection title="System status" description="Service health and the latest connection checks." icon={sectionIcon('status')}>
        {loading ? <p className="settings-empty" role="status">Loading service status…</p> : <div className="settings-status">{Object.entries(status).map(([name, service]) =>
          <article key={name}><div><h3>{categoryLabels[name] || name}</h3><p>{service.latencyMs !== undefined && `${service.latencyMs} ms · `}{service.checkedAt ? new Date(service.checkedAt).toLocaleString() : 'Not checked'}</p></div><StatusBadge>{service.status || 'Not checked'}</StatusBadge></article>,
        )}</div>}
      </SettingsSection> : activeTab === 'history' ? <AuditHistory history={history} loading={loading} /> : <>
        <div className="settings-category-heading"><h2>{categoryLabels[activeTab] || activeTab}</h2>
          <label className="settings-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Search this category" placeholder="Search this category…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        </div>
        <form id="cms-settings-form" onSubmit={save}>
          {filteredSections.map(section => <SettingsSection key={section.title} title={section.title} description={section.description} icon={section.icon}>
            <div className="settings-fields">{section.fields.map(([key, definition]) => <SettingsField key={key} settingKey={key} definition={definition}
              value={Object.hasOwn(patch, key) && patch[key] !== null ? patch[key] : settings.values[key]}
              secretValue={patch[key] || ''} reset={Object.hasOwn(patch, key) && patch[key] === null}
              edited={Object.hasOwn(patch, key)} disabled={busy || !writable(key, definition)} canEdit={writable(key, definition)}
              onChange={value => change(key, value)} onUndo={() => undo(key)} />)}</div>
          </SettingsSection>)}
          {!filteredSections.length && <p className="settings-empty">{query ? 'No matching settings in this category.' : 'No settings are available in this category.'}</p>}
          {testable && <div className="settings-test-action"><button className="settings-button secondary" type="button" disabled={busy} onClick={event => {
            if (!event.currentTarget.form.reportValidity()) return
            run(async () => {
              const result = await request(`/test/${activeTab}`, { method: 'POST', body: JSON.stringify({ values: patch }) })
              setMessage({ text: `Connection test passed${result.latencyMs !== undefined ? ` · ${result.latencyMs} ms` : ''}` })
            })
          }}><RotateCw size={14} aria-hidden="true" /> Test connection</button></div>}
          {!dirty && <div className="settings-save-row"><button className="settings-button primary" type="submit" disabled><Check size={15} aria-hidden="true" /> Save changes</button></div>}
        </form>
        {dirty && <div className="settings-unsaved-bar"><span><span className="settings-dirty-dot" />You have unsaved changes.</span><div>
          <button className="settings-button secondary" type="button" disabled={busy} onClick={() => { setPatch({}); setMessage(null) }}>Cancel</button>
          <button className="settings-button primary" type="submit" form="cms-settings-form" disabled={busy}>{busy ? <LoaderCircle className="settings-spinner" size={15} /> : <Check size={15} aria-hidden="true" />}{busy ? 'Working…' : 'Save changes'}</button>
        </div></div>}
      </>}
    </div></div>
  </section>
}

function SettingsTabs({ tabs, activeTab, onSelect, disabled, search, setSearch }) {
  const list = useRef(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })
  const updateOverflow = () => {
    const element = list.current
    if (element) setOverflow({ left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 })
  }
  useEffect(() => {
    const observer = new ResizeObserver(updateOverflow)
    observer.observe(list.current); updateOverflow()
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
  const categoryKeywords = { email: 'smtp sender mail password', database: 'postgresql connection database', portalDatabase: 'postgresql portal database connection', google: 'oauth google cloud project', storage: 'bucket upload storage', security: 'captcha security', weather: 'weather api' }
  const visibleTabs = tabs.filter(key => !search || `${categoryLabels[key] || key} ${categoryKeywords[key] || ''}`.toLowerCase().includes(search.toLowerCase()))
  return <aside className="settings-tabs-wrap">
    <label className="settings-search settings-global-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Search settings" placeholder="Search settings…" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <div className="settings-tabs" role="tablist" aria-label="Settings categories" ref={list} onScroll={updateOverflow}>
      {visibleTabs.map((key, index) => <button type="button" role="tab" key={key} id={`settings-tab-${key}`} aria-selected={key === activeTab}
        aria-controls={`settings-panel-${key}`} tabIndex={key === activeTab ? 0 : -1} disabled={disabled} onClick={() => onSelect(key)}
        onKeyDown={event => {
          let next
          if (event.key === 'ArrowRight') next = (index + 1) % visibleTabs.length
          if (event.key === 'ArrowLeft') next = (index - 1 + visibleTabs.length) % visibleTabs.length
          if (event.key === 'Home') next = 0
          if (event.key === 'End') next = visibleTabs.length - 1
          if (next !== undefined) { event.preventDefault(); list.current.children[next].focus() }
        }}>{categoryLabels[key] || key}</button>)}
    </div>
  </aside>
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
  </label> : definition.options ? <select {...inputProps} value={value ?? ''} onChange={event => onChange(event.target.value)}>{definition.options.map(option => <option key={option} value={option}>{option === 'google' ? 'Google reCAPTCHA' : option === 'starttls' ? 'STARTTLS' : option === 'tls' ? 'TLS' : option === 'backblaze' ? 'Backblaze B2' : option}</option>)}</select>
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
    {(definition.overridden || edited) && canEdit && <button className="settings-reset" type="button" disabled={disabled} onClick={() => reset ? onUndo() : onChange(null)}>{reset ? 'Cancel reset' : 'Reset to environment / default'}</button>}
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
