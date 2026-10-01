import { useLayoutEffect, useRef, useState } from 'react'
import { usePublicConfig } from '../context/PublicConfig'
import FacebookPageFeed, { getFacebookPageUrl } from './FacebookPageFeed'
import NewsSection from './NewsSection'

export default function MunicipalityUpdatesSection() {
  const settings = usePublicConfig()
  const facebookUrl = getFacebookPageUrl(settings)
  const newsRef = useRef(null)
  const [facebookPanelHeight, setFacebookPanelHeight] = useState(0)

  useLayoutEffect(() => {
    if (!facebookUrl) return undefined

    const syncPanelHeight = () => {
      if (window.innerWidth < 1100) {
        setFacebookPanelHeight(0)
        return
      }

      const news = newsRef.current?.querySelector('.home-news-secondary-grid')
      const feed = document.querySelector('.facebook-page-feed')
      if (!news || !feed) {
        setFacebookPanelHeight(0)
        return
      }

      const targetHeight = Math.round(news.getBoundingClientRect().bottom - feed.getBoundingClientRect().top)
      setFacebookPanelHeight(current => current === targetHeight ? current : Math.max(0, targetHeight))
    }

    syncPanelHeight()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(syncPanelHeight) : null
    if (newsRef.current) observer?.observe(newsRef.current)
    window.addEventListener('resize', syncPanelHeight)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', syncPanelHeight)
    }
  }, [facebookUrl])

  return (
    <section className={`section municipality-updates-section${facebookUrl ? ' has-facebook-feed' : ''}`} aria-label="Latest from the Municipality">
      <div className="municipality-updates-inner">
        <div className="municipality-updates-news" ref={newsRef}><NewsSection /></div>
        {facebookUrl && <FacebookPageFeed pageUrl={facebookUrl} maxHeight={facebookPanelHeight} />}
      </div>
    </section>
  )
}
