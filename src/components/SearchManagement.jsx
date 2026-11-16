import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Search, X } from 'lucide-react'
import { requestJson } from '../services/apiTransport.js'
import { routeRequest } from '../services/routeRequests.js'
import './SearchManagement.css'

const emptyForm = { label: '', canonicalQuery: '', aliases: '', publicVisible: true, pinOrder: '' }
const rateLabel = value => `${(Number(value || 0) * 100).toFixed(1)}%`
const numberLabel = value => new Intl.NumberFormat('en-PH').format(Number(value) || 0)

export default function SearchManagement() {
  const [topics, setTopics] = useState([])
  const [analytics, setAnalytics] = useState({ 7: null, 30: null })
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [topicResult, week, month] = await Promise.all([
        routeRequest('/api/admin/search/topics', { scope: 'cms' }),
        routeRequest('/api/admin/search/analytics?days=7', { scope: 'cms' }),
        routeRequest('/api/admin/search/analytics?days=30', { scope: 'cms' }),
      ])
      setTopics(topicResult.items || [])
      setAnalytics({ 7: week, 30: month })
    } catch (loadError) {
      setError(loadError.message || 'Search management could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const resetForm = () => { setForm(emptyForm); setEditingId(null) }
  const editTopic = topic => {
    setEditingId(topic.id)
    setForm({ label: topic.label, canonicalQuery: topic.canonicalQuery, aliases: (topic.aliases || []).join('\n'), publicVisible: topic.publicVisible, pinOrder: topic.pinOrder ?? '' })
    setNotice('')
  }
  const save = async event => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const payload = {
      label: form.label,
      canonicalQuery: form.canonicalQuery,
      aliases: form.aliases.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean),
      publicVisible: form.publicVisible,
      pinOrder: form.pinOrder === '' ? null : Number(form.pinOrder),
    }
    try {
      await requestJson(editingId ? `/api/admin/search/topics/${encodeURIComponent(editingId)}` : '/api/admin/search/topics', {
        method: editingId ? 'PUT' : 'POST',
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      setNotice(editingId ? 'Search topic updated.' : 'Search topic created.')
      resetForm()
      setRefresh(value => value + 1)
    } catch (saveError) {
      setError(saveError.message || 'Search topic could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const report = days => {
    const data = analytics[days]
    if (!data) return null
    return <section className="search-analytics-panel citizen-panel" aria-labelledby={`search-analytics-${days}`}>
      <header><div><h2 id={`search-analytics-${days}`}>{days}-day search analytics</h2><p>Calendar days in Asia/Manila, including today.</p></div><span>{numberLabel(data.topics.reduce((sum, item) => sum + item.typedSubmissions + item.chipClicks, 0) + data.unmatched.typedSubmissions)} completed searches</span></header>
      <div className="search-analytics-summary">
        <div><small>Typed searches</small><strong>{numberLabel(data.topics.reduce((sum, item) => sum + item.typedSubmissions, 0) + data.unmatched.typedSubmissions)}</strong></div>
        <div><small>Quick-link clicks</small><strong>{numberLabel(data.topics.reduce((sum, item) => sum + item.chipClicks, 0))}</strong></div>
        <div><small>Zero-result searches</small><strong>{numberLabel(data.topics.reduce((sum, item) => sum + item.zeroResultCount, 0) + data.unmatched.zeroResultCount)}</strong></div>
      </div>
      <div className="search-analytics-table-wrap"><table className="search-analytics-table"><thead><tr><th>Topic</th><th>Typed</th><th>Quick-link clicks</th><th>Typed zero results</th><th>Click zero results</th><th>Zero-result rate</th></tr></thead><tbody>
        {data.topics.map(topic => <tr key={topic.id}><th scope="row"><span>{topic.label}</span><small>{topic.publicVisible ? 'Public' : 'Hidden from suggestions'}</small></th><td>{numberLabel(topic.typedSubmissions)}</td><td>{numberLabel(topic.chipClicks)}</td><td>{numberLabel(topic.typedZeroResults)}</td><td>{numberLabel(topic.chipZeroResults)}</td><td>{rateLabel(topic.zeroResultRate)}</td></tr>)}
        <tr className="search-analytics-unmatched"><th scope="row"><span>Unmatched typed searches</span><small>Submitted text is not retained</small></th><td>{numberLabel(data.unmatched.typedSubmissions)}</td><td>—</td><td>{numberLabel(data.unmatched.zeroResultCount)}</td><td>—</td><td>{rateLabel(data.unmatched.typedSubmissions ? data.unmatched.zeroResultCount / data.unmatched.typedSubmissions : 0)}</td></tr>
        {!data.topics.length && <tr><td colSpan="6">No completed searches in this period.</td></tr>}
      </tbody></table></div>
    </section>
  }

  return <div className="search-management">
    <header className="search-management-heading"><div><p className="service-directory-kicker">Portal discovery</p><h1>Search Management</h1><p>Manage canonical topics, synonyms, public suggestions, and privacy-safe search aggregates.</p></div><button type="button" className="citizen-secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw size={16} aria-hidden="true"/> Refresh</button></header>
    {error && <div className="portal-error" role="alert">{error}</div>}
    {notice && <div className="search-management-notice" role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16}/></button></div>}
    <section className="search-topic-editor citizen-panel" aria-labelledby="search-topic-editor-title">
      <header><div><h2 id="search-topic-editor-title">{editingId ? 'Edit search topic' : 'Add a search topic'}</h2><p>Aliases resolve to the canonical query and share its aggregate counts.</p></div>{editingId && <button type="button" className="citizen-secondary" onClick={resetForm}>Cancel edit</button>}</header>
      <form onSubmit={save}>
        <label>Public label<input required maxLength="120" value={form.label} onChange={event => setForm(current => ({ ...current, label: event.target.value }))} placeholder="Business Permit"/></label>
        <label>Canonical query<input required maxLength="160" value={form.canonicalQuery} onChange={event => setForm(current => ({ ...current, canonicalQuery: event.target.value }))} placeholder="Business Permit"/><small>Visitors searching this topic will see results for this query.</small></label>
        <label className="search-topic-aliases">Aliases<textarea rows="4" value={form.aliases} onChange={event => setForm(current => ({ ...current, aliases: event.target.value }))} placeholder={'business permits\nBPLO\npermit application'}/><small>Enter one synonym per line. Case and repeated spaces are normalized.</small></label>
        <label>Pin order<input type="number" min="1" max="1000" value={form.pinOrder} onChange={event => setForm(current => ({ ...current, pinOrder: event.target.value }))} placeholder="Optional"/><small>Pinned topics appear in Quick links.</small></label>
        <label className="search-topic-visibility"><input type="checkbox" checked={form.publicVisible} onChange={event => setForm(current => ({ ...current, publicVisible: event.target.checked }))}/>Show in public suggestions</label>
        <div className="search-topic-form-actions"><button type="submit" className="citizen-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save topic' : <><Plus size={16}/> Add topic</>}</button></div>
      </form>
    </section>

    <section className="search-topics-panel citizen-panel" aria-labelledby="search-topics-title">
      <header><div><h2 id="search-topics-title">Topics and aliases</h2><p>Hiding a topic removes it from public suggestions without removing its analytics.</p></div></header>
      {loading ? <p role="status">Loading search topics and reports…</p> : topics.length ? <div className="search-analytics-table-wrap"><table className="search-analytics-table"><thead><tr><th>Label</th><th>Canonical query</th><th>Aliases</th><th>Visibility</th><th>Pin order</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{topics.map(topic => <tr key={topic.id}><th scope="row">{topic.label}</th><td>{topic.canonicalQuery}</td><td>{topic.aliases?.length ? topic.aliases.join(', ') : '—'}</td><td>{topic.publicVisible ? 'Public' : 'Hidden'}</td><td>{topic.pinOrder ?? '—'}</td><td><button type="button" className="citizen-secondary" onClick={() => editTopic(topic)}>Edit</button></td></tr>)}</tbody></table></div> : <p>No topics yet. Add a canonical query and its aliases to start tracking search activity.</p>}
    </section>

    <div className="search-analytics-reports">{report(7)}{report(30)}</div>
    <p className="search-privacy-note"><Search size={16} aria-hidden="true"/>Search analytics include completed submissions recorded while default-on Analytics collection is enabled, after the reporting cutover. Visitors can opt out in Cookie settings. Daily totals are shared with Website Analytics. Submitted text, IP addresses, and user identifiers are not stored.</p>
  </div>
}
