import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppPage from './AppPage'
import { AppointmentRows, DataState } from '../../components/CitizenWidgets'
import { useCitizen } from '../../context/CitizenContext'
import { citizenApi, upcomingAppointments } from '../../services/citizenData'
import { citizenServices } from '../../data/citizenServices'
export default function Appointments() { return <AppPage title="Appointments"><AppointmentsContent/></AppPage> }
function AppointmentsContent() {
  const { data, reload } = useCitizen(), [params, setParams] = useSearchParams(), [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const submit = async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); setMessage('')
    try { await citizenApi('/appointments', { method: 'POST', body: JSON.stringify({ service_id: form.get('service'), appointment_at: `${form.get('date')}:00+08:00` }) }); await reload(); setParams({}); setMessage('Your appointment request has been saved. Please wait for confirmation from the municipal office before visiting.') }
    catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  const upcoming = upcomingAppointments(data?.appointments || []), selected = params.get('appointment')
  const appointments = selected ? (data?.appointments || []).filter(item => item.id === selected) : upcoming
  return <>{message && <p className="portal-success" role="status">{message}</p>}<section className="citizen-panel"><div className="citizen-panel-head"><h2>{selected ? 'Appointment details' : 'Upcoming appointments'}</h2><button className="citizen-primary" onClick={() => setParams({ book: '1' })}>Request appointment</button></div><DataState>{selected && !appointments.length ? <p>Appointment not found.</p> : <AppointmentRows items={appointments}/>}</DataState></section>{params.has('book') && <form className="citizen-panel portal-form" style={{ marginTop: 20 }} onSubmit={submit}><h2>Schedule an appointment</h2><p className="portal-muted">Choose your preferred time in Philippine Standard Time. This is a request; the municipal office must confirm availability.</p><label>Service<select name="service" required>{citizenServices.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Preferred date and time (Philippines)<input type="datetime-local" name="date" required/></label>{error && <p className="portal-error" role="alert">{error}</p>}<button className="citizen-primary" disabled={busy}>{busy ? 'Saving…' : 'Request appointment'}</button></form>}</>
}
