import { ExternalLink } from 'lucide-react'

const facebookUrl = 'https://www.facebook.com/profile.php?id=61577786097184'

function FacebookEmbed() {
  return <div className="lgu-facebook-embed" role="group" aria-label="LGU Getafe Facebook updates">
    <div className="lgu-facebook-card">
      <span className="facebook-mark" aria-hidden="true">f</span>
      <p className="lgu-facebook-card-eyebrow">Official Facebook page</p>
      <h3>Get the latest announcements from LGU Getafe</h3>
      <p className="lgu-facebook-card-copy">Open the official page to view current posts, notices, and community updates.</p>
      <a href={facebookUrl} target="_blank" rel="noreferrer">Open LGU Getafe on Facebook <ExternalLink size={15} aria-hidden="true" /></a>
    </div>
  </div>
}

export default function LguUpdatesFeed({ compact = false }) {
  if (compact) return <aside className="lgu-updates-compact" aria-label="Latest from LGU Getafe on Facebook"><FacebookEmbed /></aside>
  return <section className="section lgu-updates-section" aria-labelledby="lgu-updates-title">
    <div className="container lgu-updates-layout">
      <div className="lgu-updates-intro">
        <p className="eyebrow">Community bulletin · Live</p>
        <h2 id="lgu-updates-title">Latest from LGU Getafe</h2>
        <p>Official announcements and community updates, posted directly by the LGU.</p>
        <a className="lgu-facebook-link" href={facebookUrl} target="_blank" rel="noreferrer"><span className="facebook-mark" aria-hidden="true">f</span> Open LGU Getafe on Facebook <ExternalLink size={15} aria-hidden="true" /></a>
      </div>
      <FacebookEmbed />
    </div>
  </section>
}
