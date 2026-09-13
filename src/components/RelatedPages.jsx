import { Link, useLocation } from 'react-router-dom'
import { publicRoutes } from '../routes'
import { ArrowRight } from 'lucide-react'

export default function RelatedPages() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/admin') || pathname.startsWith('/auth')) return null
  const current = publicRoutes.find((route) => pathname === route.path)
  const section = current?.folder
  const suggestions = publicRoutes.filter((route) => route.path !== pathname && !route.path.includes('official-profile') && !route.path.includes('barangay-detail') && (section ? route.folder === section : true)).slice(0, 3)
  if (!suggestions.length) return null
  return <aside className="related-pages" aria-label="Related pages"><div className="container"><div className="related-pages-heading"><div><strong>Learn more about Getafe</strong><small>Explore the municipality's history, location, and leadership across the portal.</small></div></div><div className="related-pages-links">{suggestions.map((route) => <Link key={route.path} to={route.path}>{route.title} <ArrowRight size={15} /></Link>)}</div></div></aside>
}
