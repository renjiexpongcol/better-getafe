import { useEffect, useId, useState } from 'react';
import { label } from './EserviceUI';

const actions = { RECEIVED: 'Receive request', IN_REVIEW: 'Start review', FOR_ASSESSMENT: 'Send for assessment', FOR_APPROVAL: 'Send for approval', APPROVED: 'Approve request', FOR_RELEASE: 'Mark ready for release', COMPLETED: 'Complete request', REJECTED: 'Reject request', CANCELLED: 'Cancel request' };

export function allowedRequestTransitions(request, can) {
  const step = request.steps?.find(step => step.status === request.status);
  return (step?.next_statuses || []).filter(status => {
    if (['AWAITING_PAYMENT', 'PAID', 'NEEDS_INFORMATION'].includes(status)) return false;
    const next = request.steps.find(next => next.status === status);
    return can(status === 'APPROVED' ? 'requests.department.approve' : 'requests.department.process') && (!next?.permission || can(next.permission));
  });
}

export default function StaffRequestProcessing({ request, options, can, user, busy, act, openTab }) {
  const controlId = useId();
  const [assigned, setAssigned] = useState(request.assigned_user_id || user.id);
  const [target, setTarget] = useState(''), [reason, setReason] = useState('');
  const transitions = allowedRequestTransitions(request, can);
  const validTarget = transitions.includes(target) ? target : '';
  const closed = ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(request.status);
  const submit = async event => {
    event.preventDefault();
    if (await act(validTarget === 'APPROVED' ? 'approve' : 'status', { status: validTarget, reason })) {
      setTarget(''); setReason('');
      if (validTarget === 'FOR_ASSESSMENT') openTab('Assessment & payment');
    }
  };
  const members = options.data?.members.filter(member => member.department_id === request.department_id) || [];
  useEffect(() => {
    if (options.loading || options.error) return;
    if (request.assigned_user_id && (members.some(member => member.user_id === request.assigned_user_id) || request.assigned_user_id === assigned)) return;
    if (members.some(member => member.user_id === assigned)) return;
    setAssigned(request.assigned_user_id || members[0]?.user_id || '');
  }, [options.loading, options.error, request.assigned_user_id, request.department_id, assigned, members]);
  return <aside className="staff-processing" aria-label="Request processing">
    <h2>Processing</h2>
    <p className="staff-processing-status">{label(request.status)}</p>
    {closed ? <p>This request is closed. Review its details and activity below.</p> : <>
      {['SUBMITTED', 'RECEIVED', 'IN_REVIEW', 'NEEDS_INFORMATION'].includes(request.status) && <p>Review the application and documents before choosing the next step.</p>}
      {request.status === 'PAID' && <p>Payment is verified. Check the receipt and proceed with the request.</p>}
      {request.status === 'FOR_ASSESSMENT' && <><p>{can('assessments.create') ? 'Review the charges and issue the payment order.' : 'Awaiting an authorized assessor.'}</p><button onClick={() => openTab('Assessment & payment')}>View assessment</button></>}
      {request.status === 'AWAITING_PAYMENT' && <><p>Awaiting payment and Treasury verification.</p><button onClick={() => openTab('Assessment & payment')}>View payment details</button></>}
      {transitions.length > 0 && <form onSubmit={submit} className="staff-processing-form">
        <div><label htmlFor={`${controlId}-status`}>Next status</label><select id={`${controlId}-status`} required value={validTarget} disabled={busy} onChange={event => setTarget(event.target.value)}><option value="">Choose next step</option>{transitions.map(status => <option key={status} value={status}>{actions[status] || label(status)}</option>)}</select></div>
        {validTarget && <div><label htmlFor={`${controlId}-reason`}>Reason{['REJECTED', 'CANCELLED'].includes(validTarget) ? ' (required)' : ' (optional)'}</label><textarea id={`${controlId}-reason`} rows={3} required={['REJECTED', 'CANCELLED'].includes(validTarget)} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></div>}
        <button disabled={busy || !validTarget}>{busy ? 'Saving…' : 'Update status'}</button>
      </form>}
      {!transitions.length && !['FOR_ASSESSMENT', 'AWAITING_PAYMENT'].includes(request.status) && <p>No status changes are available to your account at this stage.</p>}
      {can('requests.department.process') && request.steps?.find(step => step.status === request.status)?.next_statuses?.includes('NEEDS_INFORMATION') && <button className="es-secondary" onClick={() => openTab('Documents')}>Request applicant corrections</button>}
      {can('requests.department.assign') && <form className="staff-assignment" onSubmit={async event => {
        event.preventDefault(); await act('assign', { assigned_user_id: assigned });
      }}>
        <h3>Assignment</h3>
        {options.error && <p role="alert">Staff choices could not load. <button type="button" className="es-secondary" onClick={options.refresh}>Retry</button></p>}
        <div><label htmlFor={`${controlId}-assignment`}>Assigned staff</label><select id={`${controlId}-assignment`} value={assigned} disabled={busy || options.loading} onChange={event => setAssigned(event.target.value)}>
          {!members.some(member => member.user_id === user.id) && <option value={user.id}>Assign to me</option>}
          {request.assigned_user_id && !members.some(member => member.user_id === request.assigned_user_id) && request.assigned_user_id !== user.id && <option value={request.assigned_user_id}>{request.assigned_user_name || 'Current assignee'}</option>}
          {members.map(member => <option key={member.user_id} value={member.user_id}>{member.staff_label || 'Staff member'}</option>)}
        </select></div>
        <button className="es-secondary" disabled={busy || options.loading || Boolean(options.error) || assigned === request.assigned_user_id}>{assigned === user.id && !request.assigned_user_id ? 'Assign to me' : 'Save assignment'}</button>
      </form>}
    </>}
  </aside>;
}
