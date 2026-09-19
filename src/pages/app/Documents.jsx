import { useSearchParams } from 'react-router-dom'
import AppPage from './AppPage'
import { DataState, DocumentRows } from '../../components/CitizenWidgets'
import { useCitizen } from '../../context/CitizenContext'
export default function Documents() { return <AppPage title="My documents"><DocumentsContent/></AppPage> }
function DocumentsContent() {
  const { data } = useCitizen(), [params] = useSearchParams()
  const documents = (data?.documents || []).filter(item => !params.has('document') || item.id === params.get('document'))
  return <section className="citizen-panel"><div className="citizen-panel-head"><h2>Your document library</h2></div><p className="portal-muted">Issued documents and required files are labeled separately.</p><DataState>{params.has('document') && !documents.length ? <p>Document not found.</p> : <DocumentRows items={documents}/>}</DataState></section>
}
