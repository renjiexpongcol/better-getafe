import { useEffect, useState } from 'react'
import { ArrowRight, Bell, CheckCircle2, CircleHelp, ClipboardList, Clock3, ChevronDown, LayoutDashboard, LogOut, Menu, RefreshCw, Search, Settings2, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './StaffSysparm.css'
import './StaffHeader.css'
import './StaffRequestModal.css'
import FulfillmentNoteModal from './FulfillmentNoteModal'
import StaffRequestModal from './StaffRequestModal'

const dateLabel = value => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not available'
const statusLabel = value => String(value || 'submitted').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase())

export default function StaffSysparm() {
  const { user, logout } = useAuth()
  const [params] = useSearchParams()
  const objectId = params.get('sysparm_object_id') || 'dashboard'
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [requestStatus, setRequestStatus] = useState('submitted')
  const [requestNote, setRequestNote] = useState('')
  const [requestNotice, setRequestNotice] = useState('')
  const [savingRequest, setSavingRequest] = useState(false)
  const [requestFile, setRequestFile] = useState(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [fulfillmentOpen, setFulfillmentOpen] = useState(false)
  const [fulfillmentError, setFulfillmentError] = useState('')
  const can = permission => user?.permissions?.includes(permission)

  const loadDashboard = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/staff/dashboard', { credentials: 'include', headers: { 'X-Requested-With': 'GetafeCitizenPortal' } })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Staff requests could not be loaded.')
      setDashboard(body)
    } catch (loadError) { setError(loadError.message) } finally { setLoading(false) }
  }

  useEffect(() => { loadDashboard() }, [])

  const openRequest = async application => {
    setSelectedRequest(application)
    setRequestStatus(application.status || 'submitted')
    setRequestNote('')
    setRequestError('')
    setRequestNotice('')
    setRequestFile(null)
    setRequestLoading(true)
    try {
      const response = await fetch(`/api/staff/applications/${encodeURIComponent(application.id)}`, { credentials: 'include', headers: { 'X-Requested-With': 'GetafeCitizenPortal' } })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'The service request could not be opened.')
      setSelectedRequest(body)
      setRequestStatus(body.status || 'submitted')
    } catch (loadError) { setRequestError(loadError.message) } finally { setRequestLoading(false) }
  }

  const closeRequest = () => { if (!savingRequest) setSelectedRequest(null) }

  const saveRequest = async event => {
    event.preventDefault()
    if (selectedRequest && requestStatus !== String(selectedRequest.status || '').toLowerCase()) {
      setFulfillmentError('')
      setFulfillmentOpen(true)
      return
    }
    await commitRequest({ note: requestNote })
  }

  const commitRequest = async fulfillment => {
    setSavingRequest(true)
    setRequestError('')
    setRequestNotice('')
    try {
      const response = await fetch(`/api/staff/applications/${encodeURIComponent(selectedRequest.id)}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal' }, body: JSON.stringify({ status: requestStatus, previous_status: selectedRequest.status, fulfillment }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'The service request could not be updated.')
      setSelectedRequest(body.application)
      setRequestNote('')
      setRequestNotice('Request updated and the resident has been notified.')
      setFulfillmentOpen(false)
      await loadDashboard()
      if (body.closed) setSelectedRequest(null)
    } catch (saveError) { setRequestError(saveError.message); setFulfillmentError(saveError.message) } finally { setSavingRequest(false) }
  }

  const confirmFulfillment = fulfillment => commitRequest(fulfillment)

  const uploadRequestFile = async eventOrFile => {
    if (eventOrFile?.preventDefault) eventOrFile.preventDefault()
    const nextFile = eventOrFile instanceof File ? eventOrFile : requestFile
    if (!nextFile || !selectedRequest) return
    setUploadingFile(true)
    setRequestError('')
    setRequestNotice('')
    try {
      const response = await fetch(`/api/staff/applications/${encodeURIComponent(selectedRequest.id)}/documents?name=${encodeURIComponent(nextFile.name)}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': nextFile.type, 'X-Requested-With': 'GetafeCitizenPortal' }, body: nextFile })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'The document could not be uploaded.')
      setRequestFile(null)
      setRequestNotice('Document uploaded. The resident can now download it from My Documents.')
      await openRequest(selectedRequest)
    } catch (uploadError) { setRequestError(uploadError.message) } finally { setUploadingFile(false) }
  }

  useEffect(() => {
    if (requestFile && !uploadingFile) uploadRequestFile(requestFile)
  }, [requestFile])

  const signOut = async () => {
    const result = await logout()
    if (result.ok) navigate('/auth/login', { replace: true })
  }

  return (
    <main className="staff-workspace">
      <aside className={`staff-sidebar${menuOpen ? ' open' : ''}`}>
        <div className="staff-brand">
          <img src="/assets/getafe-seal.png" alt="Municipality of Getafe" />
          <span><strong>Municipal staff</strong><small>Getafe citizen portal</small></span>
          <button type="button" className="staff-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={19} /></button>
        </div>
        <nav className="staff-nav" aria-label="Staff workspace">
          {can('staff.dashboard.view') && <Link className={objectId === 'dashboard' ? 'active' : ''} to="/app/staff?sysparm_object_id=dashboard"><LayoutDashboard size={18} />Workspace</Link>}
          {can('requests.view') && <Link className={objectId === 'request-management' ? 'active' : ''} to="/app/staff?sysparm_object_id=request-management"><ClipboardList size={18} />Service requests</Link>}
          {can('notifications.view') && <Link className={objectId === 'notifications' ? 'active' : ''} to="/app/staff?sysparm_object_id=notifications"><Bell size={18} />Notifications</Link>}
          {can('settings.view') && <Link className={objectId === 'system-settings' ? 'active' : ''} to="/app/staff?sysparm_object_id=system-settings"><Settings2 size={18} />System parameters</Link>}
        </nav>
      </aside>

      <section className="staff-main">
        <header className="staff-header">
          <button type="button" className="staff-menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="staff-top-actions">
            <label className="staff-search"><Search size={18}/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search services, news, and information" aria-label="Search services, news, and information"/></label>
            <Link className="staff-icon-button" to="/app/staff?sysparm_object_id=help" aria-label="Help and support"><CircleHelp size={18}/></Link>
            <button type="button" className="staff-icon-button" aria-label="Notifications"><Bell size={18}/></button>
            <div className="staff-profile-wrap"><button type="button" className="staff-profile-button" onClick={() => setProfileOpen(current => !current)} aria-expanded={profileOpen}><span>{(user?.name || 'Staff').slice(0, 1).toUpperCase()}</span><b>{user?.name || 'Municipal staff'}</b><ChevronDown size={15}/></button>{profileOpen && <div className="staff-profile-menu"><strong>{user?.name || 'Municipal staff'}</strong><small>{user?.email || 'Staff account'}</small><button type="button" onClick={signOut}><LogOut size={15}/>Sign out</button></div>}</div>
          </div>
        </header>
        <div className="staff-content">
          {error && <div className="staff-error" role="alert">{error}</div>}
          <section className="staff-stats" aria-label="Service request summary">
            {[[ClipboardList, 'Total requests', dashboard?.counts.total], [Clock3, 'Pending review', dashboard?.counts.pending], [RefreshCw, 'In progress', dashboard?.counts.inProgress], [CheckCircle2, 'Completed', dashboard?.counts.completed]].map(([Icon, label, value]) => <article key={label}><span><Icon size={19}/></span><div><small>{label}</small><strong>{loading ? '—' : value ?? 0}</strong></div></article>)}
          </section>
          <section className="staff-panel staff-requests-panel">
            <div className="staff-panel-heading"><div><p className="staff-eyebrow">Service requests</p><h2>Recent resident applications</h2></div><Link to="/app/staff?sysparm_object_id=request-management">View all <ArrowRight size={17}/></Link></div>
            {loading ? <p className="staff-empty">Loading service requests…</p> : dashboard?.applications?.length ? <div className="staff-request-table"><div className="staff-request-row staff-request-heading"><span>Resident</span><span>Service</span><span>Reference</span><span>Status</span><span>Submitted</span></div>{dashboard.applications.slice(0, 8).map(application => <div className="staff-request-row staff-request-row-clickable" key={application.id} role="button" tabIndex="0" onClick={() => openRequest(application)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRequest(application) } }}><span><strong>{application.resident_name}</strong><small>{application.resident_email}</small></span><span>{application.service_name}</span><span className="staff-reference">{application.reference_number}</span><span><b className={`staff-status ${String(application.status || '').toLowerCase()}`}>{statusLabel(application.status)}</b></span><span>{dateLabel(application.submitted_at || application.last_updated)}</span></div>)}</div> : <p className="staff-empty">No service requests have been submitted yet.</p>}
          </section>
          <StaffRequestModal selectedRequest={selectedRequest} requestLoading={requestLoading} requestStatus={requestStatus} setRequestStatus={setRequestStatus} requestNote={requestNote} setRequestNote={setRequestNote} requestError={requestError} requestNotice={requestNotice} savingRequest={savingRequest} closeRequest={closeRequest} saveRequest={saveRequest} requestFile={requestFile} setRequestFile={setRequestFile} uploadingFile={uploadingFile}/>
          {fulfillmentOpen && selectedRequest && <FulfillmentNoteModal previousStatus={selectedRequest.status || 'submitted'} nextStatus={requestStatus} onClose={() => setFulfillmentOpen(false)} onConfirm={confirmFulfillment} saving={savingRequest} error={fulfillmentError}/>} 
        </div>
      </section>
    </main>
  )
}
