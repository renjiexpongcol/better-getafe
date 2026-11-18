import { Field, Toolbar, Button, SearchInput, ErrorState, EmptyState, LoadingState } from './ui/Primitives'
import { useId, useState } from 'react'
import { ArrowUpRight, Building2, ChevronDown, Clock3 } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useEservice, money } from './EserviceUI'
import { routeRequest } from '../services/routeRequests'
import './ServiceCatalog.css'

function ServiceCard({ service, serviceBase }) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const requirements = service.requirements || [], fees = service.fees || []
  return <li className="mc-card">
    <div className="mc-card-context"><span>{service.category_name || 'Municipal service'}</span><span className={`mc-availability${service.online_available ? ' is-online' : ''}`}>{service.online_available ? 'Online service' : 'Office service'}</span></div>
    <p className="mc-department"><Building2 size={15} aria-hidden="true"/>{service.department_name || 'Department not listed'}</p>
    <h3><Link to={`${serviceBase}/${service.slug}`}>{service.name}</Link></h3>
    <p className="mc-description">{service.short_description || 'View the service details for further information.'}</p>
    {service.processing_time && <p className="mc-processing"><Clock3 size={16} aria-hidden="true"/><span><strong>Processing time</strong>{service.processing_time}</span></p>}
    <div className="mc-disclosure">
      <Button variant="ghost" className="mc-disclosure-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}>
        Eligibility, requirements and fees <ChevronDown size={18} aria-hidden="true"/>
      </Button>
      <div className="mc-disclosure-panel" id={panelId} hidden={!expanded}>
        <section><h4>Eligibility</h4><p>{service.eligibility || 'Eligibility information has not been listed. Contact the office for guidance.'}</p></section>
        <section><h4>Required documents</h4>{requirements.length ? <ul>{requirements.map((requirement, index) => <li key={requirement.id || index}><strong>{requirement.label}</strong> <span>{requirement.required ? '(required)' : '(optional)'}</span>{requirement.help_text && <p>{requirement.help_text}</p>}</li>)}</ul> : <p>No document requirements are currently listed. Check the service details or contact the office.</p>}</section>
        <section><h4>Processing time</h4><p>{service.processing_time || 'A processing time has not been listed.'}</p></section>
        <section><h4>Fees</h4>{fees.length ? <dl>{fees.map((fee, index) => <div key={fee.code || index}><dt>{fee.description}</dt><dd>{money(fee.fee_type === 'CREDIT' ? -Number(fee.amount) : fee.amount)}</dd></div>)}</dl> : <p>{service.payment_required ? 'The office will confirm applicable fees after assessment.' : 'No fees are currently listed. Contact the office for fee information.'}</p>}</section>
      </div>
    </div>
    <div className="mc-card-action"><Button to={`${serviceBase}/${service.slug}`} data-analytics-placement="services.catalog" data-analytics-destination={`service:${service.id}`}>{service.online_available ? 'View and apply' : 'View details'}<ArrowUpRight size={16} aria-hidden="true"/></Button></div>
  </li>
}

export default function ServiceCatalog({ categoryId = '', businessOnly = false, otherOnly = false, heading = 'Find a service', servicesOverride }) {
  const { pathname } = useLocation()
  const searchId = useId(), titleId = useId()
  const serviceBase = pathname.startsWith('/app/') ? '/app/services' : '/services/e-services'
  const fetchedState = useEservice(signal => routeRequest('/api/services', { signal, ttl: 60000 }), [], !servicesOverride)
  const state = servicesOverride ? { ...fetchedState, data: { items: servicesOverride }, loading: false, error: '' } : fetchedState
  const [search, setSearch] = useState(''), [category, setCategory] = useState(''), [department, setDepartment] = useState('')
  const entries = (state.data?.items || []).filter(service => service.kind !== 'DIRECTORY' && (!categoryId || service.category_id === categoryId || service.category_slug === categoryId) && (!businessOnly || String(service.kind || '').startsWith('BUSINESS')) && (!otherOnly || !String(service.kind || '').startsWith('BUSINESS')))
  const categories = [...new Map(entries.filter(service => service.category_id).map(service => [service.category_id, service.category_name])).entries()]
  const departments = [...new Set(entries.map(service => service.department_name).filter(Boolean))].sort()
  const keyword = search.trim().toLocaleLowerCase()
  const [channel, setChannel] = useState('all')
  const matches = entries.filter(service => (!category || service.category_id === category) && (!department || service.department_name === department) && [service.name, service.short_description, service.department_name, service.category_name].filter(Boolean).join(' ').toLocaleLowerCase().includes(keyword))
  const online = matches.filter(service => service.online_available)
  const office = matches.filter(service => !service.online_available)
  const items = { all: matches, online, office }[channel]
  const clear = () => { setSearch(''); setCategory(''); setDepartment(''); setChannel('all') }
  return <section className="municipal-catalog" aria-labelledby={titleId}>
    <header className="mc-header"><h2 id={titleId}>{heading}</h2></header>
    <Toolbar label="Service catalog filters">
      <div className="mc-search"><label htmlFor={searchId}>Find a service</label><SearchInput id={searchId} label="Find a service" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by service or office" /></div>
      {categories.length > 1 && <Field label="Category"><select value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(([id, name]) => <option key={id} value={id}>{name || 'Municipal service'}</option>)}</select></Field>}
      {departments.length > 1 && <Field label="Department"><select value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map(name => <option key={name} value={name}>{name}</option>)}</select></Field>}
      {(search || category || department || channel !== 'all') && <Button variant="outline" onClick={clear}>Clear filters</Button>}
    </Toolbar>
    {!state.loading && !state.error && entries.length > 0 && <div className="mc-results-bar">
      <div className="mc-channels" role="group" aria-label="Service availability">
        {[['all', 'All services', matches], ['online', 'Online', online], ['office', 'At the office', office]].map(([key, name, list]) =>
          <button key={key} type="button" aria-pressed={channel === key} onClick={() => setChannel(key)}>{name} <span>{list.length}</span></button>)}
      </div>
      <span role="status">{items.length} {items.length === 1 ? 'result' : 'results'}</span>
    </div>}
    {state.loading && <LoadingState label="Loading municipal services…"/>}
    {state.error && <ErrorState message={state.error} onRetry={state.refresh}/>}
    {!state.loading && !state.error && <><ul className="mc-list">{items.map(service => <ServiceCard service={service} serviceBase={serviceBase} key={service.id}/>)}</ul>{!items.length && <EmptyState title={entries.length ? 'No services match your search' : 'No services published yet'} description={entries.length ? 'Try a different keyword, category or department.' : 'Contact the municipal office for assistance.'} action={entries.length > 0 && <Button variant="outline" onClick={clear}>Clear filters</Button>}/>}</>}
  </section>
}
