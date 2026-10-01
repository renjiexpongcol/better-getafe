import { useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, X, CheckCircle2, CircleAlert, Clock3 } from 'lucide-react'
import { normalizePublicError } from '../services/publicError'
import './AdminErrorLogs.css'

const stateLabels = { open: 'Open', acknowledged: 'Acknowledged', resolved: 'Resolved' }
const formatDate = value => value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
const formatStatus = value => Number.isFinite(Number(value)) ? String(value) : '—'

async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal', ...options.headers } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const publicError = normalizePublicError({ status: response.status, body }, 'unknown')
    const error = new Error(publicError.message)
    error.status = response.status
    error.body = body
    error.referenceId = publicError.referenceId
    throw error
  }
  return body
}

function StateBadge({ state }) {
  const Icon = state === 'resolved' ? CheckCircle2 : state === 'acknowledged' ? Clock3 : CircleAlert
  return <span className={`error-state-badge error-state-${state}`}><Icon size={14} aria-hidden="true" />{stateLabels[state] || state}</span>
}

export default function AdminErrorLogs({ canManage = false }) {
  const [filters, setFilters] = useState({ q: '', service: '', status: '', state: '' })
  const [result, setResult] = useState({ items: [], pagination: { page: 1, pages: 1, total: 0 } })
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
    params.set('limit', '50')
    return params.toString()
  }, [filters])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    request(`/api/admin/system/errors?${queryString}`)
      .then(value => { if (active) setResult(value) })
      .catch(cause => { if (active) setError(cause.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [queryString, refreshKey])

  const openDetail = async item => {
    setError('')
    try {
      const detail = await request(`/api/admin/system/errors/${encodeURIComponent(item.referenceId)}`)
      setSelected(detail)
      setNote(detail.adminNote || '')
    } catch (cause) { setError(cause.message) }
  }

  const saveDetail = async event => {
    event.preventDefault()
    if (!selected || !canManage) return
    setSaving(true)
    setError('')
    try {
      const detail = await request(`/api/admin/system/errors/${encodeURIComponent(selected.referenceId)}`, { method: 'PATCH', body: JSON.stringify({ state: selected.state, adminNote: note }) })
      setSelected(detail)
      setResult(current => ({ ...current, items: current.items.map(item => item.referenceId === detail.referenceId ? { ...item, state: detail.state, adminNote: detail.adminNote } : item) }))
    } catch (cause) { setError(cause.message) }
    finally { setSaving(false) }
  }

  const updateFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }))
  return <section className="error-center" aria-labelledby="error-center-title">
    <div className="cms-title error-center-titlebar">
      <div><p className="portal-date">System</p><h1 id="error-center-title">Error Center</h1><p>Review grouped application failures and their redacted diagnostic context.</p></div>
      <button type="button" className="citizen-secondary error-refresh" onClick={() => setRefreshKey(value => value + 1)} disabled={loading}><RefreshCw size={16} aria-hidden="true" />Refresh</button>
    </div>
    <div className="citizen-panel error-center-filters">
      <label className="error-search-field"><span>Search</span><div><Search size={17} aria-hidden="true" /><input type="search" value={filters.q} onChange={event => updateFilter('q', event.target.value)} placeholder="Reference, route, service, or code" /></div></label>
      <label><span>Service</span><input value={filters.service} onChange={event => updateFilter('service', event.target.value)} placeholder="All services" /></label>
      <label><span>Status</span><select value={filters.status} onChange={event => updateFilter('status', event.target.value)}><option value="">All statuses</option>{[400, 401, 403, 404, 409, 429, 500, 502, 503, 504].map(status => <option value={status} key={status}>{status}</option>)}</select></label>
      <label><span>State</span><select value={filters.state} onChange={event => updateFilter('state', event.target.value)}><option value="">All states</option>{Object.entries(stateLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    </div>
    {error && <p className="portal-error error-center-feedback" role="alert">{error}</p>}
    <div className="citizen-panel error-center-table-panel">
      <div className="citizen-panel-head"><div><h2>Issues</h2><p className="portal-muted">{result.pagination?.total || 0} grouped issue{result.pagination?.total === 1 ? '' : 's'}</p></div></div>
      {loading ? <p className="portal-muted" role="status">Loading error records…</p> : result.items?.length ? <div className="error-table-wrap"><table className="error-table"><thead><tr><th>Reference</th><th>Last seen</th><th>Service</th><th>Route</th><th>Status</th><th>Occurrences</th><th>State</th></tr></thead><tbody>{result.items.map(item => <tr key={item.referenceId}><td><button type="button" className="error-reference" onClick={() => openDetail(item)}>{item.referenceId}</button></td><td>{formatDate(item.lastSeen)}</td><td>{item.service}</td><td><code>{item.method} {item.route}</code></td><td><span className={`error-status status-${item.status}`}>{formatStatus(item.status)}</span></td><td>{item.occurrenceCount}</td><td><StateBadge state={item.state} /></td></tr>)}</tbody></table></div> : <div className="error-empty"><h3>No matching issues</h3><p>New grouped failures will appear here when they are recorded.</p></div>}
    </div>
    {selected && <div className="app-modal-backdrop error-detail-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null) }}><section className="app-modal error-detail-modal" role="dialog" aria-modal="true" aria-labelledby="error-detail-title"><header className="error-detail-header"><div><p className="portal-date">Diagnostic record</p><h2 id="error-detail-title">{selected.referenceId}</h2><StateBadge state={selected.state} /></div><button type="button" className="profile-form-close" aria-label="Close issue details" onClick={() => setSelected(null)}><X size={18} /></button></header><div className="error-detail-grid"><div><span>First seen</span><strong>{formatDate(selected.firstSeen)}</strong></div><div><span>Last seen</span><strong>{formatDate(selected.lastSeen)}</strong></div><div><span>Occurrences</span><strong>{selected.occurrenceCount}</strong></div><div><span>Status</span><strong>{selected.status}</strong></div><div><span>Service</span><strong>{selected.service}</strong></div><div><span>Route</span><strong><code>{selected.method} {selected.route}</code></strong></div><div><span>Internal code</span><strong><code>{selected.internalCode}</code></strong></div><div><span>Upstream dependency</span><strong>{selected.upstreamDependency || 'Not recorded'}</strong></div></div><div className="error-detail-copy"><h3>Technical message</h3><p>{selected.technicalMessage || 'Not recorded'}</p><h3>Stack trace</h3><pre>{selected.stackTrace || 'Not recorded'}</pre></div>{canManage && <form className="error-detail-actions" onSubmit={saveDetail}><label>Issue state<select value={selected.state} onChange={event => setSelected(current => ({ ...current, state: event.target.value }))}>{Object.entries(stateLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Admin note<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} placeholder="Add a private note for the team" /></label><button className="citizen-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save issue'}</button></form>}</section></div>}
  </section>
}
