import { Link, useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useOptionalAuth } from '../context/AuthContext';
import { esApi, useEservice, money } from './EserviceUI';
import { publicStatus } from '../data/serviceApplication';
import { publicErrorMessage } from '../services/publicError';
import ServiceCatalog from './ServiceCatalog';
import './ServiceDetails.css';

const businessStatus = status => ({ ACTIVE: 'Active', APPROVED: 'Approved', UNVERIFIED: 'For verification', PENDING: 'Under review', CLOSED: 'Closed', INACTIVE: 'Inactive' })[status] || 'Under review';
// Profile references and UUIDs are internal identifiers, not municipal business IDs.
const businessReference = business => {
  const value = String(business.business_reference || '');
  return value && !/PROFILE-|[a-f0-9]{8}-[a-f0-9]{4}-/i.test(value) ? value : '';
};
const closedStatuses = ['COMPLETED', 'REJECTED', 'CANCELLED'];

export default function ServiceDetails() {
  const { slug } = useParams(), { user } = useOptionalAuth(), navigate = useNavigate();
  const state = useEservice(signal => esApi(`/services/${slug}`, 'GET', null, null, { signal, errorContext: 'services' }), [slug]);
  const [selection, setSelection] = useState({ slug, userId: user?.id, id: '' });
  const businessId = selection.slug === slug && selection.userId === user?.id ? selection.id : '';
  const [busy, setBusy] = useState(false), [startError, setStartError] = useState('');
  const [businessRevision, setBusinessRevision] = useState(0);
  const operationRef = useRef(null), startingRef = useRef(false);
  const service = state.data;
  const billing = service?.settings?.workflow_type === 'ASSESSMENT_PAYMENT';
  const requiresBusiness = service?.kind === 'BUSINESS_RENEWAL' || billing;
  const apply = ['APPLICATION', 'BUSINESS_NEW', 'BUSINESS_RENEWAL', 'BUSINESS'].includes(service?.kind) && !['INFORMATION', 'PAYMENT'].includes(service?.settings?.workflow_type);
  const resident = user?.role === 'resident';
  useEffect(() => {
    setStartError('');
    const updated = event => { setBusinessRevision(value => value + 1); setSelection({ slug, userId: user?.id, id: event.detail.id }); };
    window.addEventListener('resident-businesses-updated', updated);
    return () => window.removeEventListener('resident-businesses-updated', updated);
  }, [slug, user?.id]);
  const businesses = useEservice(signal => resident && requiresBusiness ? esApi('/businesses', 'GET', null, null, { signal }) : Promise.resolve({ items: [] }), [user?.id, requiresBusiness, businessRevision]);
  const applications = useEservice(signal => resident && service?.id && apply ? esApi(`/requests?service_id=${service.id}${requiresBusiness && businessId ? `&business_id=${businessId}` : ''}&limit=100`, 'GET', null, null, { signal }) : Promise.resolve({ items: [] }), [user?.id, service?.id, apply, requiresBusiness, businessId]);
  const items = businesses.data?.items || [];
  const selectedBusiness = items.find(business => business.id === businessId);
  const existing = (applications.data?.items || []).find(request => request.service_id === service?.id && !closedStatuses.includes(request.status) && (!requiresBusiness || selectedBusiness && request.business_id === businessId));
  const start = async () => {
    if (!user) { navigate(`/auth/login?returnUrl=${encodeURIComponent(`/app/services/${slug}`)}`); return; }
    if (startingRef.current || requiresBusiness && (!selectedBusiness || businesses.loading)) return;
    startingRef.current = true; setBusy(true); setStartError('');
    const payload = { service_id: service.id, ...(requiresBusiness ? { business_id: businessId } : {}) };
    const signature = JSON.stringify(payload);
    if (operationRef.current?.signature !== signature) operationRef.current = { signature, key: crypto.randomUUID() };
    try {
      const request = await esApi('/requests', 'POST', payload, operationRef.current.key, { errorContext: 'form' });
      navigate(`/app/e-requests/${request.id}`);
    } catch (error) { setStartError(publicErrorMessage(error, 'form')); }
    finally { startingRef.current = false; setBusy(false); }
  };
  if (state.loading && !service) return <section className="es-workspace es-service-detail sd-loading" aria-busy="true"><p role="status">Loading service information…</p><div className="sd-placeholder sd-placeholder-title" aria-hidden="true" /><div className="sd-placeholder" aria-hidden="true" /><div className="sd-loading-columns" aria-hidden="true"><div /><div /></div></section>;
  if (!service) return <section className="es-workspace es-service-detail sd-unavailable"><h1>Service unavailable</h1><p>We couldn’t load this service. Please try again in a moment.</p><button type="button" onClick={state.refresh}>Try again</button></section>;
  const requirements = service.requirements || [], fees = service.fees || [];
  const blockedReason = !service.online_available ? 'Online applications are currently unavailable for this service.' : user && !resident ? 'Sign in with a resident account to apply for this service.' : requiresBusiness && resident ? businesses.loading ? 'Loading businesses linked to your account…' : businesses.error ? 'We couldn’t load your businesses. Please try again.' : !items.length ? 'No registered businesses are linked to your account.' : !selectedBusiness ? 'Choose a business to start your application.' : '' : '';
  return <section className="es-workspace es-service-detail" aria-labelledby="service-title">
    <header className="es-service-header"><h1 id="service-title">{service.name}</h1>{(service.short_description || service.description) && <p>{service.short_description || service.description}</p>}</header>
    {service.kind === 'DIRECTORY' ? <ServiceCatalog categoryId={service.settings?.directory_category_id || service.category_id} /> : <div className="es-detail-layout">
      <aside className="es-service-aside" aria-labelledby="request-service-title">
        <h2 id="request-service-title">Request this service</h2>
        {(service.department_name || service.processing_time) && <dl className="sd-request-meta">{service.department_name && <div><dt>Office</dt><dd>{service.department_name}</dd></div>}{service.processing_time && <div><dt>Processing time</dt><dd>{service.processing_time}</dd></div>}</dl>}
        {apply && requiresBusiness && resident && <div className="sd-business-field">
          <label htmlFor="service-business">Registered business</label>
          <select id="service-business" value={selectedBusiness ? businessId : ''} disabled={busy || businesses.loading || !!businesses.error || !items.length} aria-describedby="business-helper business-state" onChange={event => { setSelection({ slug, userId: user.id, id: event.target.value }); setStartError(''); }}>
            <option value="">{businesses.loading ? 'Loading businesses…' : 'Choose a business'}</option>{items.map(business => <option key={business.id} value={business.id}>{business.business_name} · {businessStatus(business.status)}</option>)}
          </select>
          <p id="business-helper" className="sd-helper">Select one of the businesses linked to your account.</p>
          <div id="business-state" aria-live="polite">{businesses.loading ? <p className="sd-helper" role="status">Loading registered businesses…</p> : businesses.error ? <div className="sd-inline-error"><p>We couldn’t load your businesses.</p><button type="button" className="es-secondary" onClick={businesses.refresh}>Try again</button></div> : !items.length ? <p className="sd-helper">No registered businesses are linked to your account.</p> : selectedBusiness && <div className="sd-business-summary"><strong>{selectedBusiness.business_name}</strong>{businessReference(selectedBusiness) && <span>Business ID: {businessReference(selectedBusiness)}</span>}<span>{businessStatus(selectedBusiness.status)}</span></div>}</div>
          <Link className="sd-profile-link" to={`/app/services/${slug}`} state={{ openProfileModal: true }}>Manage business information</Link>
        </div>}
        {apply && resident && applications.loading && <p className="sd-helper" role="status">Checking your existing applications…</p>}
        {apply && resident && applications.error && <div className="sd-inline-error"><p>We couldn’t check your existing applications. Check My Requests before starting another.</p><Link to="/app/e-requests">View My Requests</Link><button type="button" className="es-secondary" onClick={applications.refresh}>Try again</button></div>}
        {existing && <div className="sd-existing" role="status"><strong>{existing.status === 'DRAFT' ? 'You have a saved application' : 'You already have an application'}</strong><p>{existing.payment_pending ? 'Payment pending. Your payment is awaiting confirmation.' : existing.status === 'AWAITING_PAYMENT' ? 'Payment required. Review the assessment in your request.' : existing.status === 'FOR_ASSESSMENT' ? 'Assessment required. The office is reviewing applicable charges.' : publicStatus(existing.status)}</p><Link to={`/app/e-requests/${existing.id}`}>{existing.status === 'DRAFT' ? 'Resume application' : 'View existing application'}</Link></div>}
        {startError && <p className="sd-inline-error" role="alert">{startError}</p>}
        {apply ? <><button type="button" className="sd-primary" onClick={start} disabled={busy || !!blockedReason} aria-describedby={blockedReason ? 'service-action-help' : undefined}>{busy ? 'Starting application…' : !user ? 'Sign in to apply' : 'Start application'}</button>{blockedReason && <p id="service-action-help" className="sd-helper">{blockedReason}</p>}</> : service.settings?.workflow_type === 'PAYMENT' || ['BUSINESS', 'REAL_PROPERTY', 'WATER', 'PAYMENT_ORDER'].includes(service.kind) ? <Link className="es-button sd-primary" to="/app/e-billing/all">View payable assessments</Link> : <p className="sd-helper">{service.online_available ? 'Contact the office for assistance with this service.' : 'This service is available through the municipal office.'}</p>}
      </aside>
      <div className="sd-information">
        {service.eligibility && <section className="sd-section"><h2>Who may apply</h2><p className="es-preserve-lines">{service.eligibility}</p></section>}
        <section className="sd-section"><h2>Requirements</h2>{requirements.length ? <ul className="sd-requirements">{requirements.map((requirement, index) => <li key={requirement.id || index}><div><strong>{requirement.label}</strong><span className="sd-required">{requirement.required ? 'Required' : 'Optional'}</span></div>{requirement.help_text && <p>{requirement.help_text}</p>}</li>)}</ul> : <p>No additional documents are currently required for this service.</p>}</section>
        <section className="sd-section"><h2>Fees</h2>{fees.length ? <dl className="sd-fees">{fees.map((fee, index) => <div key={fee.id || fee.code || index}><dt>{fee.description}</dt><dd>{money(fee.fee_type === 'CREDIT' ? -Number(fee.amount) : fee.amount)}</dd></div>)}</dl> : <p>{service.payment_required ? 'The office will confirm applicable fees after assessment.' : 'No fees are currently listed for this service.'}</p>}{service.payment_required && <p className="sd-fee-note">Any outstanding assessment will be available in your request before payment.</p>}</section>
        {service.description && service.short_description && service.description !== service.short_description && <section className="sd-section"><h2>About this service</h2><p className="es-preserve-lines">{service.description}</p></section>}
        {service.instructions && <section className="sd-section"><h2>Instructions</h2><p className="es-preserve-lines">{service.instructions}</p></section>}
        {service.processing_information && <section className="sd-section"><h2>Processing information</h2><p className="es-preserve-lines">{service.processing_information}</p></section>}
        {!!service.service_steps?.length && <section className="sd-section"><h2>Service steps</h2><ol>{service.service_steps.map((step, index) => <li key={index}>{typeof step === 'string' ? step : step.label}</li>)}</ol></section>}
        {service.important_reminders && <section className="sd-section"><h2>Important reminders</h2><p className="es-preserve-lines">{service.important_reminders}</p></section>}
        {(service.contact?.email || service.contact?.phone) && <section className="sd-section sd-contact"><h2>Contact information</h2>{service.contact.email && <a href={`mailto:${service.contact.email}`}>{service.contact.email}</a>}{service.contact.phone && <a href={`tel:${service.contact.phone.replace(/[^+0-9]/g, '')}`}>{service.contact.phone}</a>}</section>}
        {service.hero_url && <img className="es-service-image" src={service.hero_url} alt="" />}
      </div>
    </div>}
  </section>;
}
