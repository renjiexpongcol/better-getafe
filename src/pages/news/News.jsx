import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
const date = value => new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value))
export default function News() {
  const [data, setData] = useState({ items: [], pages: 1, page: 1 }), [categories, setCategories] = useState([]), [query, setQuery] = useState(''), [category, setCategory] = useState(''), [page, setPage] = useState(1), [loading, setLoading] = useState(true)
  useEffect(() => { fetch('/api/categories').then(r => r.json()).then(setCategories) }, [])
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      const p = new URLSearchParams({ page, limit: 7, display: 'news', public: 'true' })
      if (query) p.set('search', query)
      if (category) p.set('category', category)
      fetch(`/api/news?${p}`, { signal: controller.signal })
        .then(r => r.json())
        .then(setData)
        .catch(error => {
          if (error.name !== 'AbortError') setData({ items: [], pages: 1, page: 1 })
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, category, page])
  const featured = page === 1 && !query && !category ? data.items[0] : null, cards = featured ? data.items.slice(1) : data.items
  return <main className="news-page"><div className="page-header"><div className="container page-header-inner"><div><h1 className="page-title">News & Updates</h1><p className="page-subtitle">Official announcements and community information from the Municipality of Getafe.</p></div></div></div><section className="news-listing section"><div className="container"><div className="news-controls"><input aria-label="Search news" placeholder="Search news and updates" value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} /><select aria-label="Filter by category" value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}><option value="">All categories</option>{categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div>{featured && <Link className="featured-story" to={`/news/${featured.slug}`}><div className="featured-image">{featured.featured_image ? <img src={featured.featured_image} alt="" /> : <span>News & Updates</span>}</div><div><p className="news-category">{featured.category?.name || 'Updates'}</p><h2>{featured.title}</h2><p>{featured.excerpt}</p><small>{date(featured.published_at)}</small><span className="read-more">Read full story →</span></div></Link>}<h2 className="latest-title">{featured ? 'Latest news' : 'News & updates'}</h2><div aria-busy={loading}>{loading && data.items.length === 0 ? <p>Loading news…</p> : cards.length ? <div className="news-grid">{cards.map(a => <article className="news-card" key={a.id}>{a.featured_image ? <img src={a.featured_image} alt="" /> : <div className="news-placeholder">Getafe</div>}<div className="news-card-body"><p className="news-category">{a.category?.name || 'Updates'}</p><h3>{a.title}</h3><p>{a.excerpt}</p><small>{date(a.published_at)}</small><Link to={`/news/${a.slug}`}>Read More →</Link></div></article>)}</div> : <p className="news-empty">No published articles match your search.</p>}</div>{data.pages > 1 && <nav className="pagination" aria-label="News pages">{Array.from({ length: data.pages }, (_, i) => <button className={data.page === i + 1 ? 'active' : ''} onClick={() => setPage(i + 1)} key={i}>{i + 1}</button>)}</nav>}</div></section></main>
}
