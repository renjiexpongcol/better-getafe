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

export default function AdminAiManagement({ canManage = false, canConfigureSecret = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [draft, setDraft] = useState({ enabled: false, defaultModel: 'gpt-4.1-mini', monthlyBudgetUsd: 0 })
  const [apiKey, setApiKey] = useState('')

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

  const saveSettings = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const body = await aiRequest('/settings', { method: 'PUT', body: JSON.stringify(draft) })
      setData(body)
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

      {message && <div className={message.error ? 'ai-notice error' : 'ai-notice'} role={message.error ? 'alert' : 'status'}>{message.text}</div>}

      <div className="ai-overview-grid">
        <article className="ai-control-card">
          <div className="ai-card-heading"><div className="ai-card-icon"><Bot size={20}/></div><div><h2>Global AI control</h2><p>Enable only approved AI operations.</p></div></div>
          <label className="ai-toggle-row">
            <span><strong>Enable Artificial Intelligence</strong><small>Public and administrative AI operations</small></span>
            <input type="checkbox" checked={draft.enabled} disabled={!canManage || busy} onChange={event => setDraft(value => ({ ...value, enabled: event.target.checked }))}/>
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
              <article className="ai-module-card" key={key}>
                <div className="ai-module-icon">{key === 'knowledge_base' ? <BrainCircuit size={18}/> : key === 'workflow_automation' ? <Wrench size={18}/> : <Bot size={18}/>}</div>
                <div className="ai-module-copy"><h3>{label}</h3><span className={module.enabled ? 'module-enabled' : 'module-disabled'}>{module.enabled ? 'Enabled' : 'Disabled'}</span></div>
                <label className="ai-switch" aria-label={`${module.enabled ? 'Disable' : 'Enable'} ${label}`}>
                  <input type="checkbox" checked={module.enabled} disabled={!draft.enabled || !canManage || busy} onChange={event => toggleModule(key, event.target.checked)}/>
                  <span/>
                </label>
              </article>
            )
          })}
        </div>
      </section>
    </section>
  )
}
