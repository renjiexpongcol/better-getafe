import { usePublicConfig } from '../context/PublicConfig'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Accessibility, ArrowRight, BookOpen, Building2, CalendarDays, ChevronDown, ClipboardCheck, CloudSun, Compass, FileCheck2, Info, Landmark, Map, Menu, Newspaper, Rocket, Siren, Users, WalletCards, ChartNoAxesCombined, X } from 'lucide-react'
import HeaderWeather from './HeaderWeather'


export default function Header() {
  const settings = usePublicConfig()
  const [openMenu, setOpenMenu] = useState(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [time, setTime] = useState('')
  const headerRef = useRef(null)
  const triggerRefs = useRef({})
  const mobileTriggerRef = useRef(null)
  const location = useLocation()
  const isLandingPage = location.pathname === '/'

  useEffect(() => {
    setMobileNavOpen(false)
    setOpenMenu(null)
  }, [location.pathname])

  useEffect(() => {
    const closeMenusOnEscape = (event) => {
      if (event.key !== 'Escape') return
      const target = openMenu ? triggerRefs.current[openMenu] : mobileNavOpen ? mobileTriggerRef.current : null
      if (openMenu) setOpenMenu(null)
      else setMobileNavOpen(false)
      target?.focus()
    }

    document.addEventListener('keydown', closeMenusOnEscape)
    return () => document.removeEventListener('keydown', closeMenusOnEscape)
  }, [openMenu, mobileNavOpen])

  useEffect(() => {
    const closeOnResize = () => {
      if (window.innerWidth > 980) setMobileNavOpen(false)
    }
    window.addEventListener('resize', closeOnResize)
    return () => window.removeEventListener('resize', closeOnResize)
  }, [])



  useEffect(() => {
    const updateTime = () => {
      const formatter = new Intl.DateTimeFormat(settings['general.locale'] || 'en-PH', {
        timeZone: settings['general.timezone'] || 'Asia/Manila',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })

      setTime(formatter.format(new Date()))
    }

    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [settings])

  useEffect(() => {
    const outside = event => {
      if (!headerRef.current?.contains(event.target)) { setOpenMenu(null); setMobileNavOpen(false) }
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])

  const menuItems = [
    { label: 'Services', key: 'services', items: [
      ['Find a Service', '/services/directory', 'Search services, permits, and offices.', FileCheck2],
      ['Resident Services', '/services', 'Guidance for common resident transactions.', Users],
      ['Departments & Offices', '/departments', 'Find the right municipal office.', Building2],
      ['Emergency Hotlines', '/services/hotlines', 'Urgent public contact numbers.', Siren],
      ['Weather', '/weather', 'Conditions and forecasts.', CloudSun],
      ['Accessibility', '/accessibility', 'Access and reading preferences.', Accessibility],
    ] },
    { label: 'Business', key: 'business', items: [
      ['Business Services', '/services/e-services/business-services', 'Permits and business requirements.', Building2],
      ['New Business Application', '/services/e-services/new-business-application', 'Application information.', ClipboardCheck],
      ['Renew Business Application', '/services/e-services/renew-business-application', 'Renewal information.', FileCheck2],
      ['Business Billing & Payment', '/services/e-services/business-billing', 'Business billing guidance.', WalletCards],
      ['Real Property Tax', '/services/e-services/realty-billing', 'Real property billing guidance.', Landmark],
      ['Online Payment Order', '/services/e-services/online-payment-order', 'Payment order guidance.', WalletCards],
      ['Water Billing & Payment', '/services/e-services/water-billing', 'Water billing guidance.', CloudSun],
    ] },
    { label: 'News & Events', key: 'updates', items: [
      ['News & Updates', '/news', 'Published municipal updates.', Newspaper],
      ['Events', '/events', 'Activities and meetings.', CalendarDays],
    ] },
    { label: 'About Getafe', key: 'about', items: [
      ['Municipality', '/info/about', 'About Getafe and our public service.', Info],
      ['Officials', '/officials', 'Municipal officials and their terms.', Landmark],
      ['Barangays', '/barangays', 'Barangay information.', Users],
      ['History, Seal & Hymn', '/info/history', 'History and municipal identity.', BookOpen],
      ['Tourism', '/tourism', 'Visitor information.', Compass],
      ['Discover Getafe', '/discover', 'Destinations and local experiences.', Map],
      ['Data & Statistics', '/data', 'Public data and statistical releases.', ChartNoAxesCombined],
    ] },
  ]

  return (
    <>
      <header ref={headerRef} className="topbar public-service-header">
      <div className="container topbar-inner">
        <Link
          to="/"
          className="brand-wrap"
          aria-label="Municipality of Getafe — go to homepage"
          onClick={() => setOpenMenu(null)}
        >
          <img src={settings['general.logo'] || '/assets/getafe-seal.png'} alt="Municipality of Getafe Logo" className="brand-logo" />
          <div>
            <div className="brand-name" >{settings['general.company'] || 'Municipality of Getafe'}</div>
            <div className="brand-subtitle">Bohol • Philippines</div>
          </div>
        </Link>

        <button
          type="button"
          ref={mobileTriggerRef}
          className="mobile-menu-toggle"
          aria-label={mobileNavOpen ? 'Close main navigation' : 'Open main navigation'}
          aria-expanded={mobileNavOpen}
          aria-controls="site-navigation"
          onClick={() => { setMobileNavOpen(value => !value); setOpenMenu(null) }}
         data-icon-button="ghost">
          {mobileNavOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>

        <nav id="site-navigation" className={`main-nav${mobileNavOpen ? ' is-open' : ''}`} aria-label="Main navigation">
          <NavLink to="/" className={({isActive}) => isActive ? "active" : ""}>Home</NavLink>
          {menuItems.map((menu) => (
            <div
              className="nav-dropdown"
              key={menu.key}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                              setOpenMenu(null)
                }
              }}
            >
              <button
                type="button"
                className={openMenu === menu.key ? 'nav-dropdown-trigger active' : 'nav-dropdown-trigger'}
                aria-expanded={openMenu === menu.key}
                aria-controls={`nav-menu-${menu.key}`}
                ref={node => { triggerRefs.current[menu.key] = node }}
                onClick={() => setOpenMenu(current => current === menu.key ? null : menu.key)}
              >
                {menu.label} <ChevronDown size={15} aria-hidden="true" />
              </button>
              <div id={`nav-menu-${menu.key}`} className={openMenu === menu.key ? 'nav-dropdown-menu open' : 'nav-dropdown-menu'} hidden={openMenu !== menu.key}>
                {menu.items.map(([title, url, description, Icon]) => (
                  <NavLink to={url} className={({ isActive }) => isActive ? 'active' : undefined} onClick={() => setOpenMenu(null)} key={title}>
                    <span className="nav-dropdown-icon"><Icon size={18} aria-hidden="true" /></span>
                    <span className="nav-dropdown-copy"><strong>{title}</strong><small>{description}</small></span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          <NavLink to="/contact" className={({isActive}) => isActive ? "active" : ""}>Contact</NavLink>
          <NavLink
            to="/app"
            className={({isActive}) => isActive ? 'mobile-nav-eservices active' : 'mobile-nav-eservices'}
          >
            <span>E-Getafe · Online Services</span>
            <ArrowRight size={16} aria-hidden="true" />
          </NavLink>
        </nav>

        <div className="nav-actions">
          <div className="header-status">
            <HeaderWeather />
            <div className="header-clock" role="group" aria-label="Philippine Standard Time">
              <span className="header-clock-label">Philippine Standard Time</span>
              <span className="philippine-time">{time}</span>
            </div>
          </div>
          <Link to="/app" className="login-button">E-Getafe · Online Services</Link>
        </div>
      </div>
      </header>
      {isLandingPage && settings['general.communityBannerEnabled'] === true && (
        <aside className="civic-community-banner" aria-label="Getafe civic technology community">
          <div className="container civic-community-inner">
            <div className="civic-community-copy">
              <span className="civic-community-icon"><Users size={18} aria-hidden="true" /></span>
              <strong><Rocket size={15} aria-hidden="true" /> {settings['general.communityBannerTitle'] || 'Join the Getafe CivicTech Community'}</strong>
              <span>{settings['general.communityBannerMessage'] || 'Help improve local services through technology.'}</span>
            </div>
            <div className="civic-community-actions">
              <Link to="/community/civictech">Learn more</Link>
            </div>
          </div>
        </aside>
      )}
    </>
  )
}
