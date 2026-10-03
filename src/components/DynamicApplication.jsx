import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { applicationSections } from '../data/serviceApplication';
import { esApi, DynamicFields, Feedback, uploadDocument, money, date, label } from './EserviceUI';

export function RequirementDocuments({ request, editable, busy, upload }) {
  return <section className="es-section"><h2>Requirements and documents</h2>
    {request.requirements.length ? request.requirements.map(requirement => {
      const documents = request.documents.filter(document => document.requirement_id === requirement.id);
      const current = documents.find(document => !documents.some(next => next.replaces_id === document.id));
      return <div className="es-document-row" key={requirement.id}><div><h3>{requirement.label}{requirement.required ? ' *' : ' (optional)'}</h3>{requirement.help_text && <p>{requirement.help_text}</p>}
        {current && <p><a href={`/api/requests/${request.id}/documents/${current.id}`} target="_blank" rel="noreferrer">{current.original_filename}</a> · {label(current.status)}{current.review_reason && ` · ${current.review_reason}`}</p>}</div>
        {editable && <label>{current ? 'Replace document' : 'Upload document'}<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={event => { upload(requirement, event.target.files[0], current); event.target.value = ''; }} /></label>}</div>;
    }) : <p>No attachments are required.</p>}
    {editable && request.requirements.length > 0 && <small>PDF, PNG or JPEG. Maximum 10 MB per document.</small>}
  </section>;
}
export default function DynamicApplication({ request, onRefresh, onSubmitted }) {
  const navigate = useNavigate();
  const [values, setValues] = useState(request.values || {});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [declaration, setDeclaration] = useState(false), [dirty, setDirty] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [appointment, setAppointment] = useState(request.draft_context?.appointment || { date: '', time: '', reason: '', contact: request.applicant_snapshot?.mobile || '' });
  const form = useRef(null), version = useRef(request.version), heading = useRef(null);
  const groups = applicationSections(request.fields);
  const sections = [{ name: 'Applicant information', fields: groups.find(group => group.name === 'Applicant information')?.fields || [] }, { name: 'Documents', documents: true }, ...groups.filter(group => group.name !== 'Applicant information'), ...(request.status === 'DRAFT' && request.settings_snapshot?.appointment_required ? [{ name: 'Appointment', appointment: true }] : []), { name: 'Review', review: true }];
  const [step, setStep] = useState(Math.min(request.draft_step || 0, sections.length - 1));
  const current = sections[step], snapshot = request.applicant_snapshot || {};
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);
  useEffect(() => { version.current = request.version; }, [request.version]);
  useEffect(() => {
    const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (request.status !== 'DRAFT' || !request.settings_snapshot?.appointment_required) return;
    let active = true;
    esApi(`/requests/${request.id}/appointment-availability`).then(result => { if (active) setAvailability(result); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [request.id, request.status, request.settings_snapshot?.appointment_required]);
  const changeAppointment = next => { setAppointment(next); setDirty(true); setNotice(''); };
  const update = next => { setValues(next); setDirty(true); setNotice(''); };
  const persist = async next => {
    const saved = await esApi(`/requests/${request.id}/draft`, 'PATCH', { version: version.current, values, draft_step: next, appointment });
    version.current = saved.version; setDirty(false); return saved;
  };
  const save = async next => {
    setBusy(true); setError('');
    try { await persist(next); setStep(next); setNotice('Progress saved.'); }
    catch (err) { setError(`${err.message} Your last saved draft is preserved.`); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!dirty || busy || error) return;
    const timer = window.setTimeout(() => save(step), 1200);
    return () => window.clearTimeout(timer);
  }, [values, appointment, dirty, busy, step, error]);
  useEffect(() => {
    const leave = async event => {
      const anchor = event.target.closest?.('a[href]');
      if (!dirty || busy || !anchor || anchor.target || anchor.hasAttribute('download') || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname.startsWith('/api/')) return;
      event.preventDefault(); event.stopPropagation(); setBusy(true); setError('');
      try { await persist(step); navigate(`${destination.pathname}${destination.search}${destination.hash}`); }
      catch (err) { setError(`${err.message} Save your draft before leaving.`); }
      finally { setBusy(false); }
    };
    document.addEventListener('click', leave, true);
    return () => document.removeEventListener('click', leave, true);
  }, [dirty, busy, values, appointment, step]);
  const upload = async (requirement, file, old) => {
    if (!file) return;
    setBusy(true); setError('');
    try { const saved = await persist(step); await uploadDocument(saved, requirement, file, old?.id); const refreshed = await onRefresh(); if (refreshed) version.current = refreshed.version; setNotice('Document uploaded.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const missingDocuments = request.requirements.filter(requirement => requirement.required && !request.documents.some(document => document.requirement_id === requirement.id && !['REJECTED', 'REPLACEMENT_REQUIRED'].includes(document.status) && !request.documents.some(next => next.replaces_id === document.id)));
  const submit = async event => {
    event.preventDefault();
    if (!current.review) {
      if (current.documents && missingDocuments.length) { setError(`Upload ${missingDocuments.map(item => item.label).join(', ')} before continuing.`); return; }
      save(step + 1); return;
    }
    if (missingDocuments.length) { setError('Upload the required documents before submitting.'); return; }
    setBusy(true); setError('');
    try {
      const saved = await persist(step);
      await esApi(`/requests/${request.id}/${request.status === 'DRAFT' ? 'submit' : 'respond'}`, 'POST', { version: saved.version, declaration, ...(request.status === 'DRAFT' && request.settings_snapshot?.appointment_required ? { appointment_at: `${appointment.date}T${appointment.time}:00+08:00`, appointment_reason: appointment.reason, contact_number: appointment.contact } : {}) }, crypto.randomUUID());
      await onRefresh(); onSubmitted();
    } catch (err) { setError(`${err.message} Your last saved draft is preserved.`); } finally { setBusy(false); }
  };
  return <form ref={form} onSubmit={submit} className="es-application">
    <ol className="es-application-steps" aria-label="Application progress">{sections.map((section, index) => <li key={section.name} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span>{section.name}</li>)}</ol>
    <Feedback error={error} notice={notice} /><div className="es-step-heading"><p>Step {step + 1} of {sections.length}</p><h2 ref={heading} tabIndex={-1}>{current.name}</h2></div>
    {step === 0 && <><dl className="es-metadata"><div><dt>Applicant</dt><dd>{snapshot.full_name || 'See your account profile'}</dd></div><div><dt>Account ID</dt><dd>{snapshot.user_id || request.applicant_user_id}</dd></div><div><dt>Email</dt><dd>{snapshot.email || 'See your account profile'}</dd></div></dl><p className="es-profile-note">Account details are filled in where available. <Link to="/app/profile">Update your profile</Link></p></>}
    {current.fields && <DynamicFields fields={current.fields} values={values} setValues={update} disabled={busy} />}
    {current.documents && <RequirementDocuments request={request} editable busy={busy} upload={upload} />}
    {current.appointment && <fieldset disabled={busy} className="es-section es-form">
      <legend className="es-sr">Appointment</legend>
      {availability ? <><label>Date<select required value={appointment.date} onChange={event => changeAppointment({ ...appointment, date: event.target.value, time: '' })}><option value="">Choose a date</option>{availability.dates.filter(day => day.slots.length).map(day => <option key={day.date} value={day.date}>{new Date(`${day.date}T12:00:00+08:00`).toLocaleDateString('en-PH', { dateStyle: 'full', timeZone: 'Asia/Manila' })}</option>)}</select></label><label>Time<select required value={appointment.time} onChange={event => changeAppointment({ ...appointment, time: event.target.value })}><option value="">Choose a time</option>{availability.dates.find(day => day.date === appointment.date)?.slots.map(slot => <option key={slot.time} value={slot.time}>{slot.time} ({slot.available} available)</option>)}</select></label><p>Location: {availability.config.location}</p></> : <p role="status">Loading available times…</p>}
      <label>Reason for appointment<textarea required maxLength={1000} value={appointment.reason} onChange={event => changeAppointment({ ...appointment, reason: event.target.value })} /></label><label>Contact number<input required type="tel" pattern="09[0-9]{9}" value={appointment.contact} onChange={event => changeAppointment({ ...appointment, contact: event.target.value })} /></label>
    </fieldset>}
    {current.review && <>
      {groups.map(group => <section className="es-section" key={group.name}><h3>{group.name}</h3><dl className="es-review">{group.fields.filter(field => !field.visibility || values[field.visibility.field] === field.visibility.equals).map(field => <div key={field.id}><dt>{field.label}</dt><dd>{typeof values[field.key] === 'object' ? Object.values(values[field.key] || {}).filter(Boolean).join(', ') : typeof values[field.key] === 'boolean' ? (values[field.key] ? 'Yes' : 'No') : String(values[field.key] ?? '—')}</dd></div>)}</dl></section>)}
      <RequirementDocuments request={request} />
      {request.fees?.length > 0 && <section className="es-section"><h3>Fees</h3>{request.fees.map(fee => <p key={fee.code}>{fee.description}: {money(fee.fee_type === 'CREDIT' ? -Number(fee.amount) : fee.amount)}</p>)}<p>The office will confirm any assessment before payment.</p></section>}
      {request.payment_required && !request.fees?.length && <p>The office will confirm applicable fees after reviewing your application.</p>}
      {request.status === 'DRAFT' && request.settings_snapshot?.appointment_required && <p>Appointment: {date(`${appointment.date}T${appointment.time}:00+08:00`)} · {appointment.contact}</p>}
      <label className="es-declaration"><input type="checkbox" disabled={busy} required checked={declaration} onChange={event => setDeclaration(event.target.checked)} />{request.definition.declaration}</label>
    </>}
    <div className="es-application-actions"><button type="button" className="es-secondary" disabled={busy || step === 0} onClick={() => save(step - 1)}>Back</button><button type="button" className="es-secondary" disabled={busy} onClick={() => save(step)}>Save draft</button>{current.review ? <button disabled={busy || !declaration}>{busy ? 'Submitting…' : request.status === 'DRAFT' ? 'Submit application' : 'Submit corrections'}</button> : <button disabled={busy || (current.appointment && !availability)}>Continue</button>}</div>
  </form>;
}
