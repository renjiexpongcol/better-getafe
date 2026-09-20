import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import AppPage from './AppPage'
import { Progress, Status, DocumentRows } from '../../components/CitizenWidgets'
import { citizenApi, dateLabel } from '../../services/citizenData'
import { useCitizen } from '../../context/CitizenContext'
export default function Application() { return <AppPage title="Application details"><Details/></AppPage> }
function Details() {
  const { id: routeId } = useParams(), [params] = useSearchParams(), id = routeId || params.get('sysparm_record_id'), { data } = useCitizen()
  const [item, setItem] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => { let active = true; setItem(null); setError(''); citizenApi(`/applications/${encodeURIComponent(id)}`).then(result => { if (active) setItem(result) }).catch(error => { if (active) setError(error.message) }); return () => { active = false } }, [id, retry])
  if (error) return <div className="portal-error" role="alert">{error}<button onClick={() => setRetry(value => value + 1)}>Try again</button></div>
  if (!item) return <p role="status">Loading application…</p>
  let details; try { details = JSON.parse(item.details) } catch { details = {} }
  return <>{params.has('submitted') && <div className="portal-success" role="status">Your request has been submitted. Keep reference {item.reference_number} for your records.</div>}<section className="citizen-panel"><div className="portal-detail-summary"><div><h2>{item.service_name}</h2><p>{item.reference_number}</p><p>{item.submitted_at ? `Submitted ${dateLabel(item.submitted_at)}` : `Updated ${dateLabel(item.last_updated)}`}</p></div><Status value={item.status}/></div><Progress status={item.status}/><p className="portal-details">{details.purpose || 'No additional request details.'}</p><div className="portal-form-actions"><Link className="citizen-primary" to={`/app?sysparm_object_id=documents&sysparm_record_id=${encodeURIComponent(id)}&sysparm_view=upload`}>Upload supporting document</Link><Link to="/app?sysparm_object_id=requests">All applications</Link></div></section><div className="citizen-lower"><section className="citizen-panel"><h2>Status history</h2><ol className="portal-activity">{item.history.map(event => <li key={event.id}><div><Status value={event.status}/><p>{event.note}</p><time>{dateLabel(event.created_at, { hour: 'numeric', minute: '2-digit' })}</time></div></li>)}</ol></section><section className="citizen-panel"><h2>Application documents</h2><DocumentRows items={(data?.documents || []).filter(document => document.application_id === id)}/></section></div></>
}
