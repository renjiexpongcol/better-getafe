import { usePublicConfig } from '../context/PublicConfig'
import { useEffect, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Accessibility, BookOpen, Building2, CalendarDays, ChevronDown, ClipboardCheck, CloudSun, Compass, FileCheck2, HeartHandshake, Info, Landmark, LogOut, Mail, Map, Newspaper, PhoneCall, Siren, Users, WalletCards } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Header() {
  const settings = usePublicConfig()
  const [openMenu, setOpenMenu] = useState(null)
  const [time, setTime] = useState('')
  const [isHidden, setIsHidden] = useState(false)
  const { user, logout } = useAuth()

  const initials = user
    ? user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
    : ''


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

      setTime(`Philippine Standard Time (${formatter.format(new Date())})`)
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [settings])

  useEffect(() => {
    const handleScroll = () => {
      setIsHidden(window.scrollY > 90)
      if (window.scrollY > 90) setOpenMenu(null)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [settings])

  const menuItems = [
    {
      label: 'Services',
      key: 'services',
      items: [
        ['Executive', '/services/directory?department=executive', 'Mayor\'s office and municipal leadership.', Landmark],
        ['Engineering', '/services/directory?department=engineering', 'Infrastructure and public works support.', Building2],
        ['Zoning/Planning', '/services/directory?department=zoning-planning', 'Land use and development planning.', Map],
        ['Treasury', '/services/directory?department=treasury', 'Local payments, taxes, and revenue services.', WalletCards],
        ['Assessment', '/services/directory?department=assessment', 'Property assessment and tax declarations.', ClipboardCheck],
        ['Civil Registry', '/services/directory?department=civil-registry', 'Birth, marriage, and death records.', FileCheck2],
        ['Health', '/services/directory?department=health', 'Public health and rural health services.', HeartHandshake],
        ['Social Welfare', '/services/directory?department=social-welfare', 'Assistance programs for residents and families.', Users],
      ],
    },
    {
      label: 'Residents',
      key: 'residents',
      items: [
        ['Citizen Services', '/services', 'Common requests for Getafe residents.', Users],
        ['Emergency Hotlines', '/services/hotlines', 'Fast access to urgent public numbers.', Siren],
        ['Accessibility', '/info/accessibility', 'Inclusive access information.', Accessibility],
      ],
    },
    {
      label: 'Information',
      key: 'information',
      items: [
        ['About Us', '/info/about', 'Mission, vision, and who we serve.', Info],
        ['Municipal Officials', '/info/officials', 'Elected leaders, barangay captains, and department heads.', Landmark],
        ['History & Hymn', '/info/history', 'The story, seal, and song of Getafe.', BookOpen],
        ['Tourism', '/tourism', 'Explore Getafe destinations, islands, and coastal places.', Compass],
        ['Gallery of Events', '/events', 'See the celebrations and milestones of Getafe.', CalendarDays],
        ['Contact Us', '/contact', 'Reach the municipal offices.', Mail],
        ['News and Updates', '/news', 'Latest local announcements.', Newspaper],
        ['Weather Updates', '/weather', 'Live conditions and forecasts.', CloudSun],
        ['Emergency Hotlines', '/services/hotlines', 'Police, fire, medical, and public services.', PhoneCall],
      ],
    },
  ]

  return (
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

        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/" className={({isActive}) => isActive ? "active" : ""}>Home</NavLink>
          {menuItems.map((menu) => (
            <div
              className="nav-dropdown"
              key={menu.key}
              onMouseEnter={() => setOpenMenu(menu.key)}
              onMouseLeave={() => setOpenMenu(null)}
              onFocus={() => setOpenMenu(menu.key)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenu(null)
              }}
            >
              <button
                type="button"
                className={openMenu === menu.key ? 'nav-dropdown-trigger active' : 'nav-dropdown-trigger'}
                aria-expanded={openMenu === menu.key}
              >
                {menu.label} <ChevronDown size={15} aria-hidden="true" />
              </button>
              <div className={openMenu === menu.key ? 'nav-dropdown-menu open' : 'nav-dropdown-menu'}>
                {menu.items.map(([title, url, description, Icon]) => (
                  <Link to={url} onClick={() => setOpenMenu(null)} key={title}>
                    <span className="nav-dropdown-icon"><Icon size={18} aria-hidden="true" /></span>
                    <span className="nav-dropdown-copy"><strong>{title}</strong><small>{description}</small></span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <NavLink to="/news" className={({isActive}) => isActive ? "active" : ""}>News</NavLink>
        </nav>

        <div className="nav-actions">
          <span className="philippine-time">{time}</span>
          {user ? (
            <div className="user-chip">
              <span className="user-avatar" aria-hidden="true">{initials}</span>
              <span className="user-meta">
                <span className="user-name">{user.name}</span>
                <span className="user-role">{user.role}</span>
              </span>
              {user.role === 'admin' && <Link to="/admin" className="login-button">CMS</Link>}
              <button
                type="button"
                className="logout-button"
                onClick={logout}
                aria-label="Sign out of your account"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <Link to="/auth/login" className="login-button">Log in</Link>
          )}
        </div>
      </div>
    </header>
  )
}

