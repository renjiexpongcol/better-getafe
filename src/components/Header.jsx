import { useEffect, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Header() {
  const [openMenu, setOpenMenu] = useState(null)
  const [time, setTime] = useState('')
  const [isHidden, setIsHidden] = useState(false)
  const { user, logout } = useAuth()

  const initials = user
    ? user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
    : ''


  useEffect(() => {
    const updateTime = () => {
      const formatter = new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
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
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      setIsHidden(window.scrollY > 90)
      if (window.scrollY > 90) setOpenMenu(null)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const menuItems = [
    {
      label: 'Services',
      key: 'services',
      items: [
        ['Business Permits', '/services', 'Apply for local business requirements.'],
        ['Certificates', '/services', 'Request clearances and civil documents.'],
        ['Assistance Programs', '/services', 'Find social and health support.'],
      ],
    },
    {
      label: 'Residents',
      key: 'residents',
      items: [
        ['Citizen Services', '/services', 'Common requests for Getafe residents.'],
        ['Emergency Hotlines', '/services/hotlines', 'Fast access to urgent public numbers.'],
        ['Accessibility', '/info/accessibility', 'Inclusive access information.'],
      ],
    },
    {
      label: 'Information',
      key: 'information',
      items: [
        ['About Us', '/info/about', 'Mission, vision, and who we serve.'],
        ['Municipal Officials', '/info/officials', 'Elected leaders, barangay captains, and department heads.'],
        ['History & Hymn', '/info/history', 'The story, seal, and song of Getafe.'],
        ['Contact Us', '/contact', 'Reach the municipal offices.'],
        ['News and Updates', '/news', 'Latest local announcements.'],
        ['Emergency Hotlines', '/services/hotlines', 'Police, fire, medical, and public services.'],
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
          <img src="/assets/getafe-seal.png" alt="Municipality of Getafe Logo" className="brand-logo" />
          <div>
            <div className="brand-name" style={{ whiteSpace: 'nowrap' }}>Municipality of Getafe</div>
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
                {menu.items.map(([title, url, description]) => (
                  <Link to={url} onClick={() => setOpenMenu(null)} key={title}>
                    <strong>{title}</strong>
                    <small>{description}</small>
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
