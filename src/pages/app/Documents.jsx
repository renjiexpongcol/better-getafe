import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AppPage from './AppPage'
import { DataState, DocumentRows } from '../../components/CitizenWidgets'
import { useCitizen } from '../../context/CitizenContext'
export default function Documents() { return <AppPage title="My documents"><DocumentsContent/></AppPage> }
function DocumentsContent() {
  const { data, reload } = useCitizen(), [params] = useSearchParams(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const submit = async event => {
    event.preventDefault(); const form = event.currentTarget, values = new FormData(form), file = values.get('file'); setError(''); setMessage('')
    if (!file?.size || file.size > 5 * 1024 * 1024) { setError('Choose a PDF, JPEG or PNG smaller than 5 MB.'); return }
    setBusy(true)
    try { const response = await fetch(`/api/citizen/documents?application_id=${encodeURIComponent(values.get('application'))}&name=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type }, body: file }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Upload failed. Please try again.'); form.reset(); await reload(); setMessage('Document uploaded. The municipal office can now review it.') }
    catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  const documents = (data?.documents || []).filter(item => !params.has('document') || item.id === params.get('document'))
  return <>{message && <p className="portal-success" role="status">{message}</p>}<section className="citizen-panel"><div className="citizen-panel-head"><h2>Your document library</h2><Link to="/app/documents?upload=1">+ Upload Document</Link></div><p className="portal-muted">Issued documents, receipts and your uploads are labeled separately.</p><DataState>{params.has('document') && !documents.length ? <p>Document not found.</p> : <DocumentRows items={documents}/>}</DataState></section>{params.has('upload') && <section className="citizen-panel" style={{ marginTop: 20 }}><h2>Upload a supporting document</h2><DataState>{data?.applications?.length ? <form className="portal-form" onSubmit={submit}><p className="portal-muted">Attach your document to an application so the responsible office can review it. PDF, JPEG or PNG, up to 5 MB.</p><label>Application<select name="application" required defaultValue={params.get('application') || ''}><option value="" disabled>Select an application</option>{data.applications.map(item => <option key={item.id} value={item.id}>{item.service_name} · {item.reference_number}</option>)}</select></label><label>Document<input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required/></label>{error && <p className="portal-error" role="alert">{error}</p>}<button className="citizen-primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload document'}</button></form> : <p className="portal-muted">Start an application before uploading its requirements. <Link to="/app/services">Browse services →</Link></p>}</DataState></section>}</>
}
