import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Bell, CalendarDays, ChevronDown, CircleHelp, CreditCard, FileText, FolderOpen, Home, LayoutGrid, LogOut, Menu, Search, Settings, UserRound, X } from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CitizenProvider, useCitizen } from '../context/CitizenContext'
import { citizenApi, dateLabel, notificationLink } from '../services/citizenData'
import { ServiceSearch } from './CitizenWidgets'
import '../citizen.css'
import { AccountSettingsContent, AccountSettingsFooter } from '../pages/app/Settings'
import { ROUTES } from '../routeRegistry'
import ProfileModal from './ProfileModal'
import { ProfileForm } from '../pages/dashboard/Profile'
import PasswordChangeModal from './PasswordChangeModal'
import { useResidentPreferences } from '../context/ResidentPreferencesContext'
import StableAvatar from './StableAvatar'
import { DEFAULT_SETTINGS_CATEGORY, normalizeSettingsCategory } from '../pages/app/settingsNavigation'

const groups = [
  ['Overview', [['Dashboard', ROUTES.app.root, Home]]],
  ['Services', [['Browse Services', ROUTES.app.services, LayoutGrid], ['My Requests', '/app/e-requests', FileText], ['My Applications', ROUTES.app.requests, FileText], ['Appointments', ROUTES.app.appointments, CalendarDays]]],
  ['Records', [['My Documents', ROUTES.app.documents, FolderOpen], ['Payments', ROUTES.app.payments, CreditCard]]],
  ['Support', [['Help & Support', ROUTES.app.help, CircleHelp]]],
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
  const { user, logout } = useAuth(), { data, loading, error, reload } = useCitizen(), { t, dirty, cancelEditing } = useResidentPreferences(), navigate = useNavigate(), location = useLocation()
  const [drawer, setDrawer] = useState(false), [popover, setPopover] = useState(''), [notice, setNotice] = useState(''), [mobileSearchOpen, setMobileSearchOpen] = useState(false), [accountOpen, setAccountOpen] = useState(false), [accountView, setAccountView] = useState('profile'), [accountCategory, setAccountCategory] = useState(DEFAULT_SETTINGS_CATEGORY), [accountReturnView, setAccountReturnView] = useState('profile')
  const actionsRef = useRef(null), sidebarRef = useRef(null), menuRef = useRef(null), profileTriggerRef = useRef(null), profileFormRef = useRef(null), changePasswordRef = useRef(null), settingsCloseGuardRef = useRef(null), securitySettingsScrollTopRef = useRef(0)
  const name = data?.profile?.full_name || user.name || 'Citizen', initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  const avatarUrl = data?.profile?.avatar_url || ''
  const notifications = data?.notifications || [], unread = notifications.filter(item => !item.read_at).length
  useEffect(() => { setDrawer(false); setPopover(''); setMobileSearchOpen(false) }, [location.pathname, location.search])
  const openProfile = useCallback(() => { setPopover(''); setAccountView('profile'); setAccountCategory(DEFAULT_SETTINGS_CATEGORY); setAccountOpen(true) }, [])
  const openSettings = useCallback(category => { setPopover(''); setAccountView('settings'); setAccountCategory(normalizeSettingsCategory(category)); setAccountOpen(true) }, [])
  const openPassword = useCallback((returnView = 'profile') => {
    if (returnView === 'settings') securitySettingsScrollTopRef.current = document.querySelector('.account-settings-modal .profile-modal-body')?.scrollTop || 0
    setAccountReturnView(returnView)
    profileFormRef.current?.requestSwitch?.(() => setAccountView('password'))
  }, [])
  const closePassword = useCallback(() => {
    setAccountView(accountReturnView)
    if (accountReturnView === 'settings') window.requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('.account-settings-modal .profile-modal-body')
      if (scrollContainer) scrollContainer.scrollTop = securitySettingsScrollTopRef.current
    })
  }, [accountReturnView])
  const closeAccount = useCallback(() => { cancelEditing(); setAccountOpen(false); setAccountView('profile') }, [cancelEditing])
  const confirmSettingsDiscard = useCallback(() => !dirty || window.confirm('Discard your unsaved settings changes?'), [dirty])
  const requestSettingsClose = useCallback(() => { if (confirmSettingsDiscard()) closeAccount() }, [closeAccount, confirmSettingsDiscard])
  settingsCloseGuardRef.current = { requestClose: requestSettingsClose }
  const closeModal = useCallback(() => {
    if (accountView === 'password') closePassword()
    else if (accountView === 'profile') profileFormRef.current?.requestClose()
    else requestSettingsClose()
  }, [accountView, closePassword, requestSettingsClose])
  useEffect(() => {
    const state = location.state
    if (!state?.openProfileModal && !state?.openSettingsModal) return
    if (state.openSettingsModal) openSettings(state.settingsCategory)
    else openProfile()
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null })
  }, [location.hash, location.pathname, location.search, location.state, navigate, openProfile, openSettings])
  useEffect(() => {
    const background = document.querySelector('.citizen-main')
    if (!background) return undefined
    if (accountOpen) {
      background.setAttribute('inert', '')
      background.setAttribute('aria-hidden', 'true')
    } else {
      background.removeAttribute('inert')
      background.removeAttribute('aria-hidden')
    }
    return () => { background.removeAttribute('inert'); background.removeAttribute('aria-hidden') }
  }, [accountOpen])
  useEffect(() => {
    const outside = event => { if (!actionsRef.current?.contains(event.target)) setPopover('') }
    const escape = event => { if (event.key === 'Escape') { if (accountOpen) return; setPopover(''); setDrawer(false); if (drawer) menuRef.current?.focus(); else if (popover === 'profile') profileTriggerRef.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [accountOpen, drawer, popover])
  useEffect(() => { if (!drawer) return; sidebarRef.current?.querySelector('button')?.focus(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous } }, [drawer])
  const signOut = async () => { setPopover(''); setNotice(''); const result = await logout(); if (result.ok) navigate('/auth/login', { replace: true }); else setNotice(result.error) }
  const openNotification = async item => { try { await citizenApi(`/notifications/${item.id}/read`, { method: 'PATCH' }); await reload(); setPopover(''); navigate(notificationLink(item)) } catch (error) { setNotice(error.message) } }
  const markAllNotificationsRead = async () => { try { setNotice(''); await citizenApi('/notifications/read-all', { method: 'PATCH' }); await reload() } catch (error) { setNotice(error.message) } }
  const trapFocus = event => {
    if (!drawer || event.key !== 'Tab') return
    const elements = [...sidebarRef.current.querySelectorAll('a,button')].filter(item => item.getClientRects().length)
    const first = elements[0], last = elements.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  const accountMenuKeys = event => {
    const trigger = event.target === profileTriggerRef.current
    if (!trigger && !event.target.closest('.portal-profile-menu')) return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (popover !== 'profile') {
      setPopover('profile')
      window.requestAnimationFrame(() => actionsRef.current?.querySelector('.portal-profile-menu [role="menuitem"]')?.focus())
      return
    }
    const items = [...actionsRef.current.querySelectorAll('.portal-profile-menu [role="menuitem"]')]
    const index = items.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : (index + 1) % items.length
    items[next]?.focus()
  }
  return <div className="citizen-portal portal-v2">
    {drawer && <button type="button" className="portal-scrim" aria-label="Close navigation" onClick={() => setDrawer(false)}/>}
    <aside ref={sidebarRef} className={`citizen-sidebar ${drawer ? 'open' : ''}`} onKeyDown={trapFocus} aria-label="Citizen navigation" role={drawer ? 'dialog' : undefined} aria-modal={drawer || undefined}>
      <div className="citizen-sidebar-brand"><img src="/assets/getafe-seal.png" alt="Municipality of Getafe seal"/><span>CITIZEN PORTAL<small>Municipality of Getafe</small></span><button type="button" onClick={() => { setDrawer(false); menuRef.current?.focus() }} aria-label="Close menu" data-icon-button="ghost"><X size={20}/></button></div>
      <nav className="portal-nav">{groups.map(([label, links]) => <div key={label}><small>{t(`nav.${label.toLowerCase()}`, label)}</small>{links.map(([text, href, Icon]) => <NavLink to={href} end={href === ROUTES.app.root} key={href}><Icon size={17}/>{t(`nav.${({ 'Dashboard': 'dashboard', 'Browse Services': 'browseServices', 'My Applications': 'applications', 'Appointments': 'appointments', 'My Documents': 'documents', 'Payments': 'payments', 'Help & Support': 'help' })[text] || text}`, text)}{text === 'Notifications' && unread > 0 && <span className="portal-nav-count">{unread}</span>}</NavLink>)}</div>)}</nav>
    </aside>
    <div className="citizen-main">
      <header className="citizen-topbar"><div className="portal-breadcrumb"><button type="button" ref={menuRef} className="citizen-menu-toggle" data-tooltip="Open navigation" onClick={() => setDrawer(true)} aria-label="Open navigation" aria-expanded={drawer} data-icon-button="ghost"><Menu size={21}/></button></div>
        <div className="citizen-top-actions" ref={actionsRef} onKeyDown={accountMenuKeys}>
          <ServiceSearch compact inputId="header-service-search"/>
          <div className="portal-mobile-search">
            <button type="button" className="portal-icon-button portal-mobile-search-trigger" aria-label={mobileSearchOpen ? 'Close search' : 'Search services, news, and information'} aria-expanded={mobileSearchOpen} aria-controls="mobile-header-search-panel" onClick={() => setMobileSearchOpen(value => !value)} data-icon-button="ghost"><Search size={19} aria-hidden="true"/></button>
            {mobileSearchOpen && <div className="portal-mobile-search-panel" id="mobile-header-search-panel"><ServiceSearch compact autoFocus inputId="mobile-header-service-search"/></div>}
          </div>
          <div className="portal-header-utility"><Link className="portal-icon-button" data-tooltip="Help and support" to={ROUTES.app.help} aria-label="Help and support" data-icon-button="ghost"><CircleHelp size={19}/></Link>
          <div className="portal-popover-anchor"><button type="button" className="portal-icon-button" data-tooltip="Notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={popover === 'notifications'} aria-haspopup="dialog" onClick={() => setPopover(popover === 'notifications' ? '' : 'notifications')} data-icon-button="ghost"><Bell size={19}/>{unread > 0 && <span className="portal-unread">{unread}</span>}</button>
            {popover === 'notifications' && <section className="portal-popover portal-notification-popover" aria-label="Notifications"><div className="portal-popover-heading"><strong>Notifications</strong><div className="portal-notification-heading-actions"><span>{unread} unread</span>{unread > 0 && <button type="button" onClick={markAllNotificationsRead}>Mark all as read</button>}</div></div>{loading ? <p>Loading notifications…</p> : error ? <p role="alert">{error}</p> : notifications.length ? notifications.slice(0, 4).map(item => <button type="button" key={item.id} className={!item.read_at ? 'unread' : ''} onClick={() => openNotification(item)}><strong>{item.title}</strong><span>{item.message}</span><small>{dateLabel(item.created_at)}</small></button>) : <p>You’re all caught up. Updates will appear here.</p>}{notice && <p role="alert">{notice}</p>}<Link to={ROUTES.app.notifications}>View all notifications →</Link></section>}
          </div></div>
          <div className="portal-popover-anchor"><button type="button" ref={profileTriggerRef} className="citizen-profile-button" aria-label="Open account menu" aria-expanded={popover === 'profile'} aria-haspopup="menu" onClick={() => setPopover(popover === 'profile' ? '' : 'profile')}><StableAvatar className="citizen-avatar" src={avatarUrl} initials={initials} /><b>{name}</b><ChevronDown size={15}/></button>{popover === 'profile' && <div className="portal-popover portal-profile-menu" role="menu"><button type="button" role="menuitem" onClick={openProfile}><UserRound size={15}/>{t('account.myAccount')}</button><Link role="menuitem" to={ROUTES.app.requests}><FileText size={15}/>{t('account.requests')}</Link><button type="button" role="menuitem" onClick={() => openSettings(DEFAULT_SETTINGS_CATEGORY)}><Settings size={15}/>{t('account.settings')}</button><button type="button" role="menuitem" onClick={signOut}><LogOut size={15}/>{t('account.signOut')}</button></div>}</div>
        </div>
      </header>
      <main className="citizen-content" id="portal-content">{notice && <p className="portal-error" role="alert">{notice}</p>}{error && <div className="portal-error" role="alert"><span>{error}</span><button type="button" onClick={reload}>Try again</button></div>}{children}</main>
    </div>
    {accountOpen && <ProfileModal
      title={accountView === 'settings' ? t('settings.title') : t('account.myAccount')}
      description={accountView === 'settings' ? t('settings.description') : undefined}
      onClose={closeModal}
      returnFocusRef={profileTriggerRef}
      closeGuardRef={accountView === 'settings' ? settingsCloseGuardRef : accountView === 'profile' ? profileFormRef : undefined}
      focusKey={accountView}
      showHeader={accountView !== 'password'}
      labelledBy={accountView === 'password' ? 'password-change-title' : undefined}
      closeLabel={accountView === 'settings' ? 'Close account settings' : undefined}
      className={accountView === 'settings' ? 'account-settings-modal' : ''}
      footer={accountView === 'settings' ? <AccountSettingsFooter onClose={requestSettingsClose}/> : undefined}
    >
      <div className={accountView === 'profile' ? '' : 'profile-modal-view-hidden'} aria-hidden={accountView === 'profile' ? undefined : 'true'}>
        <ProfileForm ref={profileFormRef} onClose={closeAccount}/>
      </div>
      {accountView === 'password' && <PasswordChangeModal embedded endpoint="/api/auth/change-password" requestMethod="POST" passwordField="password" onClose={closePassword} returnFocusRef={changePasswordRef}/>}
      {accountView === 'settings' && (
        <AccountSettingsContent activeCategory={accountCategory} onCategoryChange={setAccountCategory} onEditProfile={() => { if (!confirmSettingsDiscard()) return; cancelEditing(); setAccountView('profile') }} onChangePassword={() => openPassword('settings')} changePasswordRef={changePasswordRef}/>
      )}
    </ProfileModal>}
  </div>
}
