import { ArrowUpRight, ChevronLeft, ChevronRight, Newspaper } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { publicApi } from '../services/apiClient'

export default function NewsSection({ socialCard = null }) {
  const pageSize = 100
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry] = useState(0)
  const [sidePage, setSidePage] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError('')
    const loadAllHomepageNews = async () => {
      const fetchPage = page => {
        const query = new URLSearchParams({ display: 'news', homepage: 'true', public: 'true', page: String(page), limit: String(pageSize) })
        return publicApi('/news?' + query)
      }

      try {
        const firstPage = await fetchPage(1)
        const pageCount = Math.max(1, Number(firstPage.pages) || 1)
        const remainingPages = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => fetchPage(index + 2)))
        setArticles([...(firstPage.items || []), ...remainingPages.flatMap(page => page.items || [])])
        setSidePage(0)
      } catch {
        setArticles([])
        setError('The latest updates are temporarily unavailable.')
      } finally {
        setLoading(false)
      }
    }

    loadAllHomepageNews()
    return undefined
  }, [pageSize, retry])

  const renderCard = (article, featured = false) => (
    <article className={featured ? 'home-news-card home-news-card-featured' : 'home-news-card home-news-card-secondary'} key={article.id}>
      <div className="home-news-card-icon">
        {article.featured_image ? <img src={article.featured_image} alt={article.title || 'Municipal update'} loading={featured ? 'eager' : 'lazy'} decoding="async" /> : <><img src="/assets/Getafe_Bohol_1.jpg" alt="Getafe municipal updates" loading={featured ? 'eager' : 'lazy'} decoding="async" /><span className="home-news-placeholder-label"><Newspaper size={19} /> Getafe today</span></>}
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
  const sidePageSize = 2
  const sidePageCount = Math.ceil(sideArticles.length / sidePageSize)
  const visibleSideArticles = sideArticles.slice(sidePage * sidePageSize, (sidePage + 1) * sidePageSize)
  const moveSide = direction => setSidePage(current => (current + direction + sidePageCount) % sidePageCount)
  const secondaryContent = sideArticles.length > 0 && (
    <section className="home-news-secondary" aria-labelledby="more-updates-title">
      <div className="home-news-secondary-head">
        <h3 id="more-updates-title">More updates</h3>
        {sidePageCount > 1 && <div className="home-news-carousel-controls">
          <button type="button" className="home-news-nav" onClick={() => moveSide(-1)} aria-label="Previous updates" data-icon-button="ghost"><ChevronLeft size={17} /></button>
          <button type="button" className="home-news-nav" onClick={() => moveSide(1)} aria-label="Next updates" data-icon-button="ghost"><ChevronRight size={17} /></button>
        </div>}
      </div>
      <div className="home-news-secondary-grid" aria-live="polite">
        {visibleSideArticles.map(article => renderCard(article))}
      </div>
      {sidePageCount > 1 && <div className="home-news-dots" aria-label="News update pages">
        {Array.from({ length: sidePageCount }, (_, index) => <button type="button" className={index === sidePage ? 'active' : ''} onClick={() => setSidePage(index)} aria-label={`Show updates page ${index + 1}`} aria-current={index === sidePage ? 'page' : undefined} key={index} />)}
      </div>}
    </section>
  )

  return (
    <section className="section home-news-section" id="news">
      <div className="container">
        <div className="home-news-head">
          <div className="section-head"><p className="eyebrow">From the municipality</p><h2>News &amp; updates</h2></div>
          <Link to="/news" className="home-news-all">View all updates <ArrowUpRight size={16} /></Link>
        </div>
        <div className={`home-news-content${socialCard ? ' has-social-card' : ''}`}>
          <div className="home-news-featured-column">
            {loading ? <p className="home-news-state" role="status">Loading the latest updates…</p>
              : error ? <div className="home-news-error" role="status" aria-live="polite"><strong>News is temporarily unavailable</strong><p>We could not load the latest news right now. Please try again in a moment.</p></div>
              : articles.length ? <>{renderCard(articles[0], true)}{secondaryContent}</>
              : <div className="home-news-empty"><Newspaper size={22} /><p>No new municipal announcements are published yet.</p><Link to="/news">Visit News &amp; Updates</Link></div>}
          </div>
          {socialCard}
        </div>
      </div>
    </section>
  )
}
