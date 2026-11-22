import { useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, Copy, ExternalLink, MessageCircle, Send, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { apiFetch } from '../services/apiTransport.js'
import './ResidentAiAssistant.css'

const copy = {
  en: { placeholder: 'Ask about a municipal service…', send: 'Send message', reset: 'New conversation', close: 'Close assistant', welcome: 'Ask me about Getafe municipal services and published information.', suggestions: ['How do I apply for a business permit?', 'Where can I find municipal services?', 'What are the latest announcements?'], sources: 'Official portal sources', contact: 'Contact the Municipality', helpful: 'Helpful', notHelpful: 'Not helpful', working: 'Checking published information…', unavailable: 'I can’t connect right now. Please try again or contact the Municipality.', privacy: 'AI responses can be incomplete. Do not enter personal or sensitive information.' },
  fil: { placeholder: 'Magtanong tungkol sa serbisyo ng munisipyo…', send: 'Ipadala', reset: 'Bagong usapan', close: 'Isara ang assistant', welcome: 'Magtanong tungkol sa mga serbisyo at impormasyong inilathala ng Getafe.', suggestions: ['Paano mag-apply para sa business permit?', 'Saan makikita ang mga serbisyo ng munisipyo?', 'Ano ang mga pinakabagong anunsyo?'], sources: 'Mga opisyal na sanggunian', contact: 'Makipag-ugnayan sa Munisipyo', helpful: 'Nakatulong', notHelpful: 'Hindi nakatulong', working: 'Sinusuri ang inilathalang impormasyon…', unavailable: 'Hindi ako makakonekta ngayon. Subukan ulit o makipag-ugnayan sa Munisipyo.', privacy: 'Maaaring hindi kumpleto ang sagot ng AI. Huwag maglagay ng personal o sensitibong impormasyon.' },
  ceb: { placeholder: 'Pangutana bahin sa serbisyo sa munisipyo…', send: 'Ipadala', reset: 'Bag-ong panag-istorya', close: 'Sirad-i ang assistant', welcome: 'Pangutana bahin sa mga serbisyo ug gipatik nga impormasyon sa Getafe.', suggestions: ['Unsaon pag-apply og business permit?', 'Asa makita ang mga serbisyo sa munisipyo?', 'Unsa ang pinakabag-ong mga pahibalo?'], sources: 'Opisyal nga mga tinubdan', contact: 'Kontaka ang Munisipyo', helpful: 'Makatabang', notHelpful: 'Dili makatabang', working: 'Gisusi ang gipatik nga impormasyon…', unavailable: 'Dili ko makakonekta karon. Sulayi pag-usab o kontaka ang Munisipyo.', privacy: 'Mahimong dili kompleto ang tubag sa AI. Ayaw pagbutang og personal o sensitibong impormasyon.' },
}

function initialLanguage() {
  const value = String(navigator.language || '').toLowerCase()
  return value.startsWith('fil') || value.startsWith('tl') ? 'fil' : value.startsWith('ceb') ? 'ceb' : 'en'
}

function availableLanguages(values = []) {
  const names = values.map(value => String(value).toLowerCase())
  return [
    ...(names.some(value => /english|^en$/.test(value)) ? ['en'] : []),
    ...(names.some(value => /filipino|tagalog|^fil$/.test(value)) ? ['fil'] : []),
    ...(names.some(value => /cebuano|bisaya|^ceb$/.test(value)) ? ['ceb'] : []),
  ]
}

function parseFrames(buffer, onEvent) {
  const frames = buffer.split('\n\n')
  for (const frame of frames.slice(0, -1)) {
    let event = 'message'
    const data = []
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      if (line.startsWith('data:')) data.push(line.slice(5).trim())
    }
    if (data.length) { try { onEvent(event, JSON.parse(data.join('\n'))) } catch { /* Ignore malformed stream frames. */ } }
  }
  return frames.at(-1) || ''
}

