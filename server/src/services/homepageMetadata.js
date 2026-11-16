const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))

// Sharing crawlers often do not execute the SPA. Supply public metadata in the
// initial HTML using the same centrally configured origin as the sitemap.
export function homepageMetadata(html, siteUrl, settings = {}) {
  const url = new URL(siteUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid public site URL')
  const origin = url.origin
  const name = settings['general.company'] || settings['general.name'] || 'Municipal portal'
  const title = `${name} | Services & Information`
  const description = 'Find Getafe municipal services, requirements, office contacts, public advisories, news, and upcoming events.'
  const organization = { '@context': 'https://schema.org', '@type': 'GovernmentOrganization', name, url: origin + '/', address: { '@type': 'PostalAddress', streetAddress: settings['contact.address'] || undefined } }
  const tags = `\n<link rel="canonical" href="${escape(origin)}/" data-homepage-metadata>\n<meta property="og:title" content="${escape(title)}" data-homepage-metadata>\n<meta property="og:description" content="${escape(description)}" data-homepage-metadata>\n<meta property="og:type" content="website" data-homepage-metadata>\n<meta property="og:url" content="${escape(origin)}/" data-homepage-metadata>\n<meta property="og:image" content="${escape(origin)}/assets/Getafe_Bohol_1.jpg" data-homepage-metadata>\n<meta name="twitter:card" content="summary_large_image" data-homepage-metadata>\n<script type="application/ld+json" data-homepage-metadata>${JSON.stringify(organization).replaceAll('<', '\\u003c')}</script>\n`
  return html.replace('</head>', tags + '</head>')
}
