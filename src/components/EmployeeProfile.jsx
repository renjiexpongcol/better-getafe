import { useEffect, useState } from 'react';

const personnelFields = { phone:'Phone number',hire_date:'Hire date',employment_type:'Employment type',office_assignment:'Office assignment',employment_status:'Employment status' };
const date = value => value ? new Date(value).toLocaleString('en-PH', { timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short' }) : 'Never';

export default function EmployeeProfile({ userId, canEdit, canGrantSuper = false }) {
  const [profile,setProfile] = useState(null), [form,setForm] = useState({}), [account,setAccount] = useState({}), [directory,setDirectory] = useState([]), [error,setError] = useState(''), [busy,setBusy] = useState(false), [notice,setNotice] = useState('');
  const load = async () => {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/profile`, { credentials:'include' });
    if (!response.ok) throw new Error('Employee profile is unavailable.');
    const body = await response.json(); setProfile(body);
    setAccount(Object.fromEntries(['name','email','department','position','role'].map(field => [field,body[field] || ''])));
    setForm({ ...Object.fromEntries(Object.keys(personnelFields).map(field => [field,field === 'hire_date' ? body[field]?.slice(0,10) || '' : body[field] || ''])),supervisor_id:body.supervisor_id || '' });
  };
  useEffect(() => { load().catch(error => setError(error.message)); }, [userId]);
  useEffect(() => { if (canEdit) fetch('/api/admin/users', { credentials:'include' }).then(response => response.ok ? response.json() : { users:[] }).then(body => setDirectory(body.users || [])).catch(() => {}); }, [canEdit]);
  const saveAccount = async event => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method:'PATCH',credentials:'include',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(account) });
      if (!response.ok) throw new Error('Account details could not be saved. Check your access and entered values.');
      await load(); setNotice('Account details saved.');
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/profile`, { method:'PATCH',credentials:'include',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(form) });
      if (!response.ok) throw new Error('Personnel details could not be saved. Check the entered values.');
      await load(); setNotice('Personnel details saved.');
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  if (!profile) return <p role={error ? 'alert' : 'status'}>{error || 'Loading employee profile…'}</p>;
  const information = { 'Employee ID':`EID ${profile.eid}`,'Name':profile.name,'Work email':profile.email,'Department':profile.department,'Position':profile.position,'Role':profile.role,'Permission groups':profile.groups.map(group => group.name).join(', ') || 'None','Account status':profile.account_status,'Employment status':profile.employment_status,'Account created':date(profile.account_created_at),'Profile created':date(profile.created_at),'Last updated':date([profile.updated_at,profile.account_updated_at].sort().at(-1)),'Created by':profile.creator_name ? `${profile.creator_name} · EID ${profile.creator_eid}` : 'System','MFA':profile.mfa_status,'Last login':date(profile.last_login_at),'Password':profile.password_status,'Avatar':profile.avatar_storage_path ? 'Uploaded' : 'Default avatar','Login identifier':profile.email };
  return <section className="employee-profile"><h3>Employee profile</h3><dl className="access-profile">{Object.entries(information).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not assigned'}</dd></div>)}</dl>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {canEdit && <form className="access-form" onSubmit={saveAccount}><fieldset disabled={busy}><legend>Account details</legend>{['name','email','department','position'].map(field => <label key={field}>{({ name:'Full name',email:'Work email',department:'Department',position:'Position' })[field]}<input required type={field === 'email' ? 'email' : 'text'} maxLength={field === 'email' ? 254 : 160} value={account[field]} onChange={event => setAccount({ ...account,[field]:event.target.value })}/></label>)}<label>Role<select value={account.role} onChange={event => setAccount({ ...account,role:event.target.value })}>{['staff','content_manager','it_support','admin',...(canGrantSuper ? ['super_admin'] : []),'disabled'].map(role => <option key={role}>{role}</option>)}</select></label><button>{busy ? 'Saving…' : 'Save account details'}</button></fieldset></form>}
    <form className="access-form" onSubmit={save}><fieldset disabled={!canEdit || busy}><legend>Personnel information</legend>{Object.entries(personnelFields).map(([field,label]) => <label key={field}>{label}<input type={field === 'hire_date' ? 'date' : 'text'} maxLength={field === 'phone' ? 32 : ['employment_type','employment_status'].includes(field) ? 64 : 160} required={field === 'employment_status'} value={form[field]} onChange={event => setForm({ ...form,[field]:event.target.value })}/></label>)}<label>Supervisor<select value={form.supervisor_id} onChange={event => setForm({ ...form,supervisor_id:event.target.value })}><option value="">Not assigned</option>{directory.filter(user => user.id !== userId).map(user => <option key={user.id} value={user.id}>{user.name} · EID {user.eid}</option>)}</select></label>{canEdit && <button disabled={busy}>{busy ? 'Saving…' : 'Save personnel details'}</button>}</fieldset></form></section>;
}
