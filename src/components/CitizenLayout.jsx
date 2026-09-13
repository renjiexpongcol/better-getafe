import { useEffect, useRef, useState } from 'react'
import { Bell, CalendarDays, ChevronDown, CircleHelp, CloudSun, CreditCard, FileText, FolderOpen, Home, LayoutGrid, LogOut, Menu, Search, Settings, UserRound, X } from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CitizenProvider, useCitizen } from '../context/CitizenContext'
import { citizenApi, dateLabel, notificationLink } from '../services/citizenData'
import '../citizen.css'

const groups = [
  ['Overview', [['Dashboard', '/app/dashboard', Home]]],
  ['Services', [['Browse Services', '/app/services', LayoutGrid], ['My Applications', '/app/requests', FileText], ['Appointments', '/app/appointments', CalendarDays]]],
  ['Records', [['My Documents', '/app/documents', FolderOpen], ['Payments', '/app/payments', CreditCard]]],
  ['Account', [['Notifications', '/app/notifications', Bell], ['My Profile', '/app/profile', UserRound], ['Settings', '/app/settings', Settings]]],
  ['Support', [['Help & Support', '/app/help', CircleHelp]]],
]
export default function CitizenLayout({ title, children }) {
  const { user, loading } = useAuth(), navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/auth/login', { replace: true }) }, [user, loading, navigate])
  if (loading || !user) return <main className="dashboard-page" role="status">Loading your citizen account…</main>
  return <CitizenProvider><Shell title={title}>{children}</Shell></CitizenProvider>
}
function Shell({ title, children }) {
  const { user, logout } = useAuth(), { data, loading, error, reload } = useCitizen(), navigate = useNavigate(), location = useLocation()
  const [drawer, setDrawer] = useState(false), [popover, setPopover] = useState(''), [notice, setNotice] = useState('')
  const [weather, setWeather] = useState(null)
  const actionsRef = useRef(null), sidebarRef = useRef(null), menuRef = useRef(null)
  const name = data?.profile?.full_name || user.name || 'Citizen', initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  const avatarUrl = data?.profile?.avatar_url || ''
  const notifications = data?.notifications || [], unread = notifications.filter(item => !item.read_at).length
  useEffect(() => { setDrawer(false); setPopover('') }, [location.pathname, location.search])
  useEffect(() => {
    const outside = event => { if (!actionsRef.current?.contains(event.target)) setPopover('') }
    const escape = event => { if (event.key === 'Escape') { setPopover(''); setDrawer(false); if (drawer) menuRef.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [drawer])
  useEffect(() => { if (!drawer) return; sidebarRef.current?.querySelector('button')?.focus(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous } }, [drawer])
  useEffect(() => {
    let active = true
    fetch('/api/citizen/weather', { credentials: 'include' }).then(response => response.ok ? response.json() : null).then(value => { if (active) setWeather(value) }).catch(() => { if (active) setWeather(null) })
    return () => { active = false }
  }, [])
  const signOut = async () => { await logout(); navigate('/auth/login', { replace: true }) }
  const openNotification = async item => { try { await citizenApi(`/notifications/${item.id}/read`, { method: 'PATCH' }); await reload(); setPopover(''); navigate(notificationLink(item)) } catch (error) { setNotice(error.message) } }
  const trapFocus = event => {
    if (!drawer || event.key !== 'Tab') return
    const elements = [...sidebarRef.current.querySelectorAll('a,button')].filter(item => item.getClientRects().length)
    const first = elements[0], last = elements.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  return <div className="citizen-portal portal-v2">
    <a className="portal-skip" href="#portal-content">Skip to content</a>
    {drawer && <button className="portal-scrim" aria-label="Close navigation" onClick={() => setDrawer(false)}/>}
    <aside ref={sidebarRef} className={`citizen-sidebar ${drawer ? 'open' : ''}`} onKeyDown={trapFocus} aria-label="Citizen navigation" role={drawer ? 'dialog' : undefined} aria-modal={drawer || undefined}>
      <div className="citizen-sidebar-brand"><img src="/assets/getafe-seal.png" alt="Municipality of Getafe seal"/><span>CITIZEN PORTAL<small>Municipality of Getafe</small></span><button onClick={() => { setDrawer(false); menuRef.current?.focus() }} aria-label="Close menu"><X size={20}/></button></div>
      <nav className="portal-nav">{groups.map(([label, links]) => <div key={label}><small>{label}</small>{links.map(([text, href, Icon]) => <NavLink to={href} key={href}><Icon size={17}/>{text}{text === 'Notifications' && unread > 0 && <span className="portal-nav-count">{unread}</span>}</NavLink>)}</div>)}</nav>
    </aside>
    <div className="citizen-main">
      <header className="citizen-topbar"><div className="portal-breadcrumb"><button ref={menuRef} className="citizen-menu-toggle" onClick={() => setDrawer(true)} aria-label="Open navigation" aria-expanded={drawer}><Menu size={21}/></button>{weather && <div className="portal-header-weather" aria-label={`Weather in ${weather.barangay}`}><span className="portal-header-weather-icon"><CloudSun size={19} aria-hidden="true"/></span><div className="portal-header-weather-copy"><b>Weather in {weather.barangay}</b><strong>{Math.round(weather.temperature)}°C</strong><span>{weather.description} · Feels like {Math.round(weather.feelsLike)}°C · Humidity {Math.round(weather.humidity)}%</span></div><small>Updated {new Date(weather.updatedAt * 1000).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}</small></div>}</div>
        <div className="citizen-top-actions" ref={actionsRef}>
          <Link className="portal-icon-button" to="/app/services?search=1" aria-label="Search municipal services"><Search size={19}/></Link><Link className="portal-icon-button" to="/app/help" aria-label="Help and support"><CircleHelp size={19}/></Link>
          <div className="portal-popover-anchor"><button className="portal-icon-button" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={popover === 'notifications'} onClick={() => setPopover(popover === 'notifications' ? '' : 'notifications')}><Bell size={19}/>{unread > 0 && <span className="portal-unread">{unread}</span>}</button>
            {popover === 'notifications' && <section className="portal-popover" aria-label="Notifications"><div className="portal-popover-heading"><strong>Notifications</strong><span>{unread} unread</span></div>{loading ? <p>Loading notifications…</p> : error ? <p role="alert">{error}</p> : notifications.length ? notifications.slice(0, 4).map(item => <button key={item.id} className={!item.read_at ? 'unread' : ''} onClick={() => openNotification(item)}><strong>{item.title}</strong><span>{item.message}</span><small>{dateLabel(item.created_at)}</small></button>) : <p>You’re all caught up. Updates will appear here.</p>}{notice && <p role="alert">{notice}</p>}<Link to="/app/notifications">View all notifications →</Link></section>}
          </div>
          <div className="portal-popover-anchor"><button className="citizen-profile-button" aria-expanded={popover === 'profile'} onClick={() => setPopover(popover === 'profile' ? '' : 'profile')}><span className="citizen-avatar">{avatarUrl ? <img src={avatarUrl} alt=""/> : initials}</span><b>{name}</b><ChevronDown size={15}/></button>{popover === 'profile' && <div className="portal-popover portal-profile-menu"><Link to="/app/profile">My Profile</Link><Link to="/app/settings">Account Settings</Link><Link to="/app/help">Help &amp; Support</Link><Link to="/?municipal=1">Visit Municipal Website</Link><button onClick={signOut}>Sign Out</button></div>}</div>
        </div>
      </header>
      <main className="citizen-content" id="portal-content">{error && <div className="portal-error" role="alert"><span>{error}</span><button onClick={reload}>Try again</button></div>}{children}</main>
    </div>
  </div>
}
