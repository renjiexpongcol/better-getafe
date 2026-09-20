import { ArrowUpRight, ChevronLeft, ChevronRight, Newspaper } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'

export default function NewsSection() {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [sideIndex, setSideIndex] = useState(0)

  useEffect(() => {
    fetch('/api/news?display=news&homepage=true&limit=3&public=true')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('News unavailable')))
      .then((data) => setArticles(data.items || []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const sideCount = Math.max(0, articles.length - 1)
    if (sideCount < 2) return undefined
    const timer = window.setInterval(() => setSideIndex((current) => (current + 1) % sideCount), 6000)
    return () => window.clearInterval(timer)
  }, [articles.length])

  const renderCard = (article, featured = false) => (
    <article className={featured ? 'home-news-card home-news-card-featured' : 'home-news-card'} key={article.id}>
      <div className="home-news-card-icon">
        {article.featured_image ? <img src={article.featured_image} alt="" /> : <><img src="/assets/Getafe_Bohol_1.jpg" alt="" /><span className="home-news-placeholder-label"><Newspaper size={19} /> Getafe today</span></>}
      </div>
      <div className="home-news-card-body">
        <p className="news-category">{article.category?.name || 'Updates'}</p>
        <h3>{article.title}</h3>
        <p>{article.excerpt}</p>
        <Link to={`/news/${article.slug}`}>Read story <ArrowUpRight size={15} /></Link>
      </div>
    </article>
  )

  const sideArticles = articles.slice(1)
  const moveSide = (direction) => setSideIndex((current) => sideArticles.length ? (current + direction + sideArticles.length) % sideArticles.length : 0)

  return (
    <section className="section home-news-section" id="news">
      <div className="container">
        <div className="home-news-head">
          <div className="section-head">
            <p className="eyebrow">From the municipality</p>
            <h2>News &amp; updates</h2>
          </div>
          <Link to="/news" className="home-news-all">View all updates <ArrowUpRight size={16} /></Link>
        </div>
        {loading ? <p className="home-news-state">Loading the latest updates…</p> : articles.length ? <div className="home-news-grid"><div className="home-news-featured-column">{renderCard(articles[0], true)}</div><div className="home-news-side" aria-live="polite">{sideArticles.length ? <><div className="home-news-carousel-row"><button type="button" className="home-news-nav home-news-nav-prev" onClick={() => moveSide(-1)} aria-label="Previous news"><ChevronLeft size={20} /></button>{renderCard(sideArticles[sideIndex % sideArticles.length])}<button type="button" className="home-news-nav home-news-nav-next" onClick={() => moveSide(1)} aria-label="Next news"><ChevronRight size={20} /></button></div><div className="home-news-dots" aria-label="News slides">{sideArticles.map((article, index) => <button type="button" className={index === sideIndex % sideArticles.length ? 'active' : ''} onClick={() => setSideIndex(index)} aria-label={`Show news ${index + 1}`} key={article.id} />)}</div></> : null}</div></div> : <div className="home-news-empty"><Newspaper size={22} /><p>New municipal announcements will appear here.</p><Link to="/news">Visit News &amp; Updates</Link></div>}
      </div>
    </section>
  )
}
