import { usePublicConfig } from '../context/PublicConfig'
import FacebookPageFeed, { getFacebookPageUrl } from './FacebookPageFeed'
import NewsSection from './NewsSection'
import HomeSectionBoundary from './HomeSectionBoundary'

export default function MunicipalityUpdatesSection() {
  const settings = usePublicConfig()
  const facebookUrl = getFacebookPageUrl(settings)
  return <section className={`section municipality-updates-section${facebookUrl ? ' has-facebook-feed' : ''}`} aria-label="Latest from the Municipality"><div className="municipality-updates-inner">
    <div className="municipality-updates-news"><HomeSectionBoundary title="News & updates" to="/news"><NewsSection /></HomeSectionBoundary></div>
    {facebookUrl && <HomeSectionBoundary title="Follow Getafe" to="/news"><FacebookPageFeed pageUrl={facebookUrl} /></HomeSectionBoundary>}
  </div></section>
}
