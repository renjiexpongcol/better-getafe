import { usePublishedContent } from '../hooks/usePublicResource'
import { usePublicConfig } from '../context/PublicConfig'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Accessibility, ArrowRight, BookOpen, Building2, CalendarDays, ChevronDown, ClipboardCheck, CloudSun, Compass, FileCheck2, HeartHandshake, Info, Landmark, Mail, Map as MapIcon, Menu, Newspaper, PhoneCall, Rocket, Siren, Users, WalletCards, ChartNoAxesCombined, X } from 'lucide-react'
import HeaderInfoWidget from './HeaderInfoWidget'
import { buildPublicHeaderMenus, groupPublicHeaderMenuItems } from './headerNavigation'
import { navigationDestinationId } from '../services/websiteAnalytics.js'

const menuIcons = { Accessibility, BookOpen, Building2, CalendarDays, ClipboardCheck, CloudSun, Compass, FileCheck2, HeartHandshake, Info, Landmark, Mail, Map: MapIcon, Newspaper, PhoneCall, Siren, Users, WalletCards, ChartNoAxesCombined }
const DEFAULT_HEADER_HIDE_THRESHOLD = 90
const LANDING_HEADER_HIDE_THRESHOLD = 220
const DESKTOP_NAV_QUERY = '(min-width: 1121px)'
const anchoredMenus = new Set(['services', 'discover', 'municipality', 'national-id'])

