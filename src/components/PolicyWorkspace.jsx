import { useEffect, useState } from 'react'
import { securityFetch } from '../services/securityFetch'

export default function PolicyWorkspace({ currentUser, Editor, describe, directory }) {
  const [data,setData] = useState(null)
  const [error,setError] = useState('')
  const [simulation,setSimulation] = useState(null)
  const [notice,setNotice] = useState('')
  const [edit,setEdit] = useState(null)
  const [grant,setGrant] = useState(null)
  const [busy,setBusy] = useState(false)
  const base = '/api/admin/policy-workspace'
  async function load(signal) {
    const response = await securityFetch(base,{signal,credentials:'include',cache:'no-store'})
    if (!response.ok) throw new Error('The policy workspace could not be loaded.')
    setData(await response.json())
  }
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  },[])
  async function change(path,method,body,message) {
    setBusy(true); setError('')
    try {
      const response = await securityFetch(base + path,{method,credentials:'include',headers:{'Content-Type':'application/json','X-Requested-With':'GetafeCitizenPortal'},body:JSON.stringify(body)})
      if (!response.ok) throw new Error((await response.json()).error || 'Change failed.')
      setGrant(null); setNotice(message); await load()
    } catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  return <section className="access-management" aria-label="Policy workspace">
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!data && !error && <p>Loading policies…</p>}
    {data && <><div className="access-table-wrap"><table className="access-table"><thead><tr><th>Policy</th><th>Effect</th><th>Condition</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    {data.policies.map(p => <tr key={p.id}><td><strong>{p.name}</strong><small className="table-description">{p.description}</small><small>{p.permission_label || 'All group permissions'}</small></td><td>{p.effect === 'allow' ? 'Allow' : 'Deny'}</td><td>{describe(p.condition_json)}</td><td>{p.enabled?'Enabled':'Disabled'}</td><td>
      <button onClick={() => setEdit({...p,condition:p.condition_json})}>Propose change</button>
      {data.manager && <button onClick={() => setGrant(p)}>Manage delegation</button>}
    </td></tr>)}</tbody></table></div>
    {!data.policies.length && <p>No policies are available within your scope.</p>}
    {grant && <form key={grant.id} className="access-form" onSubmit={e => {e.preventDefault(); const fields=Object.fromEntries(new FormData(e.currentTarget)); change('/'+encodeURIComponent(grant.id)+'/delegation','PUT',{...fields,expires_at:fields.expires_at ? new Date(fields.expires_at).toISOString() : null},'Delegation saved.')}}>
      <h3>Delegation for {grant.name}</h3>{grant.expires_at && <p>Current expiry: {new Date(grant.expires_at).toLocaleString()}</p>}
      <label>Editor group<select name="group_id" defaultValue={grant.editor_group || ''}><option value="">No delegated group</option>{data.groups.map(g=><option key={g.id} value={g.id}>{g.name.replaceAll('_',' ')}</option>)}</select></label>
      <label>Expires at (local time)<input type="datetime-local" name="expires_at"/></label>
      <label>Reason<input required name="reason" maxLength={1000}/></label>
      <div className="access-actions"><button type="button" onClick={()=>setGrant(null)}>Cancel</button><button disabled={busy}>Save delegation</button></div>
    </form>}
    {data.manager && directory && <details><summary>Test access</summary><form className="access-form" onSubmit={async e=>{
      e.preventDefault()
      const fields=Object.fromEntries(new FormData(e.currentTarget))
      setSimulation(null); setError(''); setBusy(true)
      try {
        const response=await securityFetch(base+'/simulate',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:fields.user,permission:fields.permission,resource:{id:fields.resource,department_id:fields.department}})})
        const result=await response.json()
        if(!response.ok) throw new Error(result.error || 'Simulation failed.')
        setSimulation(result)
      } catch(e){setError(e.message)} finally {setBusy(false)}
    }}>
      <label>Employee<select required name="user">{directory.users.filter(u=>u.account_type==='employee').map(u=><option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select></label>
      <label>Action<select required name="permission">{directory.permissions.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <label>Resource ID<input name="resource"/></label><label>Department ID<input name="department"/></label>
      <button disabled={busy}>Evaluate access</button></form>
      {simulation && <section role="status"><strong>{simulation.allowed?'Allowed':'Denied'}</strong><p>{simulation.reason}</p>{simulation.sources.map(source=><p key={source.groupId}>{source.group.replaceAll('_',' ')} · {source.policies.map(p=>p.name+' ('+(p.matched?'matched':'did not match')+')').join(', ') || 'Group grant'}</p>)}</section>}
    </details>}
    <h3>Revision history</h3>{!data.revisions.length && <p>No revisions submitted.</p>}
    {data.revisions.map(r=><details key={r.id}><summary>{r.proposed_value.name} · {r.status} · {new Date(r.created_at).toLocaleString()}</summary>
      <p>{r.reason}</p><table className="access-table"><thead><tr><th>Field</th><th>Previous</th><th>Proposed</th></tr></thead><tbody>
      {['name','description','effect','enabled','condition'].map(k=><tr key={k}><th>{k}</th><td>{k==='condition'?describe(r.before_value.condition_json):String(r.before_value[k])}</td><td>{k==='condition'?describe(r.proposed_value.condition):String(r.proposed_value[k])}</td></tr>)}
      </tbody></table>
      {r.status==='pending' && data.manager && r.author_id!==currentUser.id && ['publish','reject'].map(d=><button disabled={busy} key={d} onClick={()=>change('/'+encodeURIComponent(r.id)+'/review','POST',{decision:d},'Review saved.')}>{d==='publish'?'Approve and publish':'Reject'}</button>)}
      {r.status==='published' && <button onClick={()=>{const p=data.policies.find(x=>x.id===r.policy_id); if(p)setEdit({...p,...r.before_value,updated_at:p.updated_at,condition:r.before_value.condition_json})}}>Propose restoring previous version</button>}
    </details>)}</>}
    {edit && <Editor policy={edit} onClose={()=>setEdit(null)} onSaved={async()=>{setEdit(null);setNotice('Revision submitted for independent approval.');await load()}}/>}
  </section>
}
