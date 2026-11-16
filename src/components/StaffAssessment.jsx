import { useEffect, useState } from 'react';
import { esApi, OrderView, label, money } from './EserviceUI';
import { allowedRequestTransitions } from './StaffRequestProcessing';

export default function StaffAssessment({ request, can, busy, act, refresh }) {
  const [due, setDue] = useState(''), [period, setPeriod] = useState(''), [codes, setCodes] = useState([]), [reason, setReason] = useState('');
  const [selected, setSelected] = useState(''), [revision, setRevision] = useState(0);
  const [orderState, setOrderState] = useState({ loading: false, error: '', data: null });
  const orders = request.orders || [], fees = request.fees || [];
  const orderId = orders.some(order => order.id === selected) ? selected : orders.at(-1)?.id;
  const viewPayments = can('payments.view');
  const canSend = allowedRequestTransitions(request, can).includes('FOR_ASSESSMENT');
  const create = request.status === 'FOR_ASSESSMENT' && can('assessments.create');

  useEffect(() => {
    if (!orderId || !viewPayments) return;
    let active = true;
    setOrderState({ loading: true, error: '', data: null });
    esApi(`/staff/eservices/payment-orders/${orderId}`).then(data => {
      if (active) setOrderState({ loading: false, error: '', data });
    }).catch(error => {
      if (active) setOrderState({ loading: false, error: error.message, data: null });
    });
    return () => { active = false; };
  }, [orderId, viewPayments, revision, request.version]);

  return <section aria-label="Assessment and payment details">
    <h2>Assessment</h2>
    {!orders.length && <>
      <h3>No assessment issued yet</h3>
      <p>{request.status === 'FOR_ASSESSMENT'
        ? (can('assessments.create') ? 'Ready for assessment. Review the configured charges before issuing a payment order.' : 'Awaiting an authorized assessor. Your account cannot issue assessments.')
        : ['REJECTED', 'CANCELLED', 'COMPLETED'].includes(request.status)
          ? `This request is ${label(request.status).toLowerCase()} and has no payment order.`
          : 'The request must reach For assessment before a payment order can be issued.'}</p>
      {canSend && <button disabled={busy} onClick={() => act('status', { status: 'FOR_ASSESSMENT', reason: 'Ready for assessment' })}>Send for assessment</button>}
    </>}
    {!orders.length && !create && <section className="es-section">
      <h3>Configured charges</h3>
      {fees.length ? <><p>Charges are confirmed when the assessment is issued.</p><ul>{fees.map(fee => <li key={fee.code}>{fee.description} · {fee.fee_type === 'CREDIT' ? 'Credit · ' : ''}{money(fee.amount)}</li>)}</ul></>
        : <p>No charges are configured for this request. Contact the service administrator if payment is required.</p>}
    </section>}
    {create && <form className="es-form es-section" onSubmit={event => {
      event.preventDefault();
      act('assessment', { fee_codes: codes, billing_period: period, due_at: due ? `${due}+08:00` : null });
    }}>
      <label>Assessment due date<input type="datetime-local" value={due} onChange={event => setDue(event.target.value)} /></label>
      <label>Billing period<input maxLength={100} value={period} onChange={event => setPeriod(event.target.value)} placeholder="e.g. Q4 2026" /></label>
      <fieldset className="es-actions"><legend>Applicable configured charges</legend>
        {fees.length ? fees.map(fee => <label key={fee.code}>{request.business && <input type="checkbox" checked={codes.includes(fee.code)} onChange={event => setCodes(event.target.checked ? [...codes, fee.code] : codes.filter(code => code !== fee.code))} />} {fee.description} · {fee.fee_type === 'CREDIT' ? 'Credit · ' : ''}{money(fee.amount)}</label>) : <p>No authorized fees are configured. Contact the service administrator.</p>}
      </fieldset>
      <div className="es-actions"><button disabled={busy || !fees.length || (Boolean(request.business) && !codes.length)}>Issue assessment and payment order</button></div>
    </form>}
    {orders.length > 0 && <>
      <h3>Payment orders</h3>
      {orders.map(order => <p key={order.id}>{viewPayments ? <button className="es-secondary" aria-pressed={orderId === order.id} onClick={() => setSelected(order.id)}>{order.order_number} · {label(order.status)} · {money(order.amount)}</button> : <span>{order.order_number} · {label(order.status)} · {money(order.amount)}</span>}</p>)}
      {!viewPayments && <p>Your account cannot view payment details. Contact an authorized payments officer.</p>}
      {viewPayments && orderState.loading && <p role="status">Loading assessment and payment details…</p>}
      {viewPayments && orderState.error && <div role="alert"><p>{orderState.error}</p><button className="es-secondary" onClick={() => setRevision(value => value + 1)}>Retry payment details</button></div>}
      {viewPayments && orderState.data?.id === orderId && <OrderView key={orderId} order={orderState.data} staff={can('payments.verify')} onRefresh={async () => { setRevision(value => value + 1); await refresh(); }} />}
    </>}
    {can('assessments.adjust') && request.status === 'AWAITING_PAYMENT' && <form className="es-section" onSubmit={event => { event.preventDefault(); act('adjust-assessment', { reason }); }}>
      <label>Reason for applying the current authorized fee schedule<textarea required value={reason} onChange={event => setReason(event.target.value)} /></label>
      <button disabled={busy || !reason.trim()}>Replace unpaid assessment</button>
    </form>}
  </section>;
}
