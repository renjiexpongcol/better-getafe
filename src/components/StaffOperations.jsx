import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { onDataChanged } from '../services/dataChanges'
import { routeRequest } from '../services/routeRequests'
import { PageHeader, Button, StatusBadge, Table, Pagination, EmptyState, LoadingState, ErrorState } from './ui/Primitives'
import './StaffOperations.css'

const label = value => String(value || '').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const date = value => value ? new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '—'
export const staffRecordPath = row => row.source === 'eservice' ? `/app/staff/e-requests/${encodeURIComponent(row.id)}` : `/app/staff/requests/${encodeURIComponent(row.id)}`

function useStaffQuery(path) {
  const {user}=useAuth(), [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==='visible')setRevision(value=>value+1)}
    const unsubscribe=onDataChanged(refresh)
    const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh)
    return()=>{unsubscribe();clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[])
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('')
    routeRequest(path,{signal:controller.signal,scope:`staff:${user.id}`,ttl:5000,force:revision>0}).then(result=>{if(!controller.signal.aborted)setData(result)}).catch(issue=>{if(!controller.signal.aborted)setError(issue.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[path,user.id,revision])
  return{data,loading,error,refresh:()=>setRevision(value=>value+1)}
}

export function StaffOperationsDashboard() {
  const {user}=useAuth(),state=useStaffQuery('/api/staff/dashboard')
  const can=permission=>user.permissions?.includes(permission)
  const queues=[can('requests.view')&&{path:'/app/staff/requests',name:'Service requests'},can('requests.department.view')&&{path:'/app/staff/e-requests',name:'E-service requests'}].filter(Boolean)
  return <div className="staff-operations">
    <PageHeader title="Staff dashboard" context="Municipality of Getafe" description="Department work, assigned requests, and recent activity." actions={<Button variant="outline" busy={state.loading} onClick={state.refresh}>Refresh</Button>}/>
    {state.error&&<ErrorState message={state.error} onRetry={state.refresh}/>}
    {state.loading&&!state.data?<LoadingState label="Loading your department workload…"/>:state.data&&<>
      <p className="staff-scope">{state.data.scope} · Updated {date(state.data.generated_at)}</p>
      <div className="staff-metric-grid" aria-label="Request workload">
        {[['total','Total requests'],['pending','Pending review'],['inProgress','In progress'],['assigned','Assigned to me'],['unassigned','Unassigned'],['completed','Completed'],['overdue','Overdue'],['awaitingDocuments','Awaiting documents'],['awaitingResponse','Awaiting response'],['awaitingPayment','Awaiting payment']].map(([key,title])=><article key={key}><span>{title}</span><strong>{state.data.counts[key]??0}</strong></article>)}
      </div>
      <section className="staff-panel"><h2>Work queues</h2><div className="staff-queue-links">{queues.map(queue=><div key={queue.path}><h3>{queue.name}</h3><Link to={`${queue.path}?status=&assigned=me`}>My assigned requests</Link><Link to={`${queue.path}?status=&assigned=unassigned`}>Unassigned requests</Link>{(queue.name==='E-service requests'?can('requests.department.approve'):can('documents.approve'))&&<Link to={`${queue.path}?status=${queue.name==='E-service requests'?'FOR_APPROVAL':'approved'}`}>{queue.name==='E-service requests'?'Pending approvals':'Approved for fulfillment'}</Link>}<Link to={`${queue.path}?status=${queue.name==='E-service requests'?'COMPLETED':'completed'}`}>Completed requests</Link></div>)}</div></section>
      <section className="staff-panel"><h2>Recent activity</h2>{state.data.recent?.length?<StaffRecords items={state.data.recent}/>:<EmptyState title="No submitted requests" description="Requests in your authorized scope will appear here."/>}</section>
    </>}
  </div>
}

export function StaffRecords({items}) {
  return <Table label="Staff service requests"><thead><tr>{['Reference / service','Applicant','Department','Assigned staff','Status','Updated',''].map((title,index)=><th key={index} scope="col">{title||'Action'}</th>)}</tr></thead><tbody>{items.map(row=><tr key={`${row.source||'legacy'}:${row.id}`}><td><Link to={staffRecordPath(row)}>{row.reference||row.reference_number}</Link><small>{row.service_name}</small></td><td>{row.applicant_name||row.resident_name}</td><td>{row.department_name||'Support queue'}</td><td>{row.assigned_user_name||'Unassigned'}</td><td><StatusBadge value={row.status} audience="staff" label={label(row.status)}/></td><td>{date(row.updated_at||row.last_updated)}</td><td><Link to={staffRecordPath(row)} aria-label={`Open ${row.reference||row.reference_number}`}>Open</Link></td></tr>)}</tbody></Table>
}

export function StaffApplicationsQueue() {
  const [params,setParams]=useSearchParams(),[search,setSearch]=useState(params.get('search')||'')
  const searchFromRoute=params.get('search')||''
  useEffect(()=>setSearch(searchFromRoute),[searchFromRoute])
  useEffect(()=>{
    if(search===searchFromRoute)return
    const timer=setTimeout(()=>{const next=new URLSearchParams(params);next.set('search',search);next.set('page','1');setParams(next,{replace:true})},350)
    return()=>clearTimeout(timer)
  },[search,searchFromRoute,params,setParams])
  const state=useStaffQuery(`/api/staff/applications?${params.toString()}`)
  const filter=(key,value)=>{const next=new URLSearchParams(params);next.set(key,value);if(key!=='page')next.set('page','1');setParams(next)}
  const services=[...new Set(state.data?.options?.map(item=>item.service_name)||[])]
  const departments=[...new Map((state.data?.options||[]).filter(item=>item.department_id).map(item=>[item.department_id,item.department_name])).entries()]
  return <div className="staff-operations"><PageHeader title="Service requests" context="Department operations" description="Search and process resident applications within your authorized scope." actions={<Button variant="outline" busy={state.loading} onClick={state.refresh}>Refresh</Button>}/>
    <div className="staff-filter-grid" role="group" aria-label="Request filters">
      <label>Search<input type="search" value={search} maxLength={100} placeholder="Reference, resident or service" onChange={event=>setSearch(event.target.value)}/></label>
      <label>Status<select value={params.get('status')||''} onChange={event=>filter('status',event.target.value)}><option value="">All statuses</option>{['submitted','processing','on_hold','needs_information','approved','completed','rejected','cancelled'].map(status=><option key={status} value={status}>{label(status)}</option>)}</select></label>
      <label>Assignment<select value={params.get('assigned')||''} onChange={event=>filter('assigned',event.target.value)}><option value="">All staff</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option></select></label>
      <label>Service<select value={params.get('service')||''} onChange={event=>filter('service',event.target.value)}><option value="">All services</option>{services.map(service=><option key={service}>{service}</option>)}</select></label>
      <label>Department<select value={params.get('department_id')||''} onChange={event=>filter('department_id',event.target.value)}><option value="">All authorized departments</option>{departments.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>Submitted from<input type="date" value={params.get('from')||''} onChange={event=>filter('from',event.target.value)}/></label>
      <label>Submitted through<input type="date" value={params.get('to')||''} onChange={event=>filter('to',event.target.value)}/></label>
      <label>Sort<select value={params.get('sort')||'submitted_desc'} onChange={event=>filter('sort',event.target.value)}>{[['submitted_desc','Newest submitted'],['submitted_asc','Oldest submitted'],['updated_desc','Recently updated'],['updated_asc','Least recently updated'],['priority','Priority / due date']].map(([value,title])=><option key={value} value={value}>{title}</option>)}</select></label>
      <Button variant="outline" onClick={()=>{setSearch('');setParams({})}}>Clear filters</Button>
    </div>
    {state.error?<ErrorState message={state.error} onRetry={state.refresh}/>:state.loading?<LoadingState label="Loading requests…"/>:<section className="staff-panel"><p className="staff-scope">{state.data?.total||0} matching requests</p>{state.data?.items?.length?<StaffRecords items={state.data.items}/>:<EmptyState title="No matching requests" description="Try changing your filters."/>}<Pagination page={state.data?.page||1} totalPages={Math.ceil((state.data?.total||0)/(state.data?.limit||20))} onChange={page=>filter('page',String(page))}/></section>}
  </div>
}
