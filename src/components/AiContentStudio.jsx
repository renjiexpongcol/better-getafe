import { useEffect, useRef, useState } from 'react'
import { Check, Copy, RefreshCw, Sparkles, WandSparkles, X } from 'lucide-react'
import ModalDialog from './ModalDialog'
import { apiFetch } from '../services/apiTransport.js'
import './AiContentStudio.css'

const ACTIONS = [
  ['draft', 'Generate draft'],
  ['titles', 'Suggest titles'],
  ['excerpt', 'Generate excerpt'],
  ['improve', 'Improve grammar'],
  ['rewrite', 'Rewrite'],
  ['expand', 'Expand'],
  ['shorten', 'Shorten'],
  ['readability', 'Improve readability'],
  ['bullets', 'Convert bullets'],
  ['seo', 'Suggest SEO metadata'],
  ['slug', 'Suggest slug'],
  ['translate', 'Translate'],
  ['summary', 'Summarize'],
  ['faq', 'Suggest FAQs'],
  ['caption', 'Social caption'],
]

export default function AiContentStudio({ form, setForm, contentRef, canGenerate, canTranslate }) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState('draft')
  const [tone, setTone] = useState('Formal Government')
  const [facts, setFacts] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('English')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [selection, setSelection] = useState({ start: 0, end: 0, text: '' })
  const [copied, setCopied] = useState(false)
  const factsRef = useRef(null)

  const openPanel = () => {
    const node = contentRef?.current
    setSelection(node ? { start: node.selectionStart, end: node.selectionEnd, text: String(form.content || '').slice(node.selectionStart, node.selectionEnd) } : { start: 0, end: 0, text: '' })
    setFacts(form.title ? `${form.title}\n${form.excerpt || ''}\n${form.content ? form.content.replace(/<[^>]+>/g, ' ') : ''}`.trim() : '')
    setOpen(true)
  }

  useEffect(() => {
    if (open) requestAnimationFrame(() => factsRef.current?.focus())
  }, [open])

  const generate = async () => {
    if (!canGenerate && action !== 'translate') return
    if (!canTranslate && action === 'translate') return
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      const response = await apiFetch('/api/admin/ai/content/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          tone,
          facts,
          selectedText: selection.text,
          title: form.title,
          excerpt: form.excerpt,
          targetLanguage,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'AI content generation failed.')
      setResult(body)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    const text = result?.content || result?.output || result?.summary || result?.caption || result?.excerpt || ''
    await navigator.clipboard?.writeText(text)
    setCopied(true)
  }

  const appendContent = value => setForm(current => ({ ...current, ai_generation_id: result.generationId || current.ai_generation_id || '', content: `${current.content || ''}${current.content ? '\n' : ''}${value}` }))
  const insertDraft = () => {
    setForm(current => ({
      ...current,
      title: result.title || current.title,
      slug: result.slug || current.slug,
      excerpt: result.excerpt || current.excerpt,
      content: result.content || current.content,
      ai_generation_id: result.generationId || current.ai_generation_id || '',
    }))
  }
  const insertOutput = () => {
    if (action === 'titles') return setForm(current => ({ ...current, ai_generation_id: result.generationId || current.ai_generation_id || '', title: result.output || result.title || current.title }))
    if (action === 'excerpt') return setForm(current => ({ ...current, ai_generation_id: result.generationId || current.ai_generation_id || '', excerpt: result.output || result.excerpt || current.excerpt }))
    if (action === 'slug') return setForm(current => ({ ...current, ai_generation_id: result.generationId || current.ai_generation_id || '', slug: result.slug || result.output || current.slug }))
    appendContent(result.output || result.content || result.summary || '')
  }
  const replaceSelected = () => {
    if (!selection.text) return
    const value = result.output || result.content || ''
    setForm(current => ({
      ...current,
      ai_generation_id: result.generationId || current.ai_generation_id || '',
      content: `${current.content.slice(0, selection.start)}${value}${current.content.slice(selection.end)}`,
    }))
  }

  const actionAllowed = action === 'translate' ? canTranslate : canGenerate

  return (
    <>
      <button type="button" className="ai-assist-button" onClick={openPanel}><WandSparkles size={16} aria-hidden="true"/>AI Assist</button>
      {open && <ModalDialog onClose={() => setOpen(false)} label="AI Content Studio" size="large" themeClass="ai-content-modal">
        <div className="ai-content-studio">
          <aside className="ai-content-controls">
            <label>Action<select value={action} onChange={event => { setAction(event.target.value); setResult(null) }}>{ACTIONS.filter(([key]) => key !== 'translate' || canTranslate).filter(([key]) => key === 'translate' || canGenerate).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>Writing tone<select value={tone} onChange={event => setTone(event.target.value)}><option>Formal Government</option><option>Professional</option><option>Community-Friendly</option><option>Informative</option><option>Emergency Advisory</option><option>Public Announcement</option><option>Social Media</option></select></label>
            {action === 'translate' && <label>Target language<select value={targetLanguage} onChange={event => setTargetLanguage(event.target.value)}><option>English</option><option>Filipino / Tagalog</option><option>Cebuano / Bisaya</option></select></label>}
            <label>Verified details<textarea ref={factsRef} value={facts} maxLength={12000} onChange={event => setFacts(event.target.value)} placeholder="Enter only verified names, dates, locations, steps and source facts." /></label>
            {selection.text && <p className="ai-selection-note">Selected text: {selection.text.slice(0, 120)}{selection.text.length > 120 ? '…' : ''}</p>}
            <button type="button" className="ai-content-generate" disabled={!actionAllowed || busy || (!facts.trim() && !selection.text)} onClick={generate}>{busy ? <RefreshCw className="ai-spin" size={16}/> : <Sparkles size={16}/>} {busy ? 'Generating…' : 'Generate'}</button>
          </aside>
          <div className="ai-content-preview" aria-live="polite">
            {error && <div className="ai-content-error" role="alert">{error}</div>}
            {!result && !error && <div className="ai-content-empty"><WandSparkles size={28}/><p>Review the result before adding it to the draft.</p></div>}
            {result && <>
              <div className="ai-content-result">
                {result.title && <div><small>Title</small><h3>{result.title}</h3></div>}
                {result.excerpt && <div><small>Excerpt</small><p>{result.excerpt}</p></div>}
                {(result.output || result.summary || result.caption) && <div><small>Result</small><p>{result.output || result.summary || result.caption}</p></div>}
                {result.content && <div><small>Article content</small><div className="ai-content-html" dangerouslySetInnerHTML={{ __html: result.content }} /></div>}
              </div>
              <div className="ai-content-actions">
                {action === 'draft' ? <button type="button" onClick={insertDraft}><Check size={15}/>Insert draft</button> : <button type="button" onClick={insertOutput}>Insert output</button>}
                {selection.text && <button type="button" disabled={!result.output && !result.content} onClick={replaceSelected}>Replace selected text</button>}
                <button type="button" onClick={() => appendContent(result.output || result.content || result.summary || '')}>Append</button>
                <button type="button" onClick={copy}>{copied ? <Check size={15}/> : <Copy size={15}/>}{copied ? 'Copied' : 'Copy'}</button>
                <button type="button" onClick={generate} disabled={busy}><RefreshCw size={15}/>Regenerate</button>
                <button type="button" onClick={() => setResult(null)}><X size={15}/>Discard</button>
              </div>
            </>}
          </div>
        </div>
      </ModalDialog>}
    </>
  )
}
