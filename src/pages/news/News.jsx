import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './News.css'
import { publicApi } from '../../services/apiClient'

const PAGE_SIZES = [10, 20, 50]
const date = value => new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value))

export default function News() {
  const [data, setData] = useState({ items: [], pages: 1, page: 1, total: 0 })
  const [categories, setCategories] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    publicApi('/categories')
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true)
      setError('')
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), display: 'news', public: 'true' })
      if (query) params.set('search', query)
      if (category) params.set('category', category)
      publicApi('/news?' + params)
        .then(response => response.ok ? response.json() : Promise.reject(new Error('News unavailable')))
        .then(next => setData(next))
        .catch(fetchError => {
          setData({ items: [], pages: 1, page: 1, total: 0 })
          setError('We could not load the latest news right now.')
        })
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [query, category, page, pageSize, retry])

  const important = page === 1 && !query && !category ? data.items.find(item => item.is_important) : null
  const cards = data.items
  const total = Number(data.total) || 0
  const firstItem = total ? (page - 1) * pageSize + 1 : 0
  const lastItem = Math.min(page * pageSize, total)

  return <main className="news-page">
    <div className="page-header"><div className="container page-header-inner"><div><h1 className="page-title">News &amp; Updates</h1><p className="page-subtitle">Official announcements and community information from the Municipality of Getafe.</p></div></div></div>
    <section className="news-listing section"><div className="container">
      <div className="news-controls"><input type="search" aria-label="Search news" placeholder="Search news and updates" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} /><select aria-label="Filter by category" value={category} onChange={event => { setCategory(event.target.value); setPage(1) }}><option value="">All categories</option>{categories.map(item => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></div>
      {important && <Link className="featured-story" to={`/news/${important.slug}`}><div className="featured-image">{important.featured_image ? <img src={important.featured_image} alt={important.title} /> : <span>Important news</span>}</div><div><p className="news-category">Important news</p><h2>{important.title}</h2><p>{important.excerpt}</p><small>{date(important.published_at)}</small><span className="read-more">Read full story →</span></div></Link>}
      <h2 className="latest-title">News &amp; updates</h2>
      <div aria-busy={loading} aria-live="polite">{loading && data.items.length === 0 ? <div className="list-state-card"><strong>Loading news…</strong><p>Getting the latest announcements from the municipality.</p></div> : error ? <div className="list-state-card" role="alert"><strong>News is temporarily unavailable</strong><p>{error} Please try again in a moment.</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : cards.length ? <div className="news-grid">{cards.map(item => <article className="news-card" key={item.id}>{item.featured_image ? <img src={item.featured_image} alt={item.title} loading="lazy" /> : <div className="news-placeholder" aria-label="Getafe news">Getafe</div>}<div className="news-card-body"><p className="news-category">{item.category?.name || 'Updates'}</p><h3>{item.title}</h3><p>{item.excerpt}</p><small>{date(item.published_at)}</small><Link to={`/news/${item.slug}`}>Read more <span aria-hidden="true">→</span></Link></div></article>)}</div> : <p className="news-empty">No published articles match your search.</p>}</div>
      {data.pages > 1 && <nav className="pagination" aria-label="News pages"><button type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>Previous</button>{Array.from({ length: data.pages }, (_, index) => <button type="button" aria-label={`Go to news page ${index + 1}`} aria-current={page === index + 1 ? 'page' : undefined} className={page === index + 1 ? 'active' : ''} onClick={() => setPage(index + 1)} key={index}>{index + 1}</button>)}<button type="button" disabled={page >= data.pages} onClick={() => setPage(current => current + 1)}>Next</button></nav>}
      {!loading && !error && total > 0 && <div className="news-listing-summary" aria-live="polite"><span>Showing {firstItem}–{lastItem} of {total} updates</span><label>Show <select aria-label="Show updates per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }}>{PAGE_SIZES.map(size => <option value={size} key={size}>{size}</option>)}</select><span>per page</span></label></div>}
    </div></section>
  </main>
}
