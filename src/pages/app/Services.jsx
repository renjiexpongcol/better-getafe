import { Button } from '../../components/ui/Primitives';
import AppPage from './AppPage';
import { Link, useSearchParams } from 'react-router-dom';
import ServiceCatalog from '../../components/ServiceCatalog';
export default function Services() {
  const [params] = useSearchParams();
  return <AppPage title="Municipal services" description="View requirements, fees and processing information before you apply." actions={<Button variant="outline" to="/app/e-requests">My requests</Button>}><section className="es-workspace">{params.get('category') && <Link to="/app/services">All services</Link>}<ServiceCatalog categoryId={params.get('category') || ''} /></section></AppPage>;
}
