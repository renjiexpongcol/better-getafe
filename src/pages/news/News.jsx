import { useDataRevision } from '../../hooks/usePublicResource'
import { SearchInput, LoadingState, ErrorState, EmptyState } from '../../components/ui/Primitives'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './News.css'
import { publicApi } from '../../services/apiClient'
import { municipalDate } from '../../services/homepagePresentation'
import { usePublicConfig } from '../../context/PublicConfig'

const PAGE_SIZES = [9, 20, 50]
const date = value => municipalDate(value, { month: 'long' })

export default function News() {
  const dataRevision = useDataRevision()
  const settings = usePublicConfig()
  const maintenance = settings['maintenance.enabled'] === true
  const [data, setData] = useState({ items: [], pages: 1, page: 1, total: 0 })
  const [categories, setCategories] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(9)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (maintenance) {
      setCategories([])
      return undefined
    }
    publicApi('/categories')
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [dataRevision, maintenance])

  useEffect(() => {
    if (maintenance) {
      setLoading(false)
      setError('')
      return undefined
    }
    let active = true
    const timer = setTimeout(() => {
      setLoading(true)
      setError('')
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), display: 'news', public: 'true' })
      if (query) params.set('search', query)
      if (category) params.set('category', category)
      publicApi('/news?' + params, { force: retry > 0 || dataRevision > 0, persist: false })
        .then(next => { if (active) setData(next) })
        .catch(() => {
          if (!active) return
          setData({ items: [], pages: 1, page: 1, total: 0 })
          setError('We could not load the latest news right now.')
        })
        .finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [query, category, page, pageSize, retry, dataRevision, maintenance])

  const important = page === 1 && !query && !category ? data.items.find(item => item.is_important) : null
  const cards = data.items
  const isEmpty = !loading && !error && cards.length === 0
  const total = Number(data.total) || 0
  const firstItem = total ? (page - 1) * pageSize + 1 : 0
  const lastItem = Math.min(page * pageSize, total)
  const visiblePages = [...new Set([1, page - 1, page, page + 1, data.pages])]
    .filter(value => value >= 1 && value <= data.pages).sort((a, b) => a - b)

  return <main className="news-page">
    <div className="page-header"><div className="container page-header-inner"><div><h1 className="page-title">News &amp; Updates</h1><p className="page-subtitle">Official announcements and community information from the Municipality of Getafe.</p></div></div></div>
    <section className={`news-listing section${isEmpty ? ' news-listing-empty' : ''}`}><div className="container">
      <div className="news-controls"><SearchInput label="Search news" placeholder="Search news and updates" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} /><select aria-label="Filter by category" value={category} onChange={event => { setCategory(event.target.value); setPage(1) }}><option value="">All categories</option>{categories.map(item => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></div>
      {important && <Link className="featured-story" to={`/news/${important.slug}`}><div className="featured-image">{important.featured_image ? <img src={important.featured_image} alt={important.title} /> : <span>Important news</span>}</div><div><p className="news-category">Important news</p><h2>{important.title}</h2><p>{important.excerpt}</p><small>{date(important.published_at)}</small><span className="read-more">Read full story →</span></div></Link>}
      <h2 className="latest-title">Latest updates</h2>
      <div aria-busy={loading} aria-live="polite">{loading && data.items.length === 0 ? <LoadingState label="Loading news…"/> : error ? <ErrorState message={error} onRetry={() => setRetry(value => value + 1)}/> : cards.length ? <div className="news-grid">{cards.map(item => <article className="news-card" key={item.id}>{item.featured_image ? <img src={item.featured_image} alt={item.title} loading="lazy" /> : <div className="news-placeholder" aria-hidden="true"><img src="/assets/getafe-seal.png" alt="" /><span>Municipality of Getafe</span></div>}<div className="news-card-body"><p className="news-category">{item.category?.name || 'Updates'}</p><h3>{item.title}</h3><p>{item.excerpt}</p><small><time dateTime={item.published_at}>{date(item.published_at)}</time></small><Link to={`/news/${item.slug}`} aria-label={`Read more: ${item.title}`}>Read more <span aria-hidden="true">→</span></Link></div></article>)}</div> : <EmptyState title="No matching news" description="Try another search or choose a different category." action={(query || category) && <button type="button" className="ui-button ui-button--outline" onClick={() => { setQuery(''); setCategory(''); setPage(1) }}>Clear filters</button>}/>}</div>
      {data.pages > 1 && <nav className="pagination" aria-label="News pages"><button type="button" disabled={loading || page <= 1} onClick={() => setPage(current => current - 1)}>Previous</button>{visiblePages.map((value, index) => <span className="news-page-step" key={value}>{index > 0 && value - visiblePages[index - 1] > 1 && <span className="news-page-gap" aria-hidden="true">…</span>}<button type="button" disabled={loading} aria-label={`Go to news page ${value}`} aria-current={page === value ? 'page' : undefined} className={page === value ? 'active' : ''} onClick={() => setPage(value)}>{value}</button></span>)}<button type="button" disabled={loading || page >= data.pages} onClick={() => setPage(current => current + 1)}>Next</button></nav>}
      {!loading && !error && total > 0 && <div className="news-listing-summary" aria-live="polite"><span>Showing {firstItem}–{lastItem} of {total} updates</span><label>Show <select aria-label="Show updates per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }}>{PAGE_SIZES.map(size => <option value={size} key={size}>{size}</option>)}</select><span>per page</span></label></div>}
    </div></section>
  </main>
}
