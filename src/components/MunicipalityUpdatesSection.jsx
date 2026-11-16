import { usePublicConfig } from '../context/PublicConfig'
import FacebookPageFeed, { getFacebookPageUrl } from './FacebookPageFeed'
import NewsSection from './NewsSection'

export default function MunicipalityUpdatesSection() {
  const settings = usePublicConfig()
  const facebookUrl = getFacebookPageUrl(settings)
  return (
    <section className={`section municipality-updates-section${facebookUrl ? ' has-facebook-feed' : ''}`} aria-label="Latest from the Municipality">
      <div className="municipality-updates-inner">
        <div className="municipality-updates-news"><NewsSection socialCard={facebookUrl ? <FacebookPageFeed pageUrl={facebookUrl} /> : null} /></div>
      </div>
    </section>
  )
}
