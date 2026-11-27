import { useEffect,useState } from 'react'
import { securityFetch } from '../services/securityFetch.js'

const labels={repair:'Repair missing objects',migrate:'Apply pending migrations',seed:'Restore missing system records','rebuild-derived':'Rebuild available search data',reconcile:'Reconcile Azure metadata'}
async function request(body){
  const response=await securityFetch('/api/admin/settings/database-management',{credentials:'include',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})})
  const result=await response.json()
  if(!response.ok)throw new Error(result.error||'Database inspection is unavailable.')
  return result
}
export default function DatabaseManagementPanel(){
  const [report,setReport]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const [job,setJob]=useState(null)
  const [action,setAction]=useState('repair'),[code,setCode]=useState(''),[confirmed,setConfirmed]=useState(false)
  const inspect=async()=>{setBusy(true);setError('');try{setReport(await request())}catch(error){setError(error.message)}finally{setBusy(false)}}
  useEffect(()=>{let active=true;request().then(result=>{if(active)setReport(result)}).catch(error=>{if(active)setError(error.message)});return()=>{active=false}},[])
  const queue=async()=>{setBusy(true);setError('');setMessage('');try{const result=await request({action,code,confirmed});setJob(result);setMessage(`${result.message} Operation: ${result.id}`);setCode('');setConfirmed(false);setReport(await request())}catch(error){setError(error.message)}finally{setBusy(false)}}
  const exportReport=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='database-health.json';link.click();URL.revokeObjectURL(url)}
  return <section className="settings-section" aria-labelledby="database-management-heading">
    <h2 id="database-management-heading">Database management</h2>
    <p>Inspect the complete installation and request maintenance. Schema changes run through an authorized operator with separate migration access.</p>
    {error&&<p role="alert" className="settings-notice">{error}</p>}
    {message&&<p role="status" className="settings-notice">{message}</p>}
    {job?.command&&<details><summary>Operator execution command</summary><p>Run this in the configured operator checkout, then refresh the inspection to see completion.</p><code>{job.command}</code></details>}
    {!report&&!error&&<p role="status">Inspecting database…</p>}
    {report&&<>
      <dl className="database-health-grid">
        {[['Status',report.state],['Provider','Supabase PostgreSQL'],['Database identity',report.identity.instance||'Not initialized'],['Tables',report.tables],['Expected objects',report.expectedObjects??'Not verified'],['Existing objects',report.actualObjects],['Pending migrations',report.pendingMigrations.length],['Missing objects',report.missingObjects.length],['Missing system records',report.missingSystemRecords.length],['Discovered API handlers',report.discovery.handlers],['Verification',new Date(report.checkedAt).toLocaleString()]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {report.lastOperation&&<p>Latest operation: {report.lastOperation.operation} — {report.lastOperation.state}. <small>{report.lastOperation.id}</small></p>}
      <div className="database-health-actions"><button type="button" className="settings-button secondary" disabled={busy} onClick={inspect}>{busy?'Checking…':'Inspect complete database'}</button><button type="button" className="settings-button secondary" disabled={busy} onClick={()=>request({action:'connection'}).then(result=>setMessage(result.connected?'Database connection verified.':'Database connection is unavailable.')).catch(error=>setError(error.message))}>Test connection</button><button type="button" className="settings-button secondary" disabled={busy} onClick={()=>request({action:'validate'}).then(result=>setMessage(`Schema validation: ${result.state}.`)).catch(error=>setError(error.message))}>Validate complete schema</button><button type="button" className="settings-button secondary" onClick={exportReport}>Export health report</button></div>
      {(report.missingObjects.length>0||report.schemaDrift.length>0)&&<details><summary>Schema findings</summary><ul>{[...report.missingObjects,...report.schemaDrift].map((item,index)=><li key={index}>{item.kind}: {item.table?`${item.table}.`:''}{item.name||'Access grants'}</li>)}</ul></details>}
      <fieldset disabled={busy} className="database-maintenance-request"><legend>Request authorized maintenance</legend>
        <label>Maintenance action<select value={action} onChange={event=>setAction(event.target.value)}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>Authenticator code<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))}/></label>
        <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I confirm this request for the database shown above.</label>
        <button type="button" className="settings-button secondary" disabled={!confirmed||code.length!==6} onClick={queue}>Request maintenance</button>
      </fieldset>
    </>}
  </section>
}
