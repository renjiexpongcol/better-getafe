import { ArrowUpRight, Newspaper } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { publicApi } from '../services/apiClient'
import { municipalDate } from '../services/homepagePresentation'

export default function NewsSection() {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(false)
    publicApi('/news?display=news&homepage=true&public=true&page=1&limit=4', { force: retry > 0, persist: false })
      .then(data => { if (active) setArticles(data.items || []) })
      .catch(() => { if (active) { setArticles([]); setError(true) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])
  const card = (article, featured = false) => <article className={featured ? 'home-news-card home-news-card-featured' : 'home-news-card home-news-card-secondary'} key={article.id}>
    <div className="home-news-card-icon"><img src={article.featured_image || '/assets/Getafe_Bohol_1.jpg'} alt={article.featured_image ? article.title : 'Getafe, Bohol'} loading="lazy" decoding="async" width="800" height="450" /></div>
    <div className="home-news-card-body"><p className="news-category">{article.category?.name || 'Municipal update'}</p>
      {article.published_at && <time dateTime={article.published_at}>{municipalDate(article.published_at)}</time>}
      <h3><Link to={`/news/${encodeURIComponent(article.slug)}`}>{article.title}</Link></h3><p>{article.excerpt}</p>
      {article.event_start_at && <p>Scheduled: <time dateTime={article.event_start_at}>{municipalDate(article.event_start_at)}</time></p>}
      <Link to={`/news/${encodeURIComponent(article.slug)}`}>Read update <ArrowUpRight size={15} aria-hidden="true" /></Link>
    </div>
  </article>
  return <section className="section home-news-section" id="news" aria-labelledby="homepage-news-title"><div className="container">
    <div className="home-news-head"><div className="section-head"><h2 id="homepage-news-title">News &amp; updates</h2></div><Link to="/news" className="home-news-all">View all updates <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
    {loading ? <p className="homepage-state" role="status">Loading municipal updates…</p> : error ? <div className="homepage-state" role="status"><h3>News is temporarily unavailable</h3><p>Please try again or visit the news archive.</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button> <Link to="/news">News archive</Link></div> : articles.length ? <div className="home-news-content"><div className="home-news-featured-column">{card(articles[0], true)}{articles.length > 1 && <div className="home-news-secondary-grid">{articles.slice(1, 4).map(article => card(article))}</div>}</div></div> : <div className="homepage-state" role="status"><Newspaper size={22} aria-hidden="true" /><p>No municipal updates have been published yet.</p><Link to="/news">News archive</Link></div>}
  </div></section>
}
