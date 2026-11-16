import { StaffOperationsDashboard, StaffApplicationsQueue } from '../../components/StaffOperations'
const StaffAccount = lazy(() => import('../../components/StaffAccount'))
import { lazy, useEffect, useRef, useState } from 'react'
import { Bell, CircleHelp, ClipboardList, ChevronDown, LayoutDashboard, LogOut, Menu, Settings } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { requestJson } from '../../services/apiTransport'
import { invalidateRouteRequestCache, routeRequest } from '../../services/routeRequests'
import { useAuth } from '../../context/AuthContext'
import { resolveModuleAccess } from '../../applicationModuleRegistry'
import { ModuleAccessDeniedPage, ModuleNotFoundPage } from '../../components/RouteStatusPages'
import './StaffSysparm.css'
import './StaffHeader.css'
import './StaffRequestModal.css'
import FulfillmentNoteModal from './FulfillmentNoteModal'
const StaffRequestModal = lazy(() => import('./StaffRequestModal'))
const StaffEservices = lazy(() => import('../../components/StaffEservices'))
const StaffUtilityPages = lazy(() => import('../../components/StaffUtilityPages'))
import { ROUTES, staffLocation } from '../../routeRegistry'
import { hasPermission } from '@getafe/auth-client'

export default function StaffSysparm() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const routeState = staffLocation(location.pathname)
  const currentRecordRef = useRef(routeState?.recordId)
  currentRecordRef.current = routeState?.recordId
  const objectId = routeState?.module || 'dashboard'
  const moduleAccess = resolveModuleAccess('staff', objectId, user)
  const can = permission => hasPermission(user, permission)
  const navigate = useNavigate()
  const operationRef = useRef(false), sidebarRef = useRef(null), menuRef = useRef(null), profileRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [error, setError] = useState('')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [requestStatus, setRequestStatus] = useState('submitted')
  const [requestNote, setRequestNote] = useState('')
  const [requestVisibility,setRequestVisibility] = useState('internal')
  const [requestNotice, setRequestNotice] = useState('')
  const [assigningRequest,setAssigningRequest]=useState(false)
  const [savingRequest, setSavingRequest] = useState(false)
  const [requestFile, setRequestFile] = useState(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [fulfillmentOpen, setFulfillmentOpen] = useState(false)
  const [fulfillmentError, setFulfillmentError] = useState('')
  useEffect(() => {
    const controller = new AbortController(), id = routeState?.recordId
    setFulfillmentOpen(false); setRequestNote(''); setRequestVisibility('internal'); setRequestError(''); setRequestNotice(''); setRequestFile(null)
    if (!id || objectId !== 'request-management' || moduleAccess.state !== 'allowed') { setSelectedRequest(null); setRequestLoading(false); return }
    setSelectedRequest({ id, service_name: 'Service request' }); setRequestLoading(true)
    routeRequest(`/api/staff/applications/${encodeURIComponent(id)}`, { signal: controller.signal,scope:`staff:${user.id}` })
      .then(body => { if (!controller.signal.aborted) { setSelectedRequest(body); setRequestStatus(body.status || 'submitted') } })
      .catch(issue => { if (!controller.signal.aborted) setRequestError(issue.message) })
      .finally(() => { if (!controller.signal.aborted) setRequestLoading(false) })
    return () => controller.abort()
  }, [routeState?.recordId, objectId, moduleAccess.state, user.id])
  useEffect(() => { setMenuOpen(false); setProfileOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    const sidebar = sidebarRef.current, main = document.querySelector('.staff-main'), previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'; if (main) main.inert = true
    sidebar.querySelector('a[href]')?.focus()
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
    await commitRequest({ note: requestNote, visibility:requestVisibility })
  }

  const commitRequest = async fulfillment => {
    if (operationRef.current || !selectedRequest) return
    operationRef.current = true
    const recordId = selectedRequest.id
    setSavingRequest(true)
    setRequestError('')
    setRequestNotice('')
    try {
      const body = await requestJson(`/staff/applications/${encodeURIComponent(selectedRequest.id)}`, { method: 'PATCH', body: JSON.stringify({ status: requestStatus, previous_status: selectedRequest.status, version: selectedRequest.version, fulfillment }) })
      if (currentRecordRef.current !== recordId) return
      invalidateRouteRequestCache('/api/staff')
      setSelectedRequest(body.application)
      setRequestNote('')
      setRequestNotice(fulfillment.visibility==='internal'&&requestStatus===selectedRequest.status?'Internal note saved.':'Request updated and the resident has been notified.')
      setFulfillmentOpen(false)

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
        </div>
        <nav className="staff-nav" aria-label="Staff workspace">
          {can('staff.dashboard.view') && <Link className={objectId === 'dashboard' ? 'active' : ''} to={ROUTES.staff.root}><LayoutDashboard size={18} />Dashboard</Link>}
          {can('requests.view') && <Link className={objectId === 'request-management' ? 'active' : ''} to={ROUTES.staff.requests}><ClipboardList size={18} />Service requests</Link>}
          {can('requests.department.view') && <Link className={objectId === 'e-service-requests' ? 'active' : ''} to="/app/staff/e-requests"><ClipboardList size={18}/>E-service requests</Link>}
          {can('requests.department.view') && <><span className="staff-nav-label">Department queues</span><Link to="/app/staff/e-requests?status=&assigned=me">My assigned requests</Link><Link to="/app/staff/e-requests?status=&assigned=unassigned">Unassigned requests</Link>{can('requests.department.approve') && <Link to="/app/staff/e-requests?status=FOR_APPROVAL">Pending approvals</Link>}<Link to="/app/staff/e-requests?status=COMPLETED">Completed requests</Link></>}
          {!can('requests.department.view')&&can('requests.view')&&<><span className="staff-nav-label">Service queues</span><Link to="/app/staff/requests?assigned=me">My assigned requests</Link><Link to="/app/staff/requests?assigned=unassigned">Unassigned requests</Link><Link to="/app/staff/requests?status=completed">Completed requests</Link></>}
          {can('requests.department.view')?<Link to="/app/staff/e-requests?status=NEEDS_INFORMATION">Correspondence</Link>:can('requests.view')&&<Link to="/app/staff/requests?status=needs_information">Correspondence</Link>}
          <span className="staff-nav-label">Account</span><Link className={objectId==='profile'?'active':''} to={ROUTES.staff.profile}>My profile</Link><Link className={objectId==='security'?'active':''} to={ROUTES.staff.security}>Account security</Link>
          {can('notifications.view') && <Link className={objectId === 'notifications' ? 'active' : ''} to={ROUTES.staff.notifications}><Bell size={18} />Notifications</Link>}
          {can('system.settings.manage') && <Link className={objectId === 'system-settings' ? 'active' : ''} to={ROUTES.staff.settings}><Settings size={18} />System parameters</Link>}
        </nav>
      </aside>

      <section className="staff-main">
        <header className="staff-header">
          <button type="button" ref={menuRef} className="staff-menu-toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} aria-label="Open menu" data-icon-button="ghost"><Menu size={21} /></button>
          <div className="staff-top-actions">
            {can('help.view') && <Link className="staff-icon-button" to={ROUTES.staff.help} aria-label="Help and support" data-icon-button="ghost"><CircleHelp size={18}/></Link>}
            {can('notifications.view') && <Link className="staff-icon-button" to={ROUTES.staff.notifications} aria-label="Notifications" data-icon-button="ghost"><Bell size={18}/></Link>}
            <div ref={profileRef} className="staff-profile-wrap"><button type="button" className="staff-profile-button" data-icon-button="ghost" aria-label="Open account menu" onClick={() => setProfileOpen(current => !current)} aria-expanded={profileOpen}><span>{(user?.name || 'Staff').slice(0, 1).toUpperCase()}</span><b>{user?.name || 'Municipal staff'}</b><ChevronDown size={15}/></button>{profileOpen && <div className="staff-profile-menu"><strong>{user?.name || 'Municipal staff'}</strong><small>{user?.email || 'Staff account'}{user?.eid ? ` · EID ${user.eid}` : ''}</small><Link to={ROUTES.staff.profile}>My profile</Link><Link to={ROUTES.staff.security}>Account security</Link><button type="button" onClick={signOut}><LogOut size={15}/>Sign out</button></div>}</div>
          </div>
        </header>
        <div className="staff-content">
          {error && <div className="staff-error" role="alert">{error}</div>}
          {objectId === 'e-service-requests' ? <StaffEservices /> : ['profile','security'].includes(objectId) ? <StaffAccount module={objectId}/> : ['notifications','system-settings','help'].includes(objectId) ? <StaffUtilityPages module={objectId}/> : objectId === 'dashboard' ? <StaffOperationsDashboard/> : <StaffApplicationsQueue/>}
          {selectedRequest && <StaffRequestModal selectedRequest={selectedRequest} requestLoading={requestLoading} requestStatus={requestStatus} setRequestStatus={setRequestStatus} requestNote={requestNote} setRequestNote={setRequestNote} requestError={requestError} requestNotice={requestNotice} savingRequest={savingRequest||assigningRequest} onAssignmentBusy={busy=>{operationRef.current=busy;setAssigningRequest(busy)}} closeRequest={closeRequest} saveRequest={saveRequest} requestFile={requestFile} setRequestFile={setRequestFile} uploadingFile={uploadingFile} uploadRequestFile={uploadRequestFile} canUpdate={can('requests.update')} requestVisibility={requestVisibility} setRequestVisibility={setRequestVisibility} canAssign={can('requests.assign')} canApprove={can('documents.approve')} canComplete={can('requests.complete')&&can('requests.close')} onAssigned={updated=>{if(currentRecordRef.current===updated.id)setSelectedRequest(updated)}} canUpload={can('documents.process')}/>}
          {fulfillmentOpen && selectedRequest && <FulfillmentNoteModal previousStatus={selectedRequest.status || 'submitted'} nextStatus={requestStatus} onClose={() => setFulfillmentOpen(false)} onConfirm={confirmFulfillment} saving={savingRequest} error={fulfillmentError}/>} 
        </div>
      </section>
    </main>
  )
}
