import { useMemo, useState } from 'react'
import { Search, ArrowUpDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import ServicesSection from '../../components/ServicesSection'
import { citizenServices, serviceCategories } from '../../data/citizenServices'

const categoryNames = {
  all: 'All Services', business: 'Business and Trade', treasury: 'Treasury and Payments',
  certificates: 'Certificates and IDs', health: 'Health', education: 'Education',
}
const serviceUrl = service => service.id === 'barangay-clearance'
  ? '/services/barangay-clearance'
  : service.category === 'business' ? '/services/business-trade'
    : service.category === 'treasury' ? `/app/payments?settlement=${encodeURIComponent(service.name.replace(/ Settlement$| Fees$/g, ''))}`
      : `/services/${service.category}`

export default function Services() {
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' })
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return citizenServices.filter(service => {
      const categoryName = serviceCategories.find(item => item.id === service.category)?.name || service.category
      return (category === 'all' || service.category === category) && (!term || `${service.name} ${categoryName} ${categoryNames[service.category] || ''}`.toLowerCase().includes(term))
    }).sort((a, b) => {
      const left = sort.key === 'name' ? a.name : (categoryNames[a.category] || a.category)
      const right = sort.key === 'name' ? b.name : (categoryNames[b.category] || b.category)
      return left.localeCompare(right) * (sort.direction === 'asc' ? 1 : -1)
    })
  }, [category, query, sort])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visibleServices = filtered.slice((page - 1) * pageSize, page * pageSize)
  const changeSort = key => setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))

  return (
    <main id="services-page">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <h1 className="page-title">Municipal Services</h1>
            <p className="page-subtitle">Official LGU services of the Municipality of Getafe, Bohol</p>
          </div>
        </div>
      </div>
      <ServicesSection />
      <section className="services-catalogue section" aria-labelledby="services-catalogue-title">
        <div className="container">
          <div className="services-catalogue-heading">
            <div><p className="eyebrow">Browse the catalogue</p><h2 id="services-catalogue-title">All Municipal Services</h2><p>Search services or filter by category to find where to start.</p></div>
          </div>
          <div className="services-category-filters" aria-label="Filter services by category">
            {Object.entries(categoryNames).map(([id, label]) => <button key={id} type="button" className={category === id ? 'is-active' : ''} aria-pressed={category === id} onClick={() => { setCategory(id); setPage(1) }}>{label}</button>)}
          </div>
          <div className="services-table-controls">
            <label>Show <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select> entries</label>
            <label className="services-table-search"><span>Search:</span><span className="services-search-input"><Search size={16} aria-hidden="true" /><input value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} aria-label="Search services" /></span></label>
          </div>
          <div className="services-table-wrap"><table className="services-table"><thead><tr>
            <th scope="col"><button type="button" onClick={() => changeSort('name')}>Services Link <ArrowUpDown size={14} aria-hidden="true" /></button></th>
            <th scope="col"><button type="button" onClick={() => changeSort('category')}>Category <ArrowUpDown size={14} aria-hidden="true" /></button></th>
            <th scope="col">Service details</th>
          </tr></thead><tbody>{visibleServices.map(service => <tr key={service.id}>
            <td><Link to={serviceUrl(service)}>{service.name}</Link></td>
            <td>{categoryNames[service.category] || service.category}</td>
            <td>{serviceCategories.find(item => item.id === service.category)?.description || 'Municipal service information and requirements.'}</td>
          </tr>)}{visibleServices.length === 0 && <tr><td colSpan="3" className="services-table-empty">No services match your search.</td></tr>}</tbody></table></div>
          <div className="services-table-footer"><span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} entries</span><nav aria-label="Services pages"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>{page} / {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}>Next</button></nav></div>
        </div>
      </section>
    </main>
  )
}
