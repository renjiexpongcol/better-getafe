import { Navigate, useSearchParams } from 'react-router-dom';
import { esApi, useEservice, Feedback } from '../../components/EserviceUI';
const aliases = { 'business-permit': 'new-business-application', 'business-renewal': 'renew-business-application' };
export default function RequestDocument() {
  const [params] = useSearchParams();
  const state = useEservice(() => esApi('/services'), []);
  if (params.get('service') === 'concern') return <Navigate to="/app/help?report=1" replace />;
  if (state.loading || state.error) return <main className="es-workspace"><Feedback loading={state.loading} error={state.error} /></main>;
  const slug = aliases[params.get('service')] || params.get('service');
  const service = state.data?.items.find(item => item.slug === slug);
  return <Navigate to={service ? `/app/services/${service.slug}` : '/app/services'} replace />;
}
