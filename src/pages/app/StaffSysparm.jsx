import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Bell, CheckCircle2, CircleHelp, ClipboardList, Clock3, ChevronLeft, ChevronRight, ChevronDown, LayoutDashboard, LogOut, Menu, RefreshCw, Search, Settings, X } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { requestJson } from '../../services/apiTransport'
import { useAuth } from '../../context/AuthContext'
import { resolveModuleAccess } from '../../applicationModuleRegistry'
import { ModuleAccessDeniedPage, ModuleNotFoundPage } from '../../components/RouteStatusPages'
import './StaffSysparm.css'
import './StaffHeader.css'
import './StaffRequestModal.css'
import FulfillmentNoteModal from './FulfillmentNoteModal'
import StaffRequestModal from './StaffRequestModal'
import StaffEservices from '../../components/StaffEservices'
import StaffUtilityPages from '../../components/StaffUtilityPages'
import { ROUTES, staffLocation } from '../../routeRegistry'

const dateLabel = value => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not available'
const statusLabel = value => String(value || 'submitted').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase())

export default function StaffSysparm() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const routeState = staffLocation(location.pathname)
  const currentRecordRef = useRef(routeState?.recordId)
  currentRecordRef.current = routeState?.recordId
  const objectId = routeState?.module || 'dashboard'
  const moduleAccess = resolveModuleAccess('staff', objectId, user)
  const navigate = useNavigate()
  const operationRef = useRef(false), sidebarRef = useRef(null), menuRef = useRef(null), profileRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [requestPage, setRequestPage] = useState(1)
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
  const matchingRequests = (dashboard?.applications || []).filter(application => [application.resident_name, application.resident_email, application.service_name, application.reference_number].some(value => String(value || '').toLowerCase().includes(search.toLowerCase().trim())))
  const requestPages = Math.max(1, Math.ceil(matchingRequests.length / 10)), currentPage = Math.min(requestPage, requestPages)
  const visibleRequests = objectId === 'request-management' ? matchingRequests.slice((currentPage - 1) * 10, currentPage * 10) : matchingRequests.slice(0, 8)
  useEffect(() => { setRequestPage(1) }, [search, objectId])
  const can = permission => user?.permissions?.includes(permission)

  const loadDashboard = async () => {
    setLoading(true)
    setError('')
    try {
      const body = await requestJson('/staff/dashboard')
      setDashboard(body)
    } catch (loadError) { setError(loadError.message) } finally { setLoading(false) }
  }

  useEffect(() => { if (['dashboard', 'request-management'].includes(objectId)) loadDashboard() }, [objectId])

  const openRequest = application => navigate(ROUTES.staff.request(application.id))
  useEffect(() => {
    const controller = new AbortController(), id = routeState?.recordId
    setFulfillmentOpen(false); setRequestNote(''); setRequestError(''); setRequestNotice(''); setRequestFile(null)
    if (!id) { setSelectedRequest(null); setRequestLoading(false); return }
    setSelectedRequest({ id, service_name: 'Service request' }); setRequestLoading(true)
    requestJson(`/staff/applications/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(body => { if (!controller.signal.aborted) { setSelectedRequest(body); setRequestStatus(body.status || 'submitted') } })
      .catch(issue => { if (!controller.signal.aborted) setRequestError(issue.message) })
      .finally(() => { if (!controller.signal.aborted) setRequestLoading(false) })
    return () => controller.abort()
  }, [routeState?.recordId])
  useEffect(() => { setMenuOpen(false); setProfileOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    const sidebar = sidebarRef.current, main = document.querySelector('.staff-main'), previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'; if (main) main.inert = true
    sidebar.querySelector('button')?.focus()
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false) }
      if (event.key === 'Tab') {
        const controls = [...sidebar.querySelectorAll('button:not(:disabled),a[href]')].filter(node => node.getClientRects().length), first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = previous; if (main) main.inert = false; menuRef.current?.focus() }
  }, [menuOpen])
  useEffect(() => {
    if (!profileOpen) return
    const outside = event => { if (!profileRef.current?.contains(event.target)) setProfileOpen(false) }
    const escape = event => { if (event.key === 'Escape') { setProfileOpen(false); profileRef.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [profileOpen])
  const closeRequest = () => { if (!operationRef.current) { setSelectedRequest(null); setFulfillmentOpen(false); navigate(ROUTES.staff.requests) } }

  const saveRequest = async event => {
    event.preventDefault()
    if (operationRef.current || requestLoading) return
    if (selectedRequest && requestStatus !== String(selectedRequest.status || '').toLowerCase()) {
      setFulfillmentError('')
      setFulfillmentOpen(true)
      return
    }
    await commitRequest({ note: requestNote })
  }

  const commitRequest = async fulfillment => {
    if (operationRef.current || !selectedRequest) return
    operationRef.current = true
    const recordId = selectedRequest.id
    setSavingRequest(true)
    setRequestError('')
    setRequestNotice('')
    try {
      const body = await requestJson(`/staff/applications/${encodeURIComponent(selectedRequest.id)}`, { method: 'PATCH', body: JSON.stringify({ status: requestStatus, previous_status: selectedRequest.status, fulfillment }) })
      if (currentRecordRef.current !== recordId) return
      setSelectedRequest(body.application)
      setRequestNote('')
      setRequestNotice('Request updated and the resident has been notified.')
      setFulfillmentOpen(false)
      await loadDashboard()
      if (body.closed) { setSelectedRequest(null); navigate(ROUTES.staff.requests) }
    } catch (saveError) { if (currentRecordRef.current === recordId) { setRequestError(saveError.message); setFulfillmentError(saveError.message) } } finally { operationRef.current = false; setSavingRequest(false) }
  }

  const confirmFulfillment = fulfillment => commitRequest(fulfillment)

  const uploadRequestFile = async eventOrFile => {
    if (eventOrFile?.preventDefault) eventOrFile.preventDefault()
    const nextFile = eventOrFile instanceof File ? eventOrFile : requestFile
    if (!nextFile || !selectedRequest || operationRef.current) return
    if (nextFile.size > 5 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(nextFile.type)) { setRequestError('Choose a PDF, JPEG, or PNG up to 5 MB.'); return }
    operationRef.current = true
    const recordId = selectedRequest.id
    setUploadingFile(true)
    setRequestError('')
    setRequestNotice('')
    try {
      await requestJson(`/staff/applications/${encodeURIComponent(selectedRequest.id)}/documents?name=${encodeURIComponent(nextFile.name)}`, { method: 'POST', headers: { 'Content-Type': nextFile.type }, body: nextFile })
      if (currentRecordRef.current !== recordId) return
      setRequestFile(null)
      // Keep unsaved note/status while refreshing only the server record.
      try {
        const refreshed = await requestJson(`/staff/applications/${encodeURIComponent(recordId)}`)
        if (currentRecordRef.current !== recordId) return
        setSelectedRequest(refreshed)
      } catch { /* Confirmed upload still succeeded. */ }
      setRequestNotice('Document uploaded. The resident can now download it from My Documents.')
    } catch (uploadError) { if (currentRecordRef.current === recordId) setRequestError(uploadError.message) } finally { operationRef.current = false; setUploadingFile(false) }
  }

  const signOut = async () => {
    const result = await logout()
    if (result.ok) navigate('/auth/login', { replace: true }); else setError(result.error)
  }

  if (!routeState || moduleAccess.state === 'not-found') return <main className="staff-workspace"><ModuleNotFoundPage home={ROUTES.staff.root} /></main>
  if (moduleAccess.state === 'forbidden') return <main className="staff-workspace"><ModuleAccessDeniedPage /></main>

  return (
    <main className="staff-workspace">
      {menuOpen && <button type="button" className="staff-navigation-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)}/>}
      <aside ref={sidebarRef} role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen || undefined} aria-label="Staff navigation" className={`staff-sidebar${menuOpen ? ' open' : ''}`}>
        <div className="staff-brand">
          <img src="/assets/getafe-seal.png" alt="Municipality of Getafe" />
          <span><strong>Municipal staff</strong><small>Getafe citizen portal</small></span>
          <button type="button" className="staff-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu" data-icon-button="ghost"><X size={19} /></button>
        </div>
        <nav className="staff-nav" aria-label="Staff workspace">
          {can('staff.dashboard.view') && <Link className={objectId === 'dashboard' ? 'active' : ''} to={ROUTES.staff.root}><LayoutDashboard size={18} />Workspace</Link>}
          {can('requests.view') && <Link className={objectId === 'request-management' ? 'active' : ''} to={ROUTES.staff.requests}><ClipboardList size={18} />Service requests</Link>}
          {can('requests.department.view') && <Link className={objectId === 'e-service-requests' ? 'active' : ''} to="/app/staff/e-requests"><ClipboardList size={18}/>E-service requests</Link>}
          {can('notifications.view') && <Link className={objectId === 'notifications' ? 'active' : ''} to={ROUTES.staff.notifications}><Bell size={18} />Notifications</Link>}
          {can('settings.view') && <Link className={objectId === 'system-settings' ? 'active' : ''} to={ROUTES.staff.settings}><Settings size={18} />System parameters</Link>}
        </nav>
      </aside>

      <section className="staff-main">
        <header className="staff-header">
          <button type="button" ref={menuRef} className="staff-menu-toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} aria-label="Open menu" data-icon-button="ghost"><Menu size={21} /></button>
          <div className="staff-top-actions">
            {objectId !== 'e-service-requests' && <label className="staff-search"><Search size={18}/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search resident requests" aria-label="Search resident requests"/></label>}
            <Link className="staff-icon-button" to={ROUTES.staff.help} aria-label="Help and support" data-icon-button="ghost"><CircleHelp size={18}/></Link>
            <Link className="staff-icon-button" to={ROUTES.staff.notifications} aria-label="Notifications" data-icon-button="ghost"><Bell size={18}/></Link>
            <div ref={profileRef} className="staff-profile-wrap"><button type="button" className="staff-profile-button" data-icon-button="ghost" aria-label="Open account menu" onClick={() => setProfileOpen(current => !current)} aria-expanded={profileOpen}><span>{(user?.name || 'Staff').slice(0, 1).toUpperCase()}</span><b>{user?.name || 'Municipal staff'}</b><ChevronDown size={15}/></button>{profileOpen && <div className="staff-profile-menu"><strong>{user?.name || 'Municipal staff'}</strong><small>{user?.email || 'Staff account'}{user?.eid ? ` · EID ${user.eid}` : ''}</small><button type="button" onClick={signOut}><LogOut size={15}/>Sign out</button></div>}</div>
          </div>
        </header>
        <div className="staff-content">
          {objectId === 'e-service-requests' ? <StaffEservices /> : ['notifications', 'system-settings', 'help'].includes(objectId) ? <StaffUtilityPages module={objectId}/> : <>
          {error && <div className="staff-error" role="alert">{error}</div>}
          <section className="staff-stats" aria-label="Service request summary">
            {[[ClipboardList, 'Total requests', dashboard?.counts.total], [Clock3, 'Pending review', dashboard?.counts.pending], [RefreshCw, 'In progress', dashboard?.counts.inProgress], [CheckCircle2, 'Completed', dashboard?.counts.completed]].map(([Icon, label, value]) => <article key={label}><span><Icon size={19}/></span><div><small>{label}</small><strong>{loading ? '—' : value ?? 0}</strong></div></article>)}
          </section>
          <section className="staff-panel staff-requests-panel">
            <div className="staff-panel-heading"><div><p className="staff-eyebrow">Service requests</p><h2>Recent resident applications</h2></div><Link to={ROUTES.staff.requests}>View all <ArrowRight size={17}/></Link></div>
            {loading ? <p className="staff-empty">Loading service requests…</p> : matchingRequests.length ? <div className="staff-request-table"><div className="staff-request-row staff-request-heading"><span>Resident</span><span>Service</span><span>Reference</span><span>Status</span><span>Submitted</span></div>{visibleRequests.map(application => <div className="staff-request-row staff-request-row-clickable" key={application.id} role="button" tabIndex="0" onClick={() => openRequest(application)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRequest(application) } }}><span><strong>{application.resident_name}</strong><small>{application.resident_email}</small></span><span>{application.service_name}</span><span className="staff-reference">{application.reference_number}</span><span><b className={`staff-status ${String(application.status || '').toLowerCase()}`}>{statusLabel(application.status)}</b></span><span>{dateLabel(application.submitted_at || application.last_updated)}</span></div>)}</div> : <p className="staff-empty">{search.trim() ? 'No requests match your search. Try a resident name, service, or reference.' : 'No service requests have been submitted yet.'}</p>}
            {objectId === 'request-management' && requestPages > 1 && <nav className="staff-request-pager" aria-label="Service request pages"><button type="button" disabled={currentPage === 1} onClick={() => setRequestPage(currentPage - 1)} aria-label="Previous requests page" data-icon-button="ghost"><ChevronLeft size={18}/></button><span>Page {currentPage} of {requestPages}</span><button type="button" disabled={currentPage === requestPages} onClick={() => setRequestPage(currentPage + 1)} aria-label="Next requests page" data-icon-button="ghost"><ChevronRight size={18}/></button></nav>}
          </section>
          <StaffRequestModal selectedRequest={selectedRequest} requestLoading={requestLoading} requestStatus={requestStatus} setRequestStatus={setRequestStatus} requestNote={requestNote} setRequestNote={setRequestNote} requestError={requestError} requestNotice={requestNotice} savingRequest={savingRequest} closeRequest={closeRequest} saveRequest={saveRequest} requestFile={requestFile} setRequestFile={setRequestFile} uploadingFile={uploadingFile} uploadRequestFile={uploadRequestFile} canUpdate={can('requests.update')} canUpload={can('documents.process')}/>
          {fulfillmentOpen && selectedRequest && <FulfillmentNoteModal previousStatus={selectedRequest.status || 'submitted'} nextStatus={requestStatus} onClose={() => setFulfillmentOpen(false)} onConfirm={confirmFulfillment} saving={savingRequest} error={fulfillmentError}/>} 
          </>}
        </div>
      </section>
    </main>
  )
}
