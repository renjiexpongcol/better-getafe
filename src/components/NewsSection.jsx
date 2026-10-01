import { ArrowUpRight, ChevronLeft, ChevronRight, Newspaper } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { publicApi } from '../services/apiClient'

export default function NewsSection() {
  const limit = 5
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry] = useState(0)
  const [sideIndex, setSideIndex] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError('')
    const query = new URLSearchParams({ display: 'news', homepage: 'true', public: 'true', page: '1', limit: String(limit) })
    publicApi('/news?' + query)
      .then(data => {
        setArticles(data.items || [])
        setSideIndex(0)
      })
      .catch(() => {
        setArticles([])
        setError('The latest updates are temporarily unavailable.')
      })
      .finally(() => setLoading(false))
    return undefined
  }, [limit, retry])

  const renderCard = (article, featured = false) => (
    <article className={featured ? 'home-news-card home-news-card-featured' : 'home-news-card home-news-card-secondary'} key={article.id}>
      <div className="home-news-card-icon">
        {article.featured_image ? <img src={article.featured_image} alt={article.title || 'Municipal update'} /> : <><img src="/assets/Getafe_Bohol_1.jpg" alt="Getafe municipal updates" /><span className="home-news-placeholder-label"><Newspaper size={19} /> Getafe today</span></>}
      </div>
      <div className="home-news-card-body">
        <p className="news-category">{article.category?.name || 'Updates'}</p>
        <h3><Link to={`/news/${article.slug}`}>{article.title}</Link></h3>
        <p>{article.excerpt}</p>
        <Link to={`/news/${article.slug}`}>Read story <ArrowUpRight size={15} /></Link>
      </div>
    </article>
  )

  const sideArticles = articles.slice(1)
  const moveSide = direction => setSideIndex(current => sideArticles.length ? (current + direction + sideArticles.length) % sideArticles.length : 0)
  const visibleSideArticles = sideArticles.length > 2
    ? [sideArticles[sideIndex % sideArticles.length], sideArticles[(sideIndex + 1) % sideArticles.length]]
    : sideArticles
  return (
    <section className="section home-news-section" id="news">
      <div className="container">
        <div className="home-news-head">
          <div className="section-head"><p className="eyebrow">From the municipality</p><h2>News &amp; updates</h2></div>
          <Link to="/news" className="home-news-all">View all updates <ArrowUpRight size={16} /></Link>
        </div>
        {loading ? <p className="home-news-state" role="status">Loading the latest updates…</p> : error ? <div className="home-news-error" role="status" aria-live="polite"><strong>News is temporarily unavailable</strong><p>We could not load the latest news right now. Please try again in a moment.</p></div> : articles.length ? <div className="home-news-content"><div className="home-news-featured-column">{renderCard(articles[0], true)}{sideArticles.length > 0 && <section className="home-news-secondary" aria-labelledby="more-updates-title"><div className="home-news-secondary-head"><h3 id="more-updates-title">More updates</h3>{sideArticles.length > 1 && <div className="home-news-carousel-controls"><button type="button" className="home-news-nav" onClick={() => moveSide(-1)} aria-label="Previous stories"><ChevronLeft size={17} /></button><button type="button" className="home-news-nav" onClick={() => moveSide(1)} aria-label="Next stories"><ChevronRight size={17} /></button></div>}</div><div className="home-news-secondary-grid" aria-live="polite">{visibleSideArticles.map(article => renderCard(article))}</div>{sideArticles.length > 2 && <div className="home-news-dots" aria-label="News slides">{sideArticles.map((article, index) => <button type="button" className={index === sideIndex % sideArticles.length ? 'active' : ''} onClick={() => setSideIndex(index)} aria-label={`Show news ${index + 1}`} key={article.id} />)}</div>}</section>}</div></div> : <div className="home-news-empty"><Newspaper size={22} /><p>No new municipal announcements are published yet.</p><Link to="/news">Visit News &amp; Updates</Link></div>}

    </div>
    </section>
  )
}
