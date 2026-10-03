import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import AppPage from './AppPage';
import BusinessBillingPanel from '../../components/BusinessBillingPanel';
import DynamicApplication, { RequirementDocuments } from '../../components/DynamicApplication';
import { esApi, useEservice, Feedback, DynamicFields, Activity, label, date, money } from '../../components/EserviceUI';
import { publicStatus } from '../../data/serviceApplication';

export default function Erequest() {
  const { id } = useParams();
  const state = useEservice(() => esApi(`/requests/${id}`), [id]);
  const [tab, setTab] = useState('Application'), [submitted, setSubmitted] = useState(false);
  const request = state.data;
  const editable = request && ['DRAFT', 'NEEDS_INFORMATION'].includes(request.status);
  return <AppPage title={request?.service?.name || 'Application'}><main className="es-workspace">
    <Link to="/app/e-requests">My requests</Link>
    <Feedback error={state.error} loading={state.loading} />
    {request && <>
      <header className="es-request-heading"><div><p>{request.service.name}</p><h1>{request.request_number}</h1></div><span className="es-status">{request.public_status || publicStatus(request.status)}</span></header>
      {submitted && <section className="es-confirmation" role="status"><h2>Application submitted</h2><p>Your reference is <strong>{request.request_number}</strong>. You can track updates and messages here.</p><button onClick={() => { setSubmitted(false); setTab('Activity'); }}>Track request</button></section>}
      <dl className="es-metadata"><div><dt>Submitted</dt><dd>{date(request.submitted_at)}</dd></div>{request.due_at && <div><dt>Corrections due</dt><dd>{date(request.due_at)}</dd></div>}{request.appointment && <div><dt>Appointment</dt><dd>{date(request.appointment.appointment_at)} · {label(request.appointment.status)}</dd></div>}</dl>
      {request.business && <BusinessBillingPanel request={request} onRefresh={state.refresh} onApplication={() => setTab('Application')} />}
      {editable && <div hidden={tab !== 'Application'}><DynamicApplication key={id} request={request} onRefresh={state.refresh} onSubmitted={() => { setSubmitted(true); setTab('Activity'); }} /></div>}
      {(!editable || tab !== 'Application') && <>
        <nav className="es-tabs" aria-label="Request sections">{['Application', 'Documents', ...(request.payment_required || request.orders.length ? ['Payment'] : []), 'Messages', 'Activity'].map(name => <button className="es-secondary" key={name} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}>{name}</button>)}</nav>
        {tab === 'Application' && <DynamicFields fields={request.fields} values={request.values} disabled />}
        {tab === 'Documents' && <RequirementDocuments request={request} />}
        {tab === 'Payment' && <section>{request.orders.length ? request.orders.map(order => <p key={order.id}><Link to={`/app/e-payment/${order.id}`}>{order.order_number}</Link> · {money(order.amount)} · {label(order.status)}</p>) : <p>No assessment has been issued.</p>}</section>}
        {tab === 'Messages' && <section>{request.notes.length ? request.notes.map(note => <section className="es-section" key={note.id}><time>{date(note.created_at)}</time><p>{note.message}</p></section>) : <p>No messages yet.</p>}</section>}
        {tab === 'Activity' && <Activity history={request.history} />}
      </>}
      {editable && <nav className="es-toolbar" aria-label="Draft support">{tab !== 'Application' && <button className="es-secondary" onClick={() => setTab('Application')}>Continue application</button>}{tab !== 'Messages' && <button className="es-secondary" onClick={() => setTab('Messages')}>Office messages</button>}</nav>}
    </>}
  </main></AppPage>;
}
