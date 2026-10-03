import { Link } from 'react-router-dom'
import { useEservice, Feedback } from './EserviceUI'
import { requestJson } from '../services/apiTransport'
import { dateLabel } from '../services/citizenData'
import { ROUTES } from '../routeRegistry'

export default function StaffUtilityPages({ module }) {
  const state = useEservice(signal => module === 'notifications'
    ? requestJson('/staff/notifications', { signal })
    : module === 'system-settings' ? requestJson('/admin/settings', { signal }) : Promise.resolve({}), [module])
  if (module === 'help') return <section className="staff-panel"><h1>Staff help & support</h1><p>Open Service requests to review resident applications. Choose a request to view its details, add a fulfillment note, or upload an issued document.</p><p>E-service requests contains department workflows, assessment and payment operations. Available actions depend on your assigned permissions.</p><p>For account or access changes, contact your municipal administrator. Never share your password or verification codes.</p><Link to={ROUTES.staff.requests}>View service requests →</Link></section>
  return <section className="staff-panel"><h1>{module === 'notifications' ? 'Notifications' : 'System parameters'}</h1>
    <Feedback loading={state.loading} error={state.error}/>
    {state.error && <button type="button" className="staff-modal-secondary" onClick={state.refresh}>Try again</button>}
    {state.data && module === 'notifications' && (state.data.items?.length ? <ul className="staff-history">{state.data.items.map(item => <li key={item.id}><div><h2>{item.title}</h2><p>{item.message}</p><small>{dateLabel(item.created_at)}</small>{item.application_id && <Link to={ROUTES.staff.request(item.application_id)}>View request →</Link>}</div></li>)}</ul> : <p>No notifications yet. Account updates will appear here.</p>)}
    {state.data && module === 'system-settings' && <><p>Review the configuration available to your account. Contact your administrator to request changes.</p>{(state.data.categories || []).map(category => <details key={category}><summary>{category.replace(/([a-z])([A-Z])/g, '$1 $2')}</summary><dl className="staff-settings-list">{Object.entries(state.data.values || {}).filter(([key]) => key.startsWith(`${category}.`)).map(([key, value]) => <div key={key}><dt>{state.data.metadata?.[key]?.label || key.split('.').at(-1)}</dt><dd>{state.data.metadata?.[key]?.secret ? 'Protected value' : typeof value === 'object' ? JSON.stringify(value) : String(value ?? 'Not configured')}</dd></div>)}</dl></details>)}</>}
  </section>
}
