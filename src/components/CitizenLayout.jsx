import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Bell, CalendarDays, ChevronDown, CircleHelp, CreditCard, FileText, FolderOpen, Home, LayoutGrid, LogOut, Menu, Settings, UserRound, X } from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CitizenProvider, useCitizen } from '../context/CitizenContext'
import { citizenApi, dateLabel, notificationLink } from '../services/citizenData'
import { ServiceSearch } from './CitizenWidgets'
import '../citizen.css'
import { AccountSettingsContent } from '../pages/app/Settings'

const groups = [
  ['Overview', [['Dashboard', '/app/dashboard', Home]]],
  ['Services', [['Browse Services', '/app/services', LayoutGrid], ['My Applications', '/app/requests', FileText], ['Appointments', '/app/appointments', CalendarDays]]],
  ['Records', [['My Documents', '/app/documents', FolderOpen], ['Payments', '/app/payments', CreditCard]]],
  ['Support', [['Help & Support', '/app/help', CircleHelp]]],
]
const LayoutContext = createContext(false)
export default function CitizenLayout({ children }) {
  const insideLayout = useContext(LayoutContext)
  return insideLayout ? children : <CitizenShell>{children}</CitizenShell>
}
function CitizenShell({ children }) {
  const { user, loading } = useAuth(), navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/auth/login', { replace: true }) }, [user, loading, navigate])
  if (loading || !user) return <main className="dashboard-page" role="status">Loading your citizen account…</main>
  return <CitizenProvider key={user.id}><LayoutContext.Provider value={true}><Shell>{children}</Shell></LayoutContext.Provider></CitizenProvider>
}
function Shell({ children }) {
  const { user, logout } = useAuth(), { data, loading, error, reload } = useCitizen(), navigate = useNavigate(), location = useLocation()
  const [drawer, setDrawer] = useState(false), [popover, setPopover] = useState(''), [notice, setNotice] = useState(''), [settingsOpen, setSettingsOpen] = useState(false)
  const actionsRef = useRef(null), sidebarRef = useRef(null), menuRef = useRef(null)
  const name = data?.profile?.full_name || user.name || 'Citizen', initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  const avatarUrl = data?.profile?.avatar_url || ''
  const notifications = data?.notifications || [], unread = notifications.filter(item => !item.read_at).length
  useEffect(() => { setDrawer(false); setPopover('') }, [location.pathname, location.search])
  useEffect(() => {
    const outside = event => { if (!actionsRef.current?.contains(event.target)) setPopover('') }
    const escape = event => { if (event.key === 'Escape') { if (settingsOpen) setSettingsOpen(false); else { setPopover(''); setDrawer(false); if (drawer) menuRef.current?.focus() } } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [drawer, settingsOpen])
  useEffect(() => { if (!drawer) return; sidebarRef.current?.querySelector('button')?.focus(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous } }, [drawer])
  const signOut = async () => { const result = await logout(); if (result.ok) navigate('/auth/login', { replace: true }); else setNotice(result.error) }
  const openNotification = async item => { try { await citizenApi(`/notifications/${item.id}/read`, { method: 'PATCH' }); await reload(); setPopover(''); navigate(notificationLink(item)) } catch (error) { setNotice(error.message) } }
  const trapFocus = event => {
    if (!drawer || event.key !== 'Tab') return
    const elements = [...sidebarRef.current.querySelectorAll('a,button')].filter(item => item.getClientRects().length)
    const first = elements[0], last = elements.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  return <div className={`citizen-portal portal-v2${location.pathname === '/app/profile' ? ' profile-workspace' : ''}`}>
    {drawer && <button className="portal-scrim" aria-label="Close navigation" onClick={() => setDrawer(false)}/>}
    <aside ref={sidebarRef} className={`citizen-sidebar ${drawer ? 'open' : ''}`} onKeyDown={trapFocus} aria-label="Citizen navigation" role={drawer ? 'dialog' : undefined} aria-modal={drawer || undefined}>
      <div className="citizen-sidebar-brand"><img src="/assets/getafe-seal.png" alt="Municipality of Getafe seal"/><span>CITIZEN PORTAL<small>Municipality of Getafe</small></span><button onClick={() => { setDrawer(false); menuRef.current?.focus() }} aria-label="Close menu"><X size={20}/></button></div>
      <nav className="portal-nav">{groups.map(([label, links]) => <div key={label}><small>{label}</small>{links.map(([text, href, Icon]) => <NavLink to={href} key={href}><Icon size={17}/>{text}{text === 'Notifications' && unread > 0 && <span className="portal-nav-count">{unread}</span>}</NavLink>)}</div>)}</nav>
    </aside>
    <div className="citizen-main">
      <header className="citizen-topbar"><div className="portal-breadcrumb"><button ref={menuRef} className="citizen-menu-toggle" data-tooltip="Open navigation" onClick={() => setDrawer(true)} aria-label="Open navigation" aria-expanded={drawer}><Menu size={21}/></button></div>
        <div className="citizen-top-actions" ref={actionsRef}>
          <ServiceSearch compact/>
          <div className="portal-header-utility"><Link className="portal-icon-button" data-tooltip="Help and support" to="/app/help" aria-label="Help and support"><CircleHelp size={19}/></Link>
          <div className="portal-popover-anchor"><button className="portal-icon-button" data-tooltip="Notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={popover === 'notifications'} aria-haspopup="dialog" onClick={() => setPopover(popover === 'notifications' ? '' : 'notifications')}><Bell size={19}/>{unread > 0 && <span className="portal-unread">{unread}</span>}</button>
            {popover === 'notifications' && <section className="portal-popover" aria-label="Notifications"><div className="portal-popover-heading"><strong>Notifications</strong><span>{unread} unread</span></div>{loading ? <p>Loading notifications…</p> : error ? <p role="alert">{error}</p> : notifications.length ? notifications.slice(0, 4).map(item => <button key={item.id} className={!item.read_at ? 'unread' : ''} onClick={() => openNotification(item)}><strong>{item.title}</strong><span>{item.message}</span><small>{dateLabel(item.created_at)}</small></button>) : <p>You’re all caught up. Updates will appear here.</p>}{notice && <p role="alert">{notice}</p>}<Link to="/app/notifications">View all notifications →</Link></section>}
          </div></div>
          <div className="portal-popover-anchor"><button className="citizen-profile-button" aria-label="Open account menu" aria-expanded={popover === 'profile'} aria-haspopup="menu" onClick={() => setPopover(popover === 'profile' ? '' : 'profile')}><span className="citizen-avatar">{avatarUrl ? <img src={avatarUrl} alt=""/> : initials}</span><b>{name}</b><ChevronDown size={15}/></button>{popover === 'profile' && <div className="portal-popover portal-profile-menu" role="menu"><Link role="menuitem" to="/app/dashboard?profile=1"><UserRound size={15}/>My Account</Link><Link role="menuitem" to="/app/requests"><FileText size={15}/>My Requests</Link><button role="menuitem" onClick={() => { setPopover(''); setSettingsOpen(true) }}><Settings size={15}/>Settings</button><button role="menuitem" onClick={signOut}><LogOut size={15}/>Sign out</button></div>}</div>
        </div>
      </header>
      <main className="citizen-content" id="portal-content">{error && <div className="portal-error" role="alert"><span>{error}</span><button onClick={reload}>Try again</button></div>}{children}</main>
    </div>
    {settingsOpen && <div className="settings-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setSettingsOpen(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="account-settings-title"><div className="settings-modal-header"><div><h1 id="account-settings-title">Settings</h1><p>Manage your account preferences and privacy.</p></div><button type="button" className="settings-modal-close" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={20}/></button></div><div className="settings-modal-body"><AccountSettingsContent onClose={() => setSettingsOpen(false)} /></div></section></div>}
  </div>
}
