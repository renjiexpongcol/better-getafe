import { usePublicConfig } from '../context/PublicConfig'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Accessibility, ArrowRight, BookOpen, Building2, CalendarDays, ChevronDown, ClipboardCheck, CloudSun, Compass, FileCheck2, HeartHandshake, Info, Landmark, Mail, Map, Menu, Newspaper, PhoneCall, Rocket, Siren, Users, WalletCards, ChartNoAxesCombined, X } from 'lucide-react'
import HeaderWeather from './HeaderWeather'

const DEFAULT_HEADER_HIDE_THRESHOLD = 90
const LANDING_HEADER_HIDE_THRESHOLD = 220

export default function Header() {
  const settings = usePublicConfig()
  const [openMenu, setOpenMenu] = useState(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [time, setTime] = useState('')
  const [isHidden, setIsHidden] = useState(false)
  const menuInteractionRef = useRef(null)
  const location = useLocation()
  const isLandingPage = location.pathname === '/'
  const hideThreshold = isLandingPage ? LANDING_HEADER_HIDE_THRESHOLD : DEFAULT_HEADER_HIDE_THRESHOLD

  useEffect(() => {
    setMobileNavOpen(false)
    menuInteractionRef.current = null
    setOpenMenu(null)
  }, [location.pathname])

  useEffect(() => {
    const closeMenusOnEscape = (event) => {
      if (event.key !== 'Escape') return
      menuInteractionRef.current = null
      setOpenMenu(null)
      setMobileNavOpen(false)
    }

    document.addEventListener('keydown', closeMenusOnEscape)
    return () => document.removeEventListener('keydown', closeMenusOnEscape)
  }, [])

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
        second: '2-digit',
        hour12: true,
      })

      setTime(formatter.format(new Date()))
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [settings])

  useEffect(() => {
    const handleScroll = () => {
      const shouldHide = window.scrollY > hideThreshold
      setIsHidden(shouldHide)
      if (shouldHide) setOpenMenu(null)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hideThreshold, settings])

  const menuItems = [
    {
      label: 'Services',
      key: 'services',
      items: [
        ['Executive', '/departments/executive', 'Mayor\'s office and municipal leadership.', Landmark],
        ['Engineering', '/departments/engineering', 'Infrastructure and public works support.', Building2],
        ['Zoning/Planning', '/departments/zoning-planning', 'Land use and development planning.', Map],
        ['Treasury', '/departments/treasury', 'Local payments, taxes, and revenue services.', WalletCards],
        ['Assessment', '/departments/assessment', 'Property assessment and tax declarations.', ClipboardCheck],
        ['Civil Registry', '/departments/civil-registry', 'Birth, marriage, death, and other civil registry records.', FileCheck2],
        ['Health', '/departments/health', 'Public health and rural health services.', HeartHandshake],
        ['Social Welfare', '/departments/social-welfare', 'Assistance programs for residents and families.', Users],
      ],
    },
    {
      label: 'Business',
      key: 'business',
      items: [
        ['Business Services', '/services/e-services/business-services', 'Permits, clearances, and local business requirements.', Building2],
        ['Business Online Billing and Payment', '/services/e-services/business-billing', 'Business billing and payment information.', WalletCards],
        ['New Business Application', '/services/e-services/new-business-application', 'Start a new business application.', ClipboardCheck],
        ['Renew Business Application', '/services/e-services/renew-business-application', 'Renew an existing business application.', FileCheck2],
        ['Realty Tax Online Billing and Payment', '/services/e-services/realty-billing', 'Real property tax billing and payment information.', Landmark],
        ['Online Payment Order', '/services/e-services/online-payment-order', 'View online payment order guidance.', WalletCards],
        ['Water Online Billing and Payment', '/services/e-services/water-billing', 'Water billing and payment information.', CloudSun],
      ],
    },
    {
      label: 'Residents',
      key: 'residents',
      items: [
        ['Citizen Services', '/services', 'Common requests for Getafe residents.', Users],
        ['Other Services', '/services/e-services/other-services', 'Requirements and applications for other municipal services.', ClipboardCheck],
        ['Emergency Hotlines', '/services/hotlines', 'Fast access to urgent public numbers.', Siren],
        ['Accessibility', '/accessibility', 'Inclusive access information.', Accessibility],
      ],
    },
    {
      label: 'Information',
      key: 'information',
      items: [
        ['About Us', '/info/about', 'Mission, vision, and who we serve.', Info],
        ['Municipal Officials', '/officials', 'Elected leaders, barangay captains, and department heads.', Landmark],
        ['History & Hymn', '/info/history', 'The story, seal, and song of Getafe.', BookOpen],
        ['Tourism', '/tourism', 'Explore Getafe destinations, islands, and coastal places.', Compass],
        ['Gallery of Events', '/events', 'See the celebrations and milestones of Getafe.', CalendarDays],
        ['Contact Us', '/contact', 'Reach the municipal offices.', Mail],
        ['News and Updates', '/news', 'Latest local announcements.', Newspaper],
        ['Weather Updates', '/weather', 'Live conditions and forecasts.', CloudSun],
        ['Data & Statistics', '/data', 'Public datasets and official statistical releases.', ChartNoAxesCombined],
        ['Emergency Hotlines', '/services/hotlines', 'Police, fire, medical, and public services.', PhoneCall],
      ],
    },
  ]

  return (
    <>
      <header className={isHidden ? 'topbar topbar-hidden' : 'topbar'}>
      <div className="container topbar-inner">
        <Link
          to="/"
          className="brand-wrap"
          aria-label="Municipality of Getafe — go to homepage"
          onClick={() => setOpenMenu(null)}
        >
          <img src={settings['general.logo'] || '/assets/getafe-seal.png'} alt="Municipality of Getafe Logo" className="brand-logo" />
          <div>
            <div className="brand-name" style={{ whiteSpace: 'nowrap' }}>{settings['general.company'] || 'Municipality of Getafe'}</div>
            <div className="brand-subtitle">Bohol • Philippines</div>
          </div>
        </Link>

        <button
          type="button"
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
              onMouseEnter={() => {
                menuInteractionRef.current = { key: menu.key, mode: 'hover' }
                setOpenMenu(menu.key)
              }}
              onMouseLeave={() => {
                if (menuInteractionRef.current?.key !== menu.key || menuInteractionRef.current.mode === 'click') return
                menuInteractionRef.current = null
                setOpenMenu(current => current === menu.key ? null : current)
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  menuInteractionRef.current = null
                  setOpenMenu(null)
                }
              }}
            >
              <button
                type="button"
                className={openMenu === menu.key ? 'nav-dropdown-trigger active' : 'nav-dropdown-trigger'}
                aria-expanded={openMenu === menu.key}
                aria-haspopup="true"
                aria-controls={`nav-menu-${menu.key}`}
                onClick={(event) => {
                  const shouldClose = openMenu === menu.key && event.detail === 0
                  menuInteractionRef.current = { key: menu.key, mode: 'click' }
                  setOpenMenu(shouldClose ? null : menu.key)
                }}
              >
                {menu.label} <ChevronDown size={15} aria-hidden="true" />
              </button>
              <div id={`nav-menu-${menu.key}`} className={openMenu === menu.key ? 'nav-dropdown-menu open' : 'nav-dropdown-menu'}>
                {menu.items.map(([title, url, description, Icon]) => (
                  <NavLink to={url} className={({ isActive }) => isActive ? 'active' : undefined} onClick={() => setOpenMenu(null)} key={title}>
                    <span className="nav-dropdown-icon"><Icon size={18} aria-hidden="true" /></span>
                    <span className="nav-dropdown-copy"><strong>{title}</strong><small>{description}</small></span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          <NavLink to="/news" className={({isActive}) => isActive ? "active" : ""}>News</NavLink>
          <NavLink
            to="/app"
            className={({isActive}) => isActive ? 'mobile-nav-eservices active' : 'mobile-nav-eservices'}
          >
            <span>E-Getafe</span>
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
          <Link to="/app" className="login-button">E-Getafe</Link>
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
