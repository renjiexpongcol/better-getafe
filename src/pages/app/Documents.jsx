import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppPage from './AppPage'
import { DataState, DocumentRows } from '../../components/CitizenWidgets'
import { useCitizen } from '../../context/CitizenContext'
import './Documents.css'
export default function Documents() { return <AppPage title="My documents"><DocumentsContent/></AppPage> }
function DocumentsContent() {
  const { data, reload } = useCitizen(), [params] = useSearchParams()
  const [file, setFile] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const documents = (data?.documents || []).filter(item => !params.has('document') || item.id === params.get('document'))
  const applications = data?.applications || [], selectedApplicationId = params.get('sysparm_record_id') || params.get('application_id') || '', selectedApplication = applications.find(item => item.id === selectedApplicationId), showUpload = params.get('sysparm_view') === 'upload' || Boolean(selectedApplicationId)
  const upload = async event => {
    event.preventDefault()
    if (!file || !selectedApplication) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(`/api/citizen/documents?application_id=${encodeURIComponent(selectedApplication.id)}&name=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type, 'X-Requested-With': 'GetafeCitizenPortal' }, body: file })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'The document could not be uploaded.')
      setFile(null); setNotice('Document uploaded successfully. It is now available to the municipal office.'); await reload()
    } catch (uploadError) { setError(uploadError.message) } finally { setBusy(false) }
  }
  return <section className="citizen-panel"><div className="citizen-panel-head"><h2>Your document library</h2></div><p className="portal-muted">Issued documents and required files are labeled separately.</p>{showUpload && <div className="citizen-document-upload"><h3>Upload supporting document</h3><p className="portal-muted">Attach a PDF, JPEG, or PNG file smaller than 5 MB{selectedApplication ? ` for ${selectedApplication.service_name} (${selectedApplication.reference_number})` : '.'}</p>{selectedApplication ? <form onSubmit={upload}><label>Select file<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => { setFile(event.target.files?.[0] || null); setError(''); setNotice('') }} /></label>{error && <p className="portal-error" role="alert">{error}</p>}{notice && <p className="portal-success" role="status">{notice}</p>}<div className="portal-form-actions"><button className="citizen-primary" disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload document'}</button></div></form> : <p className="portal-error">Select an application before uploading a document.</p>}</div>}<DataState>{params.has('document') && !documents.length ? <p>Document not found.</p> : <DocumentRows items={documents}/>}</DataState></section>
}
