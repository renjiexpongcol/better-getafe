import { useState, useRef } from 'react'
import { useEservice, esApi, Feedback } from './EserviceUI'
import { Button } from './ui/Primitives'

export default function StaffLegacyAssignment({application,onAssigned,onBusy}) {
  const state=useEservice(signal=>esApi(`/staff/applications/${encodeURIComponent(application.id)}/assignees`,'GET',undefined,undefined,{signal}),[application.id,application.version])
  const [selected,setSelected]=useState(''),[busy,setBusy]=useState(false),pending=useRef(false)
  const assign=async()=>{
    if(pending.current)return;pending.current=true;setBusy(true);onBusy?.(true);state.setError('')
    try{
      await esApi(`/staff/applications/${encodeURIComponent(application.id)}/assign`,'POST',{assigned_user_id:selected||application.assigned_user_id,version:application.version})
      const updated=await esApi(`/staff/applications/${encodeURIComponent(application.id)}`)
      setSelected('');onAssigned(updated)
    }catch(error){state.setError(error.message)}finally{pending.current=false;setBusy(false);onBusy?.(false)}
  }
  return <div className="staff-modal-section"><h3>Assignment</h3><Feedback loading={state.loading} error={state.error}/><label htmlFor="legacy-assigned-staff">Assigned staff</label><select id="legacy-assigned-staff" disabled={busy||state.loading} value={selected||application.assigned_user_id||''} onChange={event=>setSelected(event.target.value)}><option value="">Unassigned</option>{state.data?.items?.map(member=><option key={member.id} value={member.id}>{member.name}{member.eid?` · EID ${member.eid}`:''}</option>)}</select><Button variant="outline" busy={busy} disabled={!selected||selected===application.assigned_user_id} onClick={assign}>Save assignment</Button></div>
}
