import { Link } from 'react-router-dom'
import { Home, Info, Wrench, Newspaper, Scale, ArrowUpRight } from 'lucide-react'
import { sitemapGroups } from '../../routes'

const groupIcons = {
  home: Home,
  info: Info,
  services: Wrench,
  news: Newspaper,
  legal: Scale,
}

export default function Sitemap() {
  return (
    <main id="sitemap">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <h1 className="page-title">Sitemap</h1>
            <p className="page-subtitle">An overview of all pages on the official Getafe web portal.</p>
          </div>
        </div>
      </div>

      <div className="content-page container">
        <p className="sitemap-intro">
          Use the links below to navigate the portal. The list is generated automatically from the site's
          page structure, so it always reflects the pages that are currently available.
        </p>

        <div className="sitemap-grid">
          {sitemapGroups.map((group) => {
            const Icon = groupIcons[group.folder] || Home
            return (
              <section className="sitemap-group" key={group.folder}>
                <h2><Icon size={18} /> {group.label}</h2>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.path}>
                      <Link to={link.path}>
                        <span>{link.title}</span>
                        <ArrowUpRight size={15} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>

        <p className="sitemap-note">
          Looking for something specific? Try the <Link to="/services">services page</Link> or{' '}
          <Link to="/news">news &amp; updates</Link>.
        </p>
      </div>
    </main>
  )
}
