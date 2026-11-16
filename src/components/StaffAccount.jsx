import { useRef, useState } from 'react'
import { useEservice, esApi, Feedback } from './EserviceUI'
import { routeRequest } from '../services/routeRequests'
import { PageHeader, Button, MetadataList } from './ui/Primitives'
import PasswordChangeModal from './PasswordChangeModal'
import './StaffOperations.css'

export default function StaffAccount({module}) {
  return module==='profile'?<StaffProfile/>:<StaffSecurity/>
}
function StaffProfile() {
  const state=useEservice(signal=>routeRequest('/api/staff/me',{signal,scope:'staff:self'}),[])
  const [phone,setPhone]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),pending=useRef(false)
  const save=async event=>{
    event.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setNotice('');state.setError('')
    try{await esApi('/staff/me','PATCH',{phone:phone??state.data?.phone??''});await state.refresh();setNotice('Contact number updated.');setPhone(null)}catch(error){state.setError(error.message)}finally{pending.current=false;setBusy(false)}
  }
  const profile=state.data
  return <div className="staff-account-grid staff-profile">
    <PageHeader title="My profile" description="Your employee identity and contact details."/>
    <Feedback loading={state.loading} error={state.error} notice={notice}/>
    {profile&&<section className="staff-panel">
      <MetadataList items={['name','email','eid','department','position','role'].map(key=>({label:key==='eid'?'Employee ID':key.replace(/\b\w/g,c=>c.toUpperCase()),value:profile[key]||'Not assigned'}))}/>
      <form className="staff-profile-contact" onSubmit={save}>
        <label htmlFor="staff-profile-phone">Contact number<input id="staff-profile-phone" type="tel" autoComplete="tel" maxLength={32} disabled={busy} value={phone??profile.phone??''} onChange={event=>setPhone(event.target.value)}/></label>
        <Button type="submit" busy={busy}>Save contact number</Button>
      </form>
      <p className="staff-scope">Employee identity and department assignments are maintained by your administrator.</p>
    </section>}
  </div>
}
function StaffSecurity() {
  const state=useEservice(signal=>routeRequest('/api/account/mfa',{signal,scope:'staff:self'}),[])
  const sessions=useEservice(signal=>routeRequest('/api/auth/sessions',{signal,scope:'staff:self'}),[])
  const [passwordOpen,setPasswordOpen]=useState(false),[password,setPassword]=useState(''),[code,setCode]=useState(''),[enrollment,setEnrollment]=useState(null),[recovery,setRecovery]=useState([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),pending=useRef(false),passwordButton=useRef(null)
  const action=async(task)=>{
    if(pending.current)return;pending.current=true;setBusy(true);setNotice('');state.setError('')
    try{await task()}catch(error){state.setError(error.message)}finally{pending.current=false;setBusy(false)}
  }
  const setup=event=>{event.preventDefault();action(async()=>{const result=await esApi('/account/mfa/setup','POST',{password});setPassword('');setEnrollment(result)})}
  const activate=event=>{event.preventDefault();action(async()=>{const result=await esApi('/account/mfa/activate','POST',{enrollmentId:enrollment.enrollmentId,code});setCode('');setEnrollment(null);setRecovery(result.recoveryCodes);await state.refresh();await sessions.refresh();setNotice('Authenticator verification enabled. Save your recovery codes.')})}
  const disable=event=>{event.preventDefault();action(async()=>{await esApi('/account/mfa/disable','POST',{password,code});setPassword('');setCode('');setRecovery([]);await state.refresh();await sessions.refresh();setNotice('Authenticator verification disabled.')})}
  return <div className="staff-account-grid"><PageHeader title="Account security" description="Manage your password, authenticator, and active sessions."/><Feedback loading={state.loading} error={state.error} notice={notice}/>
    <section className="staff-panel"><h2>Password</h2><Button ref={passwordButton} variant="outline" onClick={()=>setPasswordOpen(true)}>Change password</Button></section>
    <section className="staff-panel"><h2>Authenticator verification</h2>{state.data&&<><p>{state.data.enabled?'Enabled. Sign-in requires your authenticator or a recovery code.':'Add a time-based verification code to your staff sign-in.'}</p>{enrollment?<form onSubmit={activate}><img src={enrollment.qrCode} width={240} height={240} alt="Scan this QR code in your authenticator app"/><label>Authenticator code<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event=>setCode(event.target.value)}/></label><Button type="submit" busy={busy}>Enable authenticator</Button><Button variant="outline" onClick={()=>{setEnrollment(null);setCode('')}}>Cancel setup</Button></form>:<form onSubmit={state.data.enabled?disable:setup}><label>Current password<input type="password" required autoComplete="current-password" maxLength={1024} value={password} onChange={event=>setPassword(event.target.value)}/></label>{state.data.enabled&&<label>Authenticator or recovery code<input required autoComplete="one-time-code" maxLength={100} value={code} onChange={event=>setCode(event.target.value)}/></label>}<Button variant="outline" type="submit" busy={busy}>{state.data.enabled?'Disable authenticator':'Set up authenticator'}</Button></form>}</>}
      {recovery.length>0&&<div role="status"><h3>Save these recovery codes</h3><p>Each code works once. They are displayed only after setup.</p><ul>{recovery.map(value=><li key={value}><code>{value}</code></li>)}</ul><Button variant="outline" onClick={()=>setRecovery([])}>I have saved my codes</Button></div>}
    </section>
    <section className="staff-panel"><h2>Active sessions</h2><Feedback loading={sessions.loading} error={sessions.error}/><Button variant="outline" onClick={sessions.refresh} disabled={sessions.loading}>Refresh sessions</Button><ul className="staff-history">{sessions.data?.sessions?.map(session=><li key={session.id}><div><strong>{session.current?'This session':'Other signed-in session'}</strong><p>Session {session.id.slice(0,8)}</p>{!session.current&&<Button variant="outline" busy={busy} onClick={()=>action(async()=>{await esApi(`/auth/sessions/${encodeURIComponent(session.id)}`,'DELETE',{});await sessions.refresh();setNotice('Session signed out.')})}>Sign out session</Button>}</div></li>)}</ul></section>
    {passwordOpen&&<PasswordChangeModal onClose={()=>{setPasswordOpen(false);sessions.refresh()}} returnFocusRef={passwordButton}/>}
  </div>
}
