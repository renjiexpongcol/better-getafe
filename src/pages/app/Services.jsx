import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, FileText, Plus, X } from 'lucide-react'
import AppPage from './AppPage'
import { Empty, ServiceSearch } from '../../components/CitizenWidgets'
import { citizenServices, serviceCategories } from '../../data/citizenServices'
import { useAuth } from '../../context/AuthContext'
import { useCitizen } from '../../context/CitizenContext'
import { citizenApi } from '../../services/citizenData'

export default function Services() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const citizen = useCitizen()
  const data = citizen?.data
  const [selectedService, setSelectedService] = useState(null)
  const [requestingService, setRequestingService] = useState(null)
  const [purpose, setPurpose] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const category = params.get('category') || ''
  const services = citizenServices.filter(item => !category || item.category === category)
  const selectedCategory = selectedService && serviceCategories.find(item => item.id === selectedService.category)

  useEffect(() => {
    if (!selectedService && !requestingService) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setSelectedService(null)
        setRequestingService(null)
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selectedService, requestingService])

  const submitRequest = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await citizenApi('/applications', {
        method: 'POST',
        body: JSON.stringify({ service_name: requestingService.name, details: { purpose } }),
      })
      setRequestingService(null)
      setPurpose('')
      navigate(`/app?sysparm_object_id=requests&sysparm_record_id=${encodeURIComponent(result.id)}&submitted=1`)
    } catch (requestError) {
      setError(requestError.message)
      setBusy(false)
    }
  }

  return <AppPage title="Browse municipal services">
    <ServiceSearch autoFocus={params.has('search')}/>
    <nav className="portal-filters" aria-label="Service categories">
      <Link className={!category ? 'active' : ''} to="/app?sysparm_object_id=services">All services</Link>
      {serviceCategories.map(item => <Link className={category === item.id ? 'active' : ''} key={item.id} to={`/app?sysparm_object_id=services&category=${item.id}`}>{item.name}</Link>)}
    </nav>
    <p className="portal-muted">Select a service to view details and start a request. The responsible office will review your information and advise you of requirements and fees.</p>
    <div className="citizen-service-grid">
      {services.map(service => <button type="button" className="citizen-service" key={service.id} onClick={() => setSelectedService(service)}><span><FileText size={20}/></span><strong>{service.name}</strong><p>{serviceCategories.find(item => item.id === service.category)?.description}</p><small>View service details<ArrowRight size={16}/></small></button>)}
    </div>
    {!services.length && <Empty title="No services in this category" href="/app?sysparm_object_id=services" action="View all services"/>}
    {selectedService && <div className="portal-action-backdrop service-detail-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setSelectedService(null)}>
      <section className="portal-action-modal service-detail-modal" role="dialog" aria-modal="true" aria-labelledby="service-detail-title">
        <button type="button" className="portal-action-close" aria-label="Close service details" onClick={() => setSelectedService(null)}><X size={18}/></button>
        <span className="portal-action-icon"><FileText size={23}/></span>
        <h2 id="service-detail-title">{selectedService.name}</h2>
        <p>{selectedCategory?.description || 'Municipal service information and requirements.'}</p>
        <div className="service-detail-note"><strong>Before you start</strong><span>The responsible municipal office will review your request and advise you of the requirements and applicable fees.</span></div>
        <div className="service-detail-actions"><button type="button" className="portal-action-secondary" onClick={() => setSelectedService(null)}>Close</button><button type="button" className="citizen-primary" onClick={() => { setRequestingService(selectedService); setSelectedService(null); setError('') }}>Start application <ArrowRight size={16}/></button></div>
      </section>
    </div>}
    {requestingService && <div className="portal-action-backdrop service-detail-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setRequestingService(null)}>
      <form className="portal-action-modal service-request-modal" onSubmit={submitRequest} role="dialog" aria-modal="true" aria-labelledby="service-request-title">
        <button type="button" className="portal-action-close" aria-label="Close request form" onClick={() => setRequestingService(null)}><X size={18}/></button>
        <div className="service-request-heading"><h2 id="service-request-title">Request a municipal service</h2><p>Your request will be sent for review. You can upload supporting documents after submitting.</p></div>
        <label>Service<select value={requestingService.id} disabled><option>{requestingService.name}</option></select></label>
        <div className="portal-form-grid"><label>Applicant<input value={data?.profile?.full_name || user.name} readOnly/></label><label>Email address<input value={user.email} readOnly/></label></div>
        <label>Purpose and request details<textarea required maxLength={4000} value={purpose} onChange={event => setPurpose(event.target.value)} placeholder="Tell the municipal office what you need and include any relevant details." rows="5"/></label>
        {error && <p className="portal-error" role="alert">{error}</p>}
        <div className="service-detail-actions"><button type="button" className="portal-action-secondary" onClick={() => setRequestingService(null)}>Cancel</button><button className="citizen-primary" disabled={busy}><Plus size={16}/>{busy ? 'Submitting…' : 'Submit request'}</button></div>
      </form>
    </div>}
  </AppPage>
}
