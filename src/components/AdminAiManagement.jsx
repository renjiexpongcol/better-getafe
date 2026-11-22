import { useEffect, useState } from 'react'
import { Activity, Bot, BrainCircuit, CheckCircle2, CircleOff, Database, Gauge, KeyRound, RefreshCw, ShieldCheck, Sparkles, Wrench } from 'lucide-react'
import { apiFetch } from '../services/apiTransport.js'
import './AdminAiManagement.css'

const MODULE_LABELS = {
  resident_assistant: 'Resident AI Assistant',
  cms_content: 'CMS Content Generation',
  writing_assistant: 'AI Writing Assistant',
  translation: 'AI Translation',
  smart_search: 'AI Smart Search',
  knowledge_base: 'AI Knowledge Base',
  analytics_insights: 'AI Analytics Insights',
  document_assistance: 'AI Document Assistance',
  accessibility_assistance: 'AI Accessibility Assistance',
  moderation_assistance: 'AI Moderation Assistance',
  administrative_assistant: 'AI Administrative Assistant',
  workflow_automation: 'AI Workflow Automation',
}
const KNOWLEDGE_WORKER_LABELS = { starting: 'Starting', waiting: 'Waiting for dependencies', running: 'Processing', ready: 'Ready', disabled: 'Disabled', degraded: 'Degraded', stopped: 'Stopped' }

