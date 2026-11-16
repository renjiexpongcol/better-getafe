import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useBarangays } from '../../hooks/usePublicResource'
import { useEservice } from '../../components/EserviceUI'
import { routeRequest } from '../../services/routeRequests'
import { ErrorState, EmptyState, LoadingState } from '../../components/ui/Primitives'
import ServiceCatalog from '../../components/ServiceCatalog'

export default function BarangayServices() {
  const { id } = useParams()
  const barangays = useBarangays()
  const state = useEservice(signal => routeRequest('/api/services', { signal, ttl: 60000 }), [])
  const routeId = decodeURIComponent(id).toLowerCase()
  const barangay = barangays.items.find(item => String(item.id).toLowerCase() === routeId || String(item.slug).toLowerCase() === routeId || String(item.name).toLowerCase().replaceAll(' ', '-') === routeId)
  if (barangays.loading || state.loading) return <main className="services-page-content container"><LoadingState label="Loading barangay services…" /></main>
  if (barangays.error) return <main className="services-page-content container"><ErrorState message={barangays.error} onRetry={barangays.reload} /></main>
  if (!barangay) return <main className="services-page-content container"><EmptyState title="Barangay not found" action={<Link to="/barangays">Browse barangays</Link>} /></main>
  if (state.error) return <main className="services-page-content container"><ErrorState message={state.error} onRetry={state.refresh} /></main>
  const services = (state.data?.items || []).filter(service => service.barangay_id === barangay.id || service.barangay_slug === barangay.slug || service.barangays?.some?.(item => item === barangay.id || item === barangay.slug))
  return <main id="services-page"><div className="page-header"><div className="container page-header-inner"><div><Link to={`/barangays/${encodeURIComponent(barangay.id)}`}><ArrowLeft size={16} aria-hidden="true" /> Back to {barangay.name}</Link><h1 className="page-title">{barangay.name} Services</h1><p className="page-subtitle">Services published specifically for Barangay {barangay.name}</p></div></div></div><div className="services-page-content container">{services.length ? <ServiceCatalog heading={`${barangay.name} service catalog`} servicesOverride={services} /> : <EmptyState title="No barangay services published yet" description={`Contact the Barangay ${barangay.name} office for assistance.`} />}</div></main>
}
