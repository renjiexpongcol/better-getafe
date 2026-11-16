import ResourceOptionsStatus from '../../components/ResourceOptionsStatus'
import AppointmentFields, { appointmentContact, appointmentIssue } from '../../components/AppointmentFields'
import ModalDialog from '../../components/ModalDialog'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import AppPage from './AppPage'
import { AppointmentRows, DataState } from '../../components/CitizenWidgets'
import { useCitizen } from '../../context/CitizenContext'
import { citizenApi, upcomingAppointments } from '../../services/citizenData'
import { usePublicResource } from '../../hooks/usePublicResource'
import { useBarangays } from '../../hooks/usePublicResource'
import { formatResidentDate, formatResidentTime } from '../../services/residentPreferences'

const fullDate = value => formatResidentDate(new Date(`${value}T12:00:00+08:00`), { weekday: 'long' })
const displayTime = value => formatResidentTime(new Date(`2026-01-01T${value}:00+08:00`))
export default function Appointments() { return <AppPage title="Appointments"><AppointmentsContent/></AppPage> }
function AppointmentsContent() {
  const barangayResource = useBarangays()
  const barangays = barangayResource.items
  const catalog = usePublicResource('/services')
  const citizenServices = catalog.data?.items || []
  const submitRef = useRef(false)
  const [availabilityRevision, setAvailabilityRevision] = useState(0)
  const [attempted, setAttempted] = useState(false), contactEdited = useRef(false)
  const { data, reload } = useCitizen(), [params, setParams] = useSearchParams(), [serviceId, setServiceId] = useState(''), [barangayId, setBarangayId] = useState(''), [availability, setAvailability] = useState(null), [date, setDate] = useState(''), [time, setTime] = useState(''), [reason, setReason] = useState(''), [contact, setContact] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  useEffect(() => { if (!serviceId && catalog.data?.items?.length) setServiceId(catalog.data.items[0].id) }, [serviceId, catalog.data])
  useEffect(() => { if (!barangayId && data?.profile?.barangay) setBarangayId(barangays.find(item => item.name === data.profile.barangay)?.id || '') }, [data, barangayId, barangays])
  useEffect(() => { if (!contactEdited.current && data?.profile?.mobile) setContact(data.profile.mobile) }, [data])
  useEffect(() => { if (!params.has('book') || !serviceId) return; let active = true; setError(''); setAvailability(null); setDate(''); setTime(''); citizenApi(`/appointments/availability?service_id=${encodeURIComponent(serviceId)}`).then(value => { if (active) { setAvailability(value);  } }).catch(issue => active && setError(issue.message)); return () => { active = false } }, [params, serviceId, availabilityRevision])
  useEffect(() => { if (!date) return; let active = true; setAvailability(null); setError(''); citizenApi(`/appointments/availability?service_id=${encodeURIComponent(serviceId)}`).then(value => { if (active) setAvailability(value) }).catch(issue => active && setError(issue.message)); return () => { active = false } }, [date, serviceId])
  const service = citizenServices.find(item => item.id === serviceId)
  const submit = async event => { event.preventDefault(); if (submitRef.current) return; setAttempted(true); const issue = appointmentIssue({ date, time, reason, contact }, availability); if (issue) { setError(issue); return; } submitRef.current = true; setBusy(true); setError(''); try { const result = await citizenApi('/appointments', { method: 'POST', body: JSON.stringify({ service_id: serviceId, barangay_id: barangayId, appointment_at: `${date}T${time}:00+08:00`, reason, contact_number: appointmentContact(contact) }) }); await reload(); setParams({}); setMessage(`Appointment request submitted. Reference: ${result.reference_number}. Your selected time is pending confirmation.`) } catch (issue) { setError(issue.message); if (issue.status === 409) { setDate(''); setTime(''); setAvailability(null); try { setAvailability(await citizenApi(`/appointments/availability?service_id=${encodeURIComponent(serviceId)}`)) } catch (refreshIssue) { setError(refreshIssue.message) } } } finally { submitRef.current = false; setBusy(false) } }
  const upcoming = upcomingAppointments(data?.appointments || [])
  return <>{message && <p className="portal-success" role="status">{message}</p>}<section className="citizen-panel"><div className="citizen-panel-head"><h2>Upcoming appointments</h2><button className="citizen-primary" onClick={() => setParams({ book: '1' })}>Request appointment</button></div><DataState><AppointmentRows items={upcoming}/></DataState></section>{params.has('book') && <ModalDialog labelledBy={'appointment-title'} backdropClass="portal-action-backdrop" busy={busy} onClose={() => setParams({})}><form className="portal-action-modal portal-appointment-scheduler" onSubmit={submit}><button type="button" className="portal-action-close" aria-label="Close dialog" onClick={() => setParams({})} disabled={busy} data-icon-button="ghost"><X size={18}/></button><h2 id="appointment-title">Schedule an appointment</h2><ResourceOptionsStatus resource={catalog} label="Services" /><ResourceOptionsStatus resource={barangayResource} label="Barangays" /><p>Choose a service, barangay, available date, and time slot.</p><div className="portal-scheduler-selects"><label>Service<select disabled={busy} value={serviceId} onChange={event => setServiceId(event.target.value)}>{citizenServices.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Barangay<select disabled={busy} required value={barangayId} onChange={event => setBarangayId(event.target.value)}><option value="">Select a barangay</option>{barangays.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div><AppointmentFields value={{ date, time, contact, reason }} onChange={next => { setDate(next.date); setTime(next.time); setReason(next.reason); if (next.contact !== contact) contactEdited.current = true; setContact(next.contact); }} availability={availability} disabled={busy} attempted={attempted} loading={!availability && !error} error={!availability ? error : ''} onRetry={() => setAvailabilityRevision(value => value + 1)}/>{date && time && <div className="portal-appointment-summary"><strong>Appointment summary</strong><span>{service?.name} · {fullDate(date)} · {displayTime(time)}</span></div>}{error && availability && <p className="portal-error" role="alert">{error}</p>}<button className="citizen-primary" disabled={busy || !barangayId || !date || !time || !reason || !contact}>{busy ? 'Reserving slot…' : 'Request appointment'}</button></form></ModalDialog>}</>
}