export default function ResidentAiAssistant() {
  const [config, setConfig] = useState(null)
  const [language, setLanguage] = useState(initialLanguage)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const panelRef = useRef(null)
  const inputRef = useRef(null)
  const launcherRef = useRef(null)
  const abortRef = useRef(null)
  const labels = copy[language]

  useEffect(() => {
    let active = true
    apiFetch('/api/ai/assistant/config', { timeoutMs: 5000 }).then(async response => {
      const body = await response.json().catch(() => ({}))
      if (active && response.ok && body.enabled) setConfig(body)
    }).catch(() => {})
    return () => { active = false; abortRef.current?.abort() }
  }, [])

  useEffect(() => {
    if (!config) return
    const offered = availableLanguages(config.supportedLanguages)
    if (offered.length && !offered.includes(language)) setLanguage(offered[0])
  }, [config, language])

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    const escape = event => { if (event.key === 'Escape') { setOpen(false); launcherRef.current?.focus() } }
    window.addEventListener('keydown', escape)
    return () => { clearTimeout(timer); window.removeEventListener('keydown', escape) }
  }, [open])

  useEffect(() => {
    if (open && panelRef.current) panelRef.current.scrollTop = panelRef.current.scrollHeight
  }, [messages, open])

  if (!config?.enabled) return null

  const updateMessage = (id, updater) => setMessages(current => current.map(item => item.id === id ? updater(item) : item))
  const submit = async value => {
    const question = String(value ?? message).trim()
    if (!question || streaming) return
    const history = messages.slice(-16).map(item => ({ role: item.role, content: item.text }))
    setMessage(''); setError(''); setOpen(true)
    const userMessage = { id: crypto.randomUUID(), role: 'user', text: question }
    const assistantMessage = { id: crypto.randomUUID(), role: 'assistant', text: '', sources: [], requestId: null, rating: null }
    setMessages(current => [...current, userMessage, assistantMessage])
    setStreaming(true)
    const controller = new AbortController(); abortRef.current = controller
    try {
      const response = await apiFetch('/api/ai/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ question, language, history }), signal: controller.signal, timeoutMs: 60000 })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || labels.unavailable)
      }
      if (!response.body) throw new Error(labels.unavailable)
      const reader = response.body.getReader()
      const decoder = new window.TextDecoder()
      let buffer = ''
      let receivedText = ''
      const onEvent = (event, data) => {
        if (event === 'delta' && typeof data.text === 'string') { receivedText += data.text; updateMessage(assistantMessage.id, item => ({ ...item, text: item.text + data.text })) }
        if (event === 'replace' && typeof data.text === 'string') { receivedText = data.text; updateMessage(assistantMessage.id, item => ({ ...item, text: data.text })) }
        if (event === 'meta' && data.requestId) updateMessage(assistantMessage.id, item => ({ ...item, requestId: data.requestId }))
        if (event === 'sources' && Array.isArray(data)) updateMessage(assistantMessage.id, item => ({ ...item, sources: data }))
        if (event === 'error') setError(data.error || labels.unavailable)
      }
      while (true) {
        const { value: chunk, done } = await reader.read()
        buffer += decoder.decode(chunk || new Uint8Array(), { stream: !done })
        buffer = parseFrames(buffer, onEvent)
        if (done) break
      }
      const tail = buffer.trim()
      if (tail.startsWith('event:')) parseFrames(`${tail}\n\n`, onEvent)
      if (!receivedText) updateMessage(assistantMessage.id, item => ({ ...item, text: labels.unavailable }))
    } catch (requestError) {
      if (requestError?.name !== 'AbortError') {
        setError(requestError.message || labels.unavailable)
        updateMessage(assistantMessage.id, item => ({ ...item, text: labels.unavailable }))
      }
    } finally { setStreaming(false); abortRef.current = null; inputRef.current?.focus() }
  }

  const reset = () => { abortRef.current?.abort(); setMessages([]); setError(''); setStreaming(false); setMessage(''); inputRef.current?.focus() }
  const rate = async (item, rating) => {
    if (!item.requestId || item.rating) return
    updateMessage(item.id, current => ({ ...current, rating }))
    try { await apiFetch('/api/ai/assistant/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: item.requestId, rating }) }) } catch { /* Feedback is optional and must not interrupt the chat. */ }
  }
  const welcome = language === 'en' ? config.welcomeMessage || labels.welcome : labels.welcome
  const suggestions = language === 'en' ? config.suggestedQuestions : labels.suggestions

  return <>
    {open && <section id="resident-ai-panel" className="resident-ai-panel" role="dialog" aria-modal="false" aria-labelledby="resident-ai-title">
      <header className="resident-ai-header"><span className="resident-ai-avatar"><Bot size={22}/></span><div className="resident-ai-heading"><strong id="resident-ai-title">{config.assistantName || 'Getafe AI Assistant'}</strong><small><ShieldCheck size={13}/> Verified portal information</small></div>
        <label className="resident-ai-language"><span className="sr-only">Response language</span><select value={language} onChange={event => setLanguage(event.target.value)} aria-label="Response language">{availableLanguages(config.supportedLanguages).map(code => <option value={code} key={code}>{code === 'en' ? 'English' : code === 'fil' ? 'Filipino' : 'Cebuano'}</option>)}</select></label>
        <button type="button" className="resident-ai-icon-button" aria-label={labels.reset} title={labels.reset} onClick={reset}><Sparkles size={17}/></button>
        <button type="button" className="resident-ai-icon-button" aria-label={labels.close} onClick={() => { setOpen(false); launcherRef.current?.focus() }}><X size={19}/></button>
      </header>
      <div className="resident-ai-messages" ref={panelRef} aria-live="polite">
        {!messages.length && <div className="resident-ai-welcome"><span className="resident-ai-welcome-icon"><Sparkles size={20}/></span><p>{welcome}</p><small>Answers are based on currently published portal information.</small>
          {!!suggestions?.length && <div className="resident-ai-suggestions">{suggestions.slice(0, 4).map(question => <button type="button" key={question} disabled={streaming} onClick={() => submit(question)}>{question}</button>)}</div>}
        </div>}
        {messages.map(item => <article className={`resident-ai-message ${item.role}`} key={item.id}>
          {item.role === 'assistant' && <span className="resident-ai-message-avatar"><Bot size={15}/></span>}
          <div className="resident-ai-bubble">{item.text ? <p>{item.text}</p> : streaming && item === messages.at(-1) ? <p className="resident-ai-thinking"><span className="resident-ai-dots"/> {labels.working}</p> : null}
            {!!item.sources?.length && <div className="resident-ai-sources"><strong>{labels.sources}</strong>{item.sources.map((source, index) => <a href={source.url} key={`${source.url}-${index}`}><span>[{index + 1}] {source.title}</span><ExternalLink size={13}/></a>)}</div>}
            {item.role === 'assistant' && !!item.text && <div className="resident-ai-actions"><button type="button" aria-label="Copy response" title="Copy response" onClick={() => navigator.clipboard?.writeText(item.text)}><Copy size={14}/><span>Copy</span></button>{item.requestId && <><button type="button" aria-label={labels.helpful} title={labels.helpful} aria-pressed={item.rating === 'helpful'} disabled={Boolean(item.rating) || streaming} onClick={() => rate(item, 'helpful')}><ThumbsUp size={14}/></button><button type="button" aria-label={labels.notHelpful} title={labels.notHelpful} aria-pressed={item.rating === 'not_helpful'} disabled={Boolean(item.rating) || streaming} onClick={() => rate(item, 'not_helpful')}><ThumbsDown size={14}/></button></>}</div>}
          </div>
        </article>)}
        {error && <div className="resident-ai-error" role="alert">{error}<a href="/contact">{labels.contact}</a></div>}
      </div>
      <div className="resident-ai-handoff"><span>Need a staff member?</span><a href="/contact">{labels.contact} <ExternalLink size={13}/></a></div>
      <form className="resident-ai-compose" onSubmit={event => { event.preventDefault(); submit() }}>
        <textarea ref={inputRef} value={message} onChange={event => setMessage(event.target.value)} placeholder={copy[language].placeholder} maxLength={1200} rows={1} aria-label={copy[language].placeholder} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }}/>
        <button type="submit" disabled={!message.trim() || streaming} aria-label={copy[language].send} title={copy[language].send}>{streaming ? <span className="resident-ai-spinner"/> : <Send size={17}/>}</button>
      </form>
      <footer className="resident-ai-disclaimer">{labels.privacy}</footer>
    </section>}
    <button ref={launcherRef} type="button" className={`resident-ai-launcher ${open ? 'is-open' : ''}`} aria-label={open ? labels.close : `Open ${config.assistantName || 'Getafe AI Assistant'}`} aria-expanded={open} aria-controls="resident-ai-panel" onClick={() => setOpen(value => !value)}>
      {open ? <ChevronDown size={22}/> : <MessageCircle size={22}/>}<span>{open ? 'Close' : 'Ask Getafe AI'}</span>
    </button>
  </>
}
