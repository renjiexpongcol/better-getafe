import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import AppPage from '../app/AppPage'
import { useAuth } from '../../context/AuthContext'
import { useCitizen } from '../../context/CitizenContext'
import { citizenApi } from '../../services/citizenData'
import { citizenServices } from '../../data/citizenServices'
import { Plus } from 'lucide-react'
export default function RequestDocument() { return <AppPage title="New service request"><RequestForm/></AppPage> }
function RequestForm() {
  const [params] = useSearchParams(), navigate = useNavigate(), { user } = useAuth(), { data } = useCitizen()
  const [service, setService] = useState(params.get('service') || citizenServices[0].id), [purpose, setPurpose] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('')
    try { const result = await citizenApi('/applications', { method: 'POST', body: JSON.stringify({ service_name: service === 'concern' ? 'Report a Concern' : citizenServices.find(item => item.id === service)?.name, details: { purpose } }) }); navigate(`/app/requests/${result.id}?submitted=1`) }
    catch (error) { setError(error.message); setBusy(false) }
  }
  return <form className="citizen-panel portal-form" onSubmit={submit}><h2>{service === 'concern' ? 'Report a concern' : 'Request a municipal service'}</h2><p className="portal-muted">Your request will be sent for review. You can upload supporting documents after submitting and follow its progress in My Applications.</p><label>Service<select required value={service} onChange={event => setService(event.target.value)}>{citizenServices.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}<option value="concern">Report a Concern</option></select></label><div className="portal-form-grid"><label>Applicant<input value={data?.profile?.full_name || user.name} readOnly/></label><label>Email address<input value={user.email} readOnly/></label></div><label>{service === 'concern' ? 'Describe your concern and location' : 'Purpose and request details'}<textarea required maxLength={4000} value={purpose} onChange={event => setPurpose(event.target.value)} placeholder="Tell the municipal office what you need and include any relevant details."/></label>{service === 'concern' && <p className="portal-muted">This form is for non-emergency concerns and is not monitored for urgent assistance.</p>}{error && <p className="portal-error" role="alert">{error}</p>}<div className="portal-form-actions"><button className="citizen-primary" disabled={busy}><Plus size={16}/>{busy ? 'Submitting…' : 'Submit request'}</button><Link to="/app/services">Cancel</Link></div></form>
}
