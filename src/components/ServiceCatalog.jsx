import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { esApi, useEservice, Feedback, money } from './EserviceUI';

export default function ServiceCatalog({ categoryId = '', businessOnly = false, otherOnly = false }) {
  const { pathname } = useLocation();
  const serviceBase = pathname.startsWith('/app/') ? '/app/services' : '/services/e-services';
  const state = useEservice(() => esApi('/services'), []);
  const [search, setSearch] = useState(''), [category, setCategory] = useState('');
  const entries = (state.data?.items || []).filter(service => service.kind !== 'DIRECTORY' && (!categoryId || service.category_id === categoryId || service.category_slug === categoryId) && (!businessOnly || service.kind.startsWith('BUSINESS')) && (!otherOnly || !service.kind.startsWith('BUSINESS')));
  const categories = [...new Map(entries.filter(service => service.category_id).map(service => [service.category_id, service.category_name])).entries()];
  const items = entries.filter(service => (!category || service.category_id === category) && `${service.name} ${service.short_description} ${service.department_name || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="es-catalog">
    <div className="es-catalog-filters"><label>Find a service<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by service or office" /></label>{categories.length > 1 && <label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}</div>
    <Feedback loading={state.loading} error={state.error} />
    {!state.loading && !state.error && <><p className="es-catalog-count">{items.length} {items.length === 1 ? 'service' : 'services'} available</p><ul className="es-catalog-list">{items.map(service => <li key={service.id}><div><small>{service.category_name || 'Municipal service'}{service.department_name && ` · ${service.department_name}`}</small><h2><Link to={`${serviceBase}/${service.slug}`}>{service.name}</Link></h2>{service.short_description && <p>{service.short_description}</p>}<div className="es-catalog-facts">{service.processing_time && <span>{service.processing_time}</span>}<span>{service.online_available ? 'Online requests available' : 'Contact the office'}</span></div><details className="es-catalog-summary"><summary>Eligibility, requirements and fees</summary>{service.eligibility && <p><strong>Who may apply:</strong> {service.eligibility}</p>}{service.requirements?.length > 0 && <ul>{service.requirements.map(requirement => <li key={requirement.id}>{requirement.label}{requirement.required ? ' (required)' : ' (optional)'}</li>)}</ul>}{service.fees?.length > 0 ? <ul>{service.fees.map(fee => <li key={fee.code}>{fee.description}: {money(fee.fee_type === 'CREDIT' ? -Number(fee.amount) : fee.amount)}</li>)}</ul> : <p>{service.payment_required ? 'The office will confirm applicable fees after assessment.' : 'See service details or contact the office for fee information.'}</p>}</details></div><Link className="es-button es-secondary" to={`${serviceBase}/${service.slug}`}>{service.online_available ? 'Apply' : 'View details'}</Link></li>)}</ul>{!items.length && <p className="es-empty">{entries.length ? 'No services match your search.' : 'No services are currently published in this category.'}</p>}</>}
  </section>;
}