async function aiRequest(path, options = {}) {
  const response = await apiFetch(`/api/admin/ai${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'The AI request could not be completed.')
  return body
}

export default function AdminAiManagement({ canManage = false, canManageKnowledge = canManage, canConfigureSecret = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [draft, setDraft] = useState({ enabled: false, defaultModel: 'gpt-4.1-mini', monthlyBudgetUsd: 0 })
  const [apiKey, setApiKey] = useState('')
  const [section, setSection] = useState('Overview')
  const [expandedModule, setExpandedModule] = useState(null)
  const [knowledge, setKnowledge] = useState(null)
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [knowledgeDoc, setKnowledgeDoc] = useState({ sourceKey: 'approved_municipal_documents', title: '', sourceUrl: '', content: '', visibility: 'public', publicationStatus: 'draft', approved: false })
  const sections = ['Overview', 'AI Assistant', 'Content Studio', 'Smart Search', 'Knowledge Base', 'AI Automations', 'Models & Providers', 'Usage & Analytics', 'Safety & Policies', 'Settings', 'Audit Logs']

  const load = async () => {
    setLoading(true)
    try {
      const body = await aiRequest('/overview')
      setData(body)
      setDraft({ enabled: body.enabled, defaultModel: body.defaultModel, monthlyBudgetUsd: body.monthlyBudgetUsd })
    } catch (error) {
      setMessage({ error: true, text: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  const loadKnowledge = async () => { if (!canManageKnowledge) return; setKnowledgeLoading(true); try { setKnowledge(await aiRequest('/knowledge')) } catch (error) { setMessage({ error: true, text: error.message }) } finally { setKnowledgeLoading(false) } }
  useEffect(() => { if (section === 'Knowledge Base') loadKnowledge() }, [section])
  const saveKnowledgeSource = async (source, patch) => { setBusy(true); try { setKnowledge(await aiRequest(`/knowledge/sources/${encodeURIComponent(source.sourceKey)}`, { method: 'PUT', body: JSON.stringify({ enabled: patch.enabled ?? source.enabled, approved: patch.approved ?? source.approved, visibility: patch.visibility ?? source.visibility }) })) } catch (error) { setMessage({ error: true, text: error.message }) } finally { setBusy(false) } }
  const reindexKnowledge = async (sourceKeys) => { setBusy(true); try { const result = await aiRequest('/knowledge/sync', { method: 'POST', body: JSON.stringify({ action: 'rebuild', sourceKeys }) }); setKnowledge(result.knowledge); setMessage({ text: `${result.queued} indexing jobs queued.` }); setTimeout(loadKnowledge, 1500) } catch (error) { setMessage({ error: true, text: error.message }) } finally { setBusy(false) } }
  const saveKnowledgeDocument = async (event) => { event.preventDefault(); setBusy(true); try { setKnowledge(await aiRequest('/knowledge/documents', { method: 'POST', body: JSON.stringify(knowledgeDoc) })); setKnowledgeDoc({ sourceKey: 'approved_municipal_documents', title: '', sourceUrl: '', content: '', visibility: 'public', publicationStatus: 'draft', approved: false }); setMessage({ text: 'Municipal knowledge document saved.' }) } catch (error) { setMessage({ error: true, text: error.message }) } finally { setBusy(false) } }

  const saveSettings = async (settings = draft) => {
    setBusy(true)
    setMessage(null)
    try {
      const body = await aiRequest('/settings', { method: 'PUT', body: JSON.stringify(settings) })
      setData(body)
      setDraft({ enabled: body.enabled, defaultModel: body.defaultModel, monthlyBudgetUsd: body.monthlyBudgetUsd })
      setMessage({ text: 'AI settings saved.' })
    } catch (error) {
      setMessage({ error: true, text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const saveCredential = async () => {
    if (!apiKey.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      const response = await apiFetch('/api/admin/settings/ai', {
        credentials: 'include',
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: { 'ai.openaiApiKey': apiKey.trim() } }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'The API key could not be saved.')
      setApiKey('')
      setMessage({ text: 'OpenAI credential saved securely.' })
      await load()
    } catch (error) {
      setMessage({ error: true, text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const toggleModule = async (key, enabled) => {
    setBusy(true)
    setMessage(null)
    try {
      const body = await aiRequest(`/modules/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled, model: data.modules[key]?.model || data.defaultModel, configuration: data.modules[key]?.configuration || {} }),
      })
      setData(body)
    } catch (error) {
      setMessage({ error: true, text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const saveModuleConfiguration = async (key, patch) => {
    const module = data.modules[key] || {}
    const model = patch.model ?? module.model ?? data.defaultModel
    const { model: _model, ...configurationPatch } = patch
    setBusy(true); setMessage(null)
    try {
      const body = await aiRequest(`/modules/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ enabled: module.enabled, model, configuration: { ...(module.configuration || {}), ...configurationPatch } }) })
      setData(body); setMessage({ text: `${MODULE_LABELS[key]} settings saved.` })
    } catch (error) { setMessage({ error: true, text: error.message }) }
    finally { setBusy(false) }
  }

  const testConnection = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const body = await aiRequest('/test-connection', { method: 'POST', body: JSON.stringify({ model: draft.defaultModel }) })
      setMessage({ text: `Connection successful. ${body.latencyMs} ms.` })
      await load()
    } catch (error) {
      setMessage({ error: true, text: error.message })
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <section className="ai-management" aria-busy="true"><div className="settings-skeleton" /><div className="settings-skeleton tall" /></section>

  const providerStatus = data?.provider?.status || 'not_configured'
  const statusLabel = providerStatus === 'connected' ? 'Connected' : providerStatus === 'degraded' ? 'Degraded' : providerStatus === 'unavailable' ? 'Unavailable' : 'Not configured'

  return (
    <section className="ai-management" aria-labelledby="ai-management-title">
      <header className="ai-management-header">
        <div>
          <span className="ai-eyebrow"><Sparkles size={15} aria-hidden="true"/> Municipal AI platform</span>
          <h1 id="ai-management-title">AI Management</h1>
          <p>Central controls for AI providers, modules, usage and governance.</p>
        </div>
        <div className={`ai-system-status ${draft.enabled ? 'enabled' : 'disabled'}`}>
          {draft.enabled ? <CheckCircle2 size={18} aria-hidden="true"/> : <CircleOff size={18} aria-hidden="true"/>}
          <span><small>AI System</small>{draft.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      </header>

      <nav className="ai-section-nav" aria-label="AI Management sections">{sections.map(item => <button type="button" key={item} className={section === item ? 'active' : ''} aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}>{item}</button>)}</nav>

      {message && <div className={message.error ? 'ai-notice error' : 'ai-notice'} role={message.error ? 'alert' : 'status'}>{message.text}</div>}

      {section === 'Overview' && <>
      <div className="ai-overview-grid">
        <article className="ai-control-card">
          <div className="ai-card-heading"><div className="ai-card-icon"><Bot size={20}/></div><div><h2>Global AI control</h2><p>Enable only approved AI operations.</p></div></div>
          <label className="ai-toggle-row">
            <span><strong>Enable Artificial Intelligence</strong><small>Public and administrative AI operations</small></span>
            <input type="checkbox" checked={draft.enabled} disabled={!canManage || busy} onChange={event => saveSettings({ ...draft, enabled: event.target.checked })}/>
          </label>
          <div className="ai-control-fields">
            <label>Default model<input value={draft.defaultModel} disabled={!canManage || busy} onChange={event => setDraft(value => ({ ...value, defaultModel: event.target.value }))}/></label>
            <label>Monthly budget (USD)<input type="number" min="0" step="0.01" value={draft.monthlyBudgetUsd} disabled={!canManage || busy} onChange={event => setDraft(value => ({ ...value, monthlyBudgetUsd: Number(event.target.value) }))}/></label>
          </div>
          {canManage && <button type="button" className="ai-primary-button" disabled={busy} onClick={saveSettings}>{busy ? 'Saving…' : 'Save AI settings'}</button>}
        </article>

        <article className="ai-health-card">
          <div className="ai-card-heading"><div className="ai-card-icon"><KeyRound size={20}/></div><div><h2>OpenAI connection</h2><p>Server-side provider status</p></div></div>
          <div className={`ai-health-value ${providerStatus}`}><span>{statusLabel}</span><small>{data?.provider?.status_detail || (data?.keyConfigured ? 'Credentials configured; connection not tested' : 'OPENAI_API_KEY is not configured')}</small></div>
          {canConfigureSecret && <div className="ai-control-fields ai-api-key-field"><label>OpenAI API key<input type="password" autoComplete="off" value={apiKey} disabled={busy} placeholder={data?.keyConfigured ? 'Configured - enter a replacement' : 'sk-...'} onChange={event => setApiKey(event.target.value)}/></label><button type="button" className="ai-secondary-button" disabled={busy || !apiKey.trim()} onClick={saveCredential}>Save key</button></div>}
          {canManage && <button type="button" className="ai-secondary-button" disabled={busy} onClick={testConnection}><RefreshCw size={16} aria-hidden="true"/>{busy ? 'Testing…' : 'Test connection'}</button>}
        </article>
      </div>

      <div className="ai-stat-grid" aria-label="AI usage summary">
        <article><Activity size={18}/><span><small>Requests this month</small><strong>{Number(data?.usage?.requests || 0).toLocaleString()}</strong></span></article>
        <article><Gauge size={18}/><span><small>Monthly estimate</small><strong>${Number(data?.usage?.estimated_cost || 0).toFixed(2)}</strong></span></article>
        <article><Database size={18}/><span><small>Enabled modules</small><strong>{Object.values(data?.modules || {}).filter(module => module.enabled).length}</strong></span></article>
        <article><ShieldCheck size={18}/><span><small>Input / output tokens</small><strong>{Number(data?.usage?.input_tokens || 0).toLocaleString()} / {Number(data?.usage?.output_tokens || 0).toLocaleString()}</strong></span></article>
      </div>

      <section className="ai-modules-section" aria-labelledby="ai-modules-title">
        <div className="ai-section-heading"><div><h2 id="ai-modules-title">AI modules</h2><p>New modules remain disabled until configured and approved.</p></div></div>
        <div className="ai-module-grid">
          {Object.entries(MODULE_LABELS).map(([key, label]) => {
            const module = data?.modules?.[key] || { enabled: false }
            return (
              <article className={`ai-module-card ${expandedModule === key && draft.enabled && module.enabled ? 'expanded' : ''}`} key={key}>
                <div className="ai-module-icon">{key === 'knowledge_base' ? <BrainCircuit size={18}/> : key === 'workflow_automation' ? <Wrench size={18}/> : <Bot size={18}/>}</div>
                <button type="button" className="ai-module-copy" onClick={() => setExpandedModule(expandedModule === key ? null : key)} aria-expanded={expandedModule === key && draft.enabled && module.enabled}><h3>{label}</h3><span className={module.enabled ? 'module-enabled' : 'module-disabled'}>{module.enabled ? 'Enabled' : 'Disabled'}</span></button>
                <label className="ai-switch" aria-label={`${module.enabled ? 'Disable' : 'Enable'} ${label}`}>
                  <input type="checkbox" checked={module.enabled} disabled={!draft.enabled || !canManage || busy} onChange={event => toggleModule(key, event.target.checked)}/>
                  <span/>
                </label>
                {expandedModule === key && draft.enabled && module.enabled && <div className="ai-module-settings">
                  <label>Assigned model<input value={module.model || data.defaultModel} disabled={!canManage || busy} onChange={event => setData(current => ({ ...current, modules: { ...current.modules, [key]: { ...current.modules[key], model: event.target.value } } }))} onBlur={event => saveModuleConfiguration(key, { model: event.target.value })}/></label>
                  {key === 'resident_assistant' && <>
                    <label>Assistant name<input defaultValue={module.configuration?.assistantName || 'Getafe Assistant'} disabled={!canManage || busy} onBlur={event => saveModuleConfiguration(key, { assistantName: event.target.value })}/></label>
                    <label>Welcome message<textarea defaultValue={module.configuration?.welcomeMessage || ''} placeholder="Welcome residents and explain what the assistant can help with." disabled={!canManage || busy} onBlur={event => saveModuleConfiguration(key, { welcomeMessage: event.target.value })}/></label>
                    <label>Supported languages<input defaultValue={(module.configuration?.supportedLanguages || ['English', 'Filipino', 'Cebuano']).join(', ')} disabled={!canManage || busy} onBlur={event => saveModuleConfiguration(key, { supportedLanguages: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })}/></label>
                    <label>Suggested questions<textarea defaultValue={(module.configuration?.suggestedQuestions || ['How do I apply for a business permit?', 'Where can I find municipal services?', 'What are the latest announcements?']).join('\n')} placeholder="One suggested question per line" disabled={!canManage || busy} onBlur={event => saveModuleConfiguration(key, { suggestedQuestions: event.target.value.split('\n').map(value => value.trim()).filter(Boolean).slice(0, 4) })}/></label>
                    <label>Maximum conversation turns<input type="number" min="1" max="100" defaultValue={module.configuration?.maxConversationLength || 20} disabled={!canManage || busy} onBlur={event => saveModuleConfiguration(key, { maxConversationLength: Number(event.target.value) })}/></label>
                    <label>Maximum response tokens<input type="number" min="100" max="1200" defaultValue={module.configuration?.maxOutputTokens || 700} disabled={!canManage || busy} onBlur={event => saveModuleConfiguration(key, { maxOutputTokens: Number(event.target.value) })}/></label>
                    <label>Escalation instructions<textarea defaultValue={module.configuration?.escalationSettings || ''} placeholder="When and how to direct residents to municipal staff." disabled={!canManage || busy} onBlur={event => saveModuleConfiguration(key, { escalationSettings: event.target.value })}/></label>
                    <label className="ai-config-check"><input type="checkbox" defaultChecked={module.configuration?.publicVisibility ?? false} disabled={!canManage || busy} onChange={event => saveModuleConfiguration(key, { publicVisibility: event.target.checked })}/> Public visibility</label>
                  </>}
                  {key !== 'resident_assistant' && <label>Module limits (JSON)<textarea defaultValue={JSON.stringify(module.configuration || {}, null, 2)} disabled={!canManage || busy} onBlur={event => { try { const value = JSON.parse(event.target.value || '{}'); if (value && typeof value === 'object' && !Array.isArray(value)) saveModuleConfiguration(key, value); else setMessage({ error: true, text: 'Module settings must be a JSON object.' }) } catch { setMessage({ error: true, text: 'Enter valid JSON module settings.' }) } }}/></label>}
                  <small>Module controls are stored immediately and applied by the server without a restart.</small>
                </div>}
              </article>
            )
          })}
        </div>
      </section>
      </>}
      {section !== 'Overview' && <section className="ai-section-panel"><h2>{section}</h2><p>{section === 'Audit Logs' ? 'Recent administrator actions and AI operation records.' : section === 'Usage & Analytics' ? 'Current month request, token, cost, and provider activity.' : section === 'Safety & Policies' ? 'Configure module-level safeguards and review rules.' : section === 'Settings' ? 'Global defaults and platform controls.' : 'Configure AI capabilities and their assigned modules.'}</p>
        {section === 'AI Assistant' && <div className="ai-module-grid">{['resident_assistant','administrative_assistant'].map(key => <button className="ai-nav-card" key={key} onClick={() => { setExpandedModule(key); setSection('Overview') }}>{MODULE_LABELS[key]} · {data.modules[key]?.enabled ? 'Enabled' : 'Disabled'}</button>)}</div>}
        {section === 'Content Studio' && <div className="ai-section-link"><p>AI content generation is controlled by CMS Content Generation, AI Writing Assistant, and AI Translation.</p><button type="button" onClick={() => { setExpandedModule('cms_content'); setSection('Overview') }}>Configure content generation</button></div>}
        {section === 'Smart Search' && <button type="button" className="ai-nav-card" onClick={() => { setExpandedModule('smart_search'); setSection('Overview') }}>Configure AI Smart Search · {data.modules.smart_search?.enabled ? 'Enabled' : 'Disabled'}</button>}
        {section === 'Knowledge Base' && <><p>Sources are indexed only after explicit municipal approval. Unpublished or restricted content is excluded from public retrieval.</p>{knowledgeLoading && <p role="status">Loading index status…</p>}{knowledge && <><div className={`ai-worker-status ${knowledge.worker?.state || 'unknown'}`} role="status"><strong>Knowledge worker: {KNOWLEDGE_WORKER_LABELS[knowledge.worker?.state] || 'Status unavailable'}</strong>{knowledge.worker?.reason && knowledge.worker.reason !== 'feature_disabled' && <small>Diagnostic: {knowledge.worker.reason}</small>}{knowledge.worker?.lastRunAt && <small>Last worker check: {new Date(knowledge.worker.lastRunAt).toLocaleString()}</small>}</div><div className="ai-stat-grid"><article><span><small>Indexed documents</small><strong>{knowledge.metrics?.indexedDocuments || 0}</strong></span></article><article><span><small>Pending jobs</small><strong>{knowledge.metrics?.pendingJobs || 0}</strong></span></article><article><span><small>Failed jobs</small><strong>{knowledge.metrics?.failedJobs || 0}</strong></span></article><article><span><small>Retrieval</small><strong>{knowledge.metrics?.vectorAvailable ? 'pgvector + text search' : 'PostgreSQL text search'}</strong></span></article></div><p>Last successful synchronization: {knowledge.metrics?.lastSuccessfulSync ? new Date(knowledge.metrics.lastSuccessfulSync).toLocaleString() : 'Not yet synchronized'}</p><button className="ai-primary-button" disabled={!canManage || busy} onClick={() => reindexKnowledge((knowledge.sources || []).map(source => source.sourceKey))}><RefreshCw size={16}/> Rebuild approved sources</button><button className="ai-secondary-button" onClick={loadKnowledge}>Refresh diagnostics</button><div className="ai-module-grid">{(knowledge.sources || []).map(source => <article className="ai-control-card" key={source.sourceKey}><h3>{source.label}</h3><p>{source.description}</p><p>{source.documentCount} documents</p><label className="ai-toggle-row"><span><strong>Approved</strong></span><input type="checkbox" checked={source.approved} disabled={!canManage || busy} onChange={event => saveKnowledgeSource(source, { approved: event.target.checked })}/></label><label className="ai-toggle-row"><span><strong>Enabled</strong></span><input type="checkbox" checked={source.enabled} disabled={!canManageKnowledge || busy || !source.approved} onChange={event => saveKnowledgeSource(source, { enabled: event.target.checked })}/></label><label>Visibility<select value={source.visibility} disabled={!canManage || busy} onChange={event => saveKnowledgeSource(source, { visibility: event.target.value })}><option value="public">Public</option><option value="internal">Internal</option><option value="private">Private</option></select></label><button className="ai-secondary-button" disabled={!canManageKnowledge || busy || !source.approved || source.visibility !== 'public'} onClick={() => reindexKnowledge([source.sourceKey])}>Reindex source</button></article>)}</div>{!!knowledge.failures?.length && <div className="ai-table-wrap"><h3>Failed indexing jobs</h3><table><thead><tr><th>Source</th><th>Record</th><th>Attempts</th><th>Diagnostic</th></tr></thead><tbody>{knowledge.failures.map(job => <tr key={job.id}><td>{job.sourceKey}</td><td>{job.sourceRecordId}</td><td>{job.attempts}</td><td>{job.lastError}</td></tr>)}</tbody></table></div>}</>}</>}
        {section === 'AI Automations' && <button type="button" className="ai-nav-card" onClick={() => { setExpandedModule('workflow_automation'); setSection('Overview') }}>Configure AI Workflow Automation · {data.modules.workflow_automation?.enabled ? 'Enabled' : 'Disabled'}</button>}
        {section === 'Models & Providers' && <><p>Provider: {data.provider?.provider || 'OpenAI'} · {statusLabel}</p><div className="ai-stat-grid"><article><span><small>Default model</small><strong>{data.defaultModel}</strong></span></article><article><span><small>Credential</small><strong>{data.keyConfigured ? 'Configured' : 'Missing'}</strong></span></article></div>{canManage && <button type="button" className="ai-secondary-button" disabled={busy} onClick={testConnection}>Test provider connection</button>}</>}
        {section === 'Usage & Analytics' && <><div className="ai-stat-grid"><article><span><small>Requests this month</small><strong>{Number(data.usage?.requests || 0).toLocaleString()}</strong></span></article><article><span><small>Estimated cost</small><strong>${Number(data.usage?.estimated_cost || 0).toFixed(2)}</strong></span></article><article><span><small>Successful / failed</small><strong>{data.usage?.successful || 0} / {data.usage?.failed || 0}</strong></span></article><article><span><small>Tokens in / out</small><strong>{Number(data.usage?.input_tokens || 0).toLocaleString()} / {Number(data.usage?.output_tokens || 0).toLocaleString()}</strong></span></article></div><div className="ai-table-wrap"><table><thead><tr><th>Time</th><th>Module</th><th>Status</th><th>Model</th><th>Duration</th></tr></thead><tbody>{(data.recentRequests || []).map(row => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{MODULE_LABELS[row.module_key] || row.module_key}</td><td>{row.status}</td><td>{row.model || '—'}</td><td>{row.duration_ms || 0} ms</td></tr>)}</tbody></table></div></>}
        {section === 'Safety & Policies' && <div className="ai-safety-note"><ShieldCheck size={20}/><p>All modules default to disabled. Content generation requires authorized CMS permissions and generated content remains a draft for staff review. Configure additional per-module safeguards in each enabled module’s settings.</p></div>}
        {section === 'Settings' && <div className="ai-control-fields"><label>Default model<input value={draft.defaultModel} disabled={!canManage || busy} onChange={event => setDraft(value => ({ ...value, defaultModel: event.target.value }))}/></label><label>Monthly budget (USD)<input type="number" min="0" step="0.01" value={draft.monthlyBudgetUsd} disabled={!canManage || busy} onChange={event => setDraft(value => ({ ...value, monthlyBudgetUsd: Number(event.target.value) }))}/></label>{canManage && <button className="ai-primary-button" type="button" disabled={busy} onClick={saveSettings}>Save settings</button>}</div>}
        {section === 'Audit Logs' && <div className="ai-table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Module</th><th>Actor</th><th>Details</th></tr></thead><tbody>{(data.auditLogs || []).map(row => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.action}</td><td>{row.module_key || '—'}</td><td>{row.user_id || '—'}</td><td><code>{JSON.stringify(row.details || {})}</code></td></tr>)}</tbody></table></div>}
      </section>}
    </section>
  )
}

