import AppPage from './AppPage';
import { Link, useSearchParams } from 'react-router-dom';
import ServiceCatalog from '../../components/ServiceCatalog';
export default function Services() {
  const [params] = useSearchParams();
  return <AppPage title="Service catalog"><main className="es-workspace"><div className="es-request-heading"><div><h1>Municipal services</h1><p>View requirements, fees and processing information before you apply.</p></div><Link className="es-button es-secondary" to="/app/e-requests">My requests</Link></div>{params.get('category') && <Link to="/app/services">All services</Link>}<ServiceCatalog categoryId={params.get('category') || ''} /></main></AppPage>;
}
