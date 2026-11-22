import { useDataRevision } from '../hooks/usePublicResource'
import { useCallback, useEffect, useState } from 'react'
import { requestJson } from '../services/apiTransport'
import { Button, EmptyState, ErrorState, Field, LoadingState, PageHeader } from './ui/Primitives'
import { useAuth } from '../context/AuthContext'
import AiContentStudio from './AiContentStudio'
import './AdminPublicContent.css'

const templates = {
  page: { title: '', subtitle: '', body: '', sections: [] },
  hotlines: { emergency: { number: '', label: '', tel: '' }, items: [], quickDial: [], tips: [] },
  navigation: { menus: [], explore: [], government: [], judiciary: [], social: [] },
  actions: { items: [] },
  home: { title: '', description: '', image: '', mayorMessage: '', aboutTitle: '', aboutBody: '', helpTitle: '', helpBody: '' },
  help: { items: [] },
}
const rows = {
  items: { id: '', name: '', category: '', description: '', numbers: [], icon: 'Phone', urgent: false },
  services: { name: '', desc: '', requirements: [] },
  steps: { n: 1, text: '' },
  related: { name: '', desc: '', url: '', email: '', img: '' },
  sections: { title: '', body: '' },
  quickDial: { number: '', name: '', note: '', tel: '' },
  tips: { title: '', text: '', icon: 'Info' },
  menus: { key: '', label: '', items: [] },
  explore: { name: '', url: '' }, government: { name: '', url: '' }, judiciary: { name: '', url: '' }, social: { name: '', url: '' },
}
const label = value => value.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ').replace(/^./, character => character.toUpperCase())
function ContentFields({ value, onChange, name = 'Content', kind, path = '' }) {
  if (Array.isArray(value)) {
    const key = path.split('.').at(-1)
    let template = rows[key] || ''
    if (key === 'items' && kind === 'actions') template = { title: '', description: '', url: '', icon: 'FileText' }
    if (key === 'items' && kind === 'help') template = { title: '', body: '' }
    if (key === 'items' && kind === 'navigation') template = { name: '', url: '', description: '', icon: 'Info' }
    return <fieldset className="ui-form-section"><legend>{name}</legend>{value.map((item, index) => <div key={index} className="managed-content-row"><ContentFields kind={kind} name={`${name} ${index + 1}`} value={item} path={`${path}.${index}`} onChange={next => onChange(value.map((existing, offset) => offset === index ? next : existing))} /><Button variant="outline" onClick={() => onChange(value.filter((_, offset) => offset !== index))}>Remove item</Button></div>)}<Button variant="outline" onClick={() => onChange([...value, structuredClone(template)])}>Add item</Button></fieldset>
  }
  if (value && typeof value === 'object') return <div className="ui-form-grid">{Object.entries(value).map(([key, item]) => <ContentFields kind={kind} name={label(key)} path={`${path}.${key}`} value={item} key={key} onChange={next => onChange({ ...value, [key]: next })} />)}</div>
  return <Field label={name}>{typeof value === 'boolean' ? <select value={String(value)} onChange={event => onChange(event.target.value === 'true')}><option value="true">Yes</option><option value="false">No</option></select> : <textarea rows={['body','description','text'].includes(path.split('.').at(-1)) ? 5 : 1} value={value ?? ''} onChange={event => onChange(typeof value === 'number' ? Number(event.target.value) : event.target.value)} />}</Field>
}
export default function AdminPublicContent() {
  const { user } = useAuth()
  const dataRevision = useDataRevision()
  const [items, setItems] = useState([]), [record, setRecord] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const load = useCallback(async () => { setLoading(true); setError(''); try { setItems((await requestJson('/admin/public-content')).items) } catch (issue) { setError(issue.message) } finally { setLoading(false) } }, [])
  useEffect(() => { load() }, [load, dataRevision])
  const open = async key => { setError(''); try { setRecord((await requestJson(`/admin/public-content/${encodeURIComponent(key)}`)).item) } catch (issue) { setError(issue.message) } }
  const save = async event => { event.preventDefault(); setBusy(true); setError(''); try { const { key, updated_at, ...data } = record; const result = await requestJson(`/admin/public-content/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(data) }); setRecord(result.item); setMessage('Content saved. Published changes are available to visitors.'); await load() } catch (issue) { setError(issue.message) } finally { setBusy(false) } }
  return <section className="citizen-panel managed-content"><PageHeader title="Public content" description="Maintain published pages, hotline contacts, navigation, and public information." actions={<Button onClick={() => { setRecord({ key: '', title: '', kind: 'page', published: false, version: 0, content: structuredClone(templates.page) }); setMessage('') }}>New content</Button>} />
    {error && <ErrorState message={error} onRetry={load} />}{message && <p role="status">{message}</p>}
    {record ? <form onSubmit={save}><fieldset disabled={busy} className="ui-form-section"><div className="ui-form-grid"><Field label="Content identifier" hint="Use the identifier assigned to the page, such as hotlines or page-history."><input required pattern="[a-z0-9][a-z0-9-]{0,119}" readOnly={record.version > 0} value={record.key} onChange={event => setRecord({ ...record, key: event.target.value })} /></Field><Field label="Title"><input required value={record.title} onChange={event => setRecord({ ...record, title: event.target.value })} /></Field><Field label="Content type"><select disabled={record.version > 0} value={record.kind} onChange={event => setRecord({ ...record, kind: event.target.value, content: structuredClone(templates[event.target.value]) })}>{Object.keys(templates).map(kind => <option key={kind} value={kind}>{label(kind)}</option>)}</select></Field><Field label="Publishing"><select value={String(record.published)} onChange={event => setRecord({ ...record, published: event.target.value === 'true' })}><option value="false">Draft</option><option value="true">Published</option></select></Field></div>{['page','help'].includes(record.kind) && (user?.permissions?.includes('ai.content.generate') || user?.permissions?.includes('ai.content.translate')) && <AiContentStudio contentType={record.kind === 'help' ? 'official FAQ' : 'public information page'} defaultAction={record.kind === 'help' ? 'faq' : 'draft'} allowedActions={record.kind === 'help' ? ['faq'] : undefined} canGenerate={user?.permissions?.includes('ai.content.generate')} canTranslate={user?.permissions?.includes('ai.content.translate')} form={{ title: record.title || '', slug: record.key || '', excerpt: record.content?.subtitle || '', content: record.kind === 'page' ? record.content?.body || '' : JSON.stringify(record.content?.items || []) }} setForm={update => setRecord(current => { const prior = { title: current.title || '', slug: current.key || '', excerpt: current.content?.subtitle || '', content: current.kind === 'page' ? current.content?.body || '' : JSON.stringify(current.content?.items || []) }; const next = typeof update === 'function' ? update(prior) : update; return { ...current, title: next.title, ai_generation_id: next.ai_generation_id || current.ai_generation_id, ...(current.kind === 'page' ? { content: { ...current.content, subtitle: next.excerpt, body: next.content } } : {}) } })} onFaqSuggestions={suggestions => setRecord(current => ({ ...current, content: { ...current.content, items: [...(current.content?.items || []), ...suggestions.map(title => ({ title: String(title).slice(0, 500), body: '' }))] } }))} />}<ContentFields kind={record.kind} value={record.content} onChange={content => setRecord({ ...record, content })} /><Button type="submit" busy={busy}>Save content</Button> <Button variant="outline" onClick={() => setRecord(null)}>Close editor</Button></fieldset></form> : loading ? <LoadingState /> : items.length ? <div className="managed-content-list">{items.map(item => <div className="managed-content-item" key={item.key}><strong>{item.title}</strong><span className={item.published ? 'is-published' : 'is-draft'}>{item.published ? 'Published' : 'Draft'}</span><Button variant="outline" onClick={() => open(item.key)}>Edit</Button></div>)}</div> : <EmptyState title="No content records yet" description="Create content or import existing information for review." />}
  </section>
}