export default function Header({ featuresEnabled = true }) {
  const settings = usePublicConfig()
  const [openMenu, setOpenMenu] = useState(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [time, setTime] = useState('')
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 981px)').matches)
  const navRef = useRef(null)
  const mobileMenuToggleRef = useRef(null)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 981px)')
    const update = () => setDesktop(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const [isHidden, setIsHidden] = useState(false)
  const menuInteractionRef = useRef(null)
  const location = useLocation()
  const isLandingPage = location.pathname === '/'
  const hideThreshold = isLandingPage ? LANDING_HEADER_HIDE_THRESHOLD : DEFAULT_HEADER_HIDE_THRESHOLD

  useLayoutEffect(() => {
    if (!anchoredMenus.has(openMenu)) return undefined
    const panel = navRef.current?.querySelector('.nav-dropdown--anchored > .nav-dropdown-menu.open')
    if (!panel) return undefined
    const anchor = panel.parentElement
    const positionPanel = () => {
      if (!window.matchMedia(DESKTOP_NAV_QUERY).matches) return
      const { left, width, bottom } = anchor.getBoundingClientRect()
      const triggerCenter = left + width / 2
      const inset = panel.offsetWidth / 2 + 16
      const viewportWidth = document.documentElement.clientWidth
      const preferredCenter = openMenu === 'national-id' ? triggerCenter : viewportWidth / 2
      const center = Math.max(inset, Math.min(preferredCenter, viewportWidth - inset))
      panel.style.setProperty('--dropdown-offset', `${center - triggerCenter}px`)
      panel.style.setProperty('--dropdown-space-below', `${window.innerHeight - bottom}px`)
    }
    positionPanel()
    window.addEventListener('resize', positionPanel)
    return () => window.removeEventListener('resize', positionPanel)
  }, [openMenu])

  useEffect(() => {
    setMobileNavOpen(false)
    menuInteractionRef.current = null
    setOpenMenu(null)
  }, [location.pathname])

  useEffect(() => {
    const closeMenusOnEscape = (event) => {
      if (event.key !== 'Escape') return
      const mobileMenuWasOpen = mobileMenuToggleRef.current?.getAttribute('aria-expanded') === 'true'
      const openDropdown = navRef.current?.querySelector('.nav-dropdown-menu.open')?.parentElement
      if (!mobileMenuWasOpen && !openDropdown) return
      event.preventDefault()
      const servicesTrigger = openDropdown?.querySelector('[aria-controls="nav-menu-services"]')
      menuInteractionRef.current = null
      setOpenMenu(null)
      if (!servicesTrigger) setMobileNavOpen(false)
      const focusTarget = servicesTrigger || (mobileMenuWasOpen
        ? mobileMenuToggleRef.current
        : openDropdown?.querySelector('.nav-dropdown-trigger'))
      window.requestAnimationFrame(() => focusTarget?.focus())
    }

    document.addEventListener('keydown', closeMenusOnEscape)
    return () => document.removeEventListener('keydown', closeMenusOnEscape)
  }, [])

  useEffect(() => {
    const closeMenusOnOutsideClick = (event) => {
      const openDropdown = navRef.current?.querySelector('.nav-dropdown-menu.open')?.parentElement
      if (openDropdown?.contains(event.target)) return
      menuInteractionRef.current = null
      setOpenMenu(null)
    }

    document.addEventListener('pointerdown', closeMenusOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeMenusOnOutsideClick)
  }, [])

  useEffect(() => {
    const closeOnResize = () => {
      if (window.matchMedia(DESKTOP_NAV_QUERY).matches) setMobileNavOpen(false)
    }
    window.addEventListener('resize', closeOnResize)
    return () => window.removeEventListener('resize', closeOnResize)
  }, [])



  useEffect(() => {
    if (!featuresEnabled || !desktop) return undefined
    const formatter = new Intl.DateTimeFormat(settings['general.locale'] || 'en-PH', {
      timeZone: settings['general.timezone'] || 'Asia/Manila', weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    })
    const updateTime = () => {
      if (document.visibilityState === 'visible') setTime(formatter.format(new Date()))
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [featuresEnabled, desktop, settings['general.locale'], settings['general.timezone']])

  useEffect(() => {
    const handleScroll = () => {
      const shouldHide = !mobileNavOpen && window.scrollY > hideThreshold
      setIsHidden(shouldHide)
      if (shouldHide) setOpenMenu(null)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hideThreshold, mobileNavOpen, settings])

  const { content: navigation } = usePublishedContent('navigation')
  const configuredMenus = Array.isArray(navigation?.menus) ? navigation.menus : []
  const sourceMenus = buildPublicHeaderMenus(configuredMenus)
  const menuItems = sourceMenus.map(menu => {
    const items = (menu.items || []).map(item => ({ ...item, Icon: menuIcons[item.icon] || Info }))
    return { ...menu, sections: groupPublicHeaderMenuItems(menu.key, items) }
  })
  const nationalIdItems = menuItems.find(menu => menu.key === 'services')?.sections.find(section => section.key === 'national-id')?.items || []
  if (nationalIdItems.length) menuItems.push({ key: 'national-id', label: 'National ID', sections: [{ key: 'all', label: '', items: nationalIdItems }] })

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
            <div className="brand-subtitle">{settings['general.locationLabel']}</div>
          </div>
        </Link>

        <button
          ref={mobileMenuToggleRef}
          type="button"
          className="mobile-menu-toggle"
          aria-label={mobileNavOpen ? 'Close main navigation' : 'Open main navigation'}
          aria-expanded={mobileNavOpen}
          aria-controls="site-navigation"
          onClick={() => { setMobileNavOpen(value => !value); setOpenMenu(null) }}
         data-icon-button="ghost">
          {mobileNavOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>

        <nav ref={navRef} id="site-navigation" className={`main-nav${mobileNavOpen ? ' is-open' : ''}`} aria-label="Main navigation">
          <NavLink to="/" className={({isActive}) => isActive ? "active" : ""}>Home</NavLink>
          {menuItems.map((menu) => (
            <div
              className={`nav-dropdown${anchoredMenus.has(menu.key) ? ' nav-dropdown--anchored' : ''}`}
              key={menu.key}
              onMouseEnter={() => {
                if (!window.matchMedia(DESKTOP_NAV_QUERY).matches) return
                const interaction = menuInteractionRef.current
                if (interaction?.key === menu.key && interaction.mode === 'click') return
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
                  const shouldClose = openMenu === menu.key && (
                    event.detail === 0 || menuInteractionRef.current?.mode === 'click'
                  )
                  menuInteractionRef.current = shouldClose ? null : { key: menu.key, mode: 'click' }
                  setOpenMenu(shouldClose ? null : menu.key)
                }}
              >
                {menu.label} <ChevronDown size={15} aria-hidden="true" />
              </button>
              <div id={`nav-menu-${menu.key}`} className={`nav-dropdown-menu nav-dropdown-menu--${menu.key}${openMenu === menu.key ? ' open' : ''}`}>
                <div className="nav-dropdown-main-sections">
                  {menu.sections.filter(section => section.key !== 'national-id').map(section => (
                    <section className="nav-dropdown-section" key={section.key} aria-label={section.label || `${menu.label} links`}>
                      {section.label && <h3>{section.label}</h3>}
                      <div className="nav-dropdown-section-items">
                        {section.items.map(({ name, url, description, Icon }) => {
                          const content = <><span className="nav-dropdown-icon"><Icon size={18} aria-hidden="true" /></span><span className="nav-dropdown-copy"><strong>{name}</strong>{description && <small>{description}</small>}</span></>
                          return url.startsWith('https://')
                            ? <a href={url} target="_blank" rel="noopener noreferrer" data-analytics-placement={`header.${menu.key}`} data-analytics-destination={navigationDestinationId(url)} onClick={() => setOpenMenu(null)} key={url}>{content}</a>
                            : <NavLink to={url} className={({ isActive }) => isActive ? 'active' : undefined} data-analytics-placement={`header.${menu.key}`} data-analytics-destination={navigationDestinationId(url)} onClick={() => setOpenMenu(null)} key={url}>{content}</NavLink>
                        })}
                      </div>
                    </section>
                  ))}
                </div>
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
            {featuresEnabled && <HeaderInfoWidget />}
            <div className="header-clock" role="group" aria-label="Philippine Standard Time">
              <span className="header-clock-label">Philippine Standard Time</span>
              <span className="philippine-time">{time}</span>
            </div>
          </div>
          <Link to="/app" className="login-button">Login</Link>
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
