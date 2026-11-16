import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Button, EmptyState } from './ui/Primitives'
import { useEservice, Feedback } from './EserviceUI'
import { routeRequest } from '../services/routeRequests'
import { requestJson } from '../services/apiTransport'
import { useAuth } from '../context/AuthContext'
import { ROUTES } from '../routeRegistry'

export default function StaffUtilityPages({module}) {
  const {user}=useAuth(),[busy,setBusy]=useState(null),pending=useRef(false)
  const state=useEservice(signal=>module==='notifications'?routeRequest('/api/staff/notifications',{signal,scope:`staff:${user.id}`}):module==='system-settings'?routeRequest('/api/admin/settings',{signal,scope:`staff:${user.id}`}):Promise.resolve({}),[module])
  const read=async id=>{
    if(pending.current)return;pending.current=true;setBusy(id)
    try{await requestJson(`/staff/notifications/${encodeURIComponent(id)}/read`,{method:'PATCH',body:'{}'});await state.refresh()}catch(error){state.setError(error.message)}finally{pending.current=false;setBusy(null)}
  }
  if(module==='help')return <section className="staff-panel"><PageHeader title="Staff help & support"/><p>Use your dashboard to see department workload. Open a request to inspect its application, documents, messages and activity. Actions depend on your permissions and the service workflow.</p><p>Internal notes are visible to authorized staff. Messages to applicants and requests for information appear in the resident portal.</p><p>For employee identity or department changes, contact your administrator. Manage your password and authenticator in Account security.</p>{user.permissions?.includes('requests.department.view')&&<Link to="/app/staff/e-requests">Open department requests</Link>}</section>
  return <section className="staff-panel"><PageHeader title={module==='notifications'?'Notifications':'System parameters'} actions={<Button variant="outline" onClick={state.refresh} disabled={state.loading}>Refresh</Button>}/><Feedback loading={state.loading} error={state.error}/>
    {state.data&&module==='notifications'&&(state.data.items?.length?<ul className="staff-history">{state.data.items.map(item=><li key={item.id}><div><h2>{item.title}</h2><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} · {item.read_at?'Read':'Unread'}</small>{!item.read_at&&<Button variant="outline" size="small" disabled={Boolean(busy)} onClick={()=>read(item.id)}>Mark as read</Button>}{item.application_id&&user.permissions?.includes('requests.view')&&<Link to={ROUTES.staff.request(item.application_id)}>View request</Link>}{item.request_id&&user.permissions?.includes('requests.department.view')&&<Link to={`/app/staff/e-requests/${encodeURIComponent(item.request_id)}`}>View request</Link>}</div></li>)}</ul>:<EmptyState title="No notifications yet" description="Assignments and request updates addressed to you will appear here."/>)}
    {state.data&&module==='system-settings'&&<><p>Configuration delegated to your account.</p>{(state.data.categories||[]).map(category=><details key={category}><summary>{category}</summary><dl className="staff-settings-list">{Object.entries(state.data.values||{}).filter(([key])=>key.startsWith(`${category}.`)).map(([key,value])=><div key={key}><dt>{state.data.metadata?.[key]?.label||key}</dt><dd>{state.data.metadata?.[key]?.secret?'Protected value':typeof value==='object'?JSON.stringify(value):String(value??'Not configured')}</dd></div>)}</dl></details>)}</>}
  </section>
}
