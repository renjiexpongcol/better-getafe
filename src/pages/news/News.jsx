import NewsSection from '../../components/NewsSection'

export default function News() {
  return (
    <main id="news-page">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <h1 className="page-title">News & Updates</h1>
            <p className="page-subtitle">Latest announcements and information from the Municipality of Getafe</p>
          </div>
        </div>
      </div>
      <NewsSection />
    </main>
  )
}
