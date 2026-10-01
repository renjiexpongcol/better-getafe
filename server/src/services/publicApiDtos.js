import { sanitizeRichText } from './sanitizeHtml.js'

const text = (value, max = 4000) => typeof value === 'string' ? value.slice(0, max) : ''

const publicUrl = value => {
  if (typeof value !== 'string' || !value.trim()) return ''
  const candidate = value.trim()
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate
  try {
    const parsed = new URL(candidate)
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : ''
  } catch {
    return ''
  }
}

const numberOrNull = value => Number.isFinite(Number(value)) ? Number(value) : null

export function toPublicCategory(category) {
  if (!category || typeof category !== 'object') return null
  return {
    id: category.id,
    name: text(category.name, 160),
    slug: text(category.slug, 160),
  }
}

export function toPublicPopularService(service) {
  if (!service || typeof service !== 'object') return null
  const id = text(service.id, 120)
  const label = text(service.label, 160)
  const href = typeof service.href === 'string' ? service.href.trim() : ''
  if (!id || !label || !href.startsWith('/') || href.startsWith('//')) return null
  return { id, label, href }
}

function toPublicGalleryImage(image) {
  if (!image || typeof image !== 'object') return null
  const url = publicUrl(image.url || image.thumbnail_url)
  if (!url) return null
  return {
    url,
    ...(publicUrl(image.thumbnail_url) ? { thumbnail_url: publicUrl(image.thumbnail_url) } : {}),
    alt: text(image.alt, 255),
    caption: text(image.caption, 1000),
    position: Number.isInteger(image.position) ? image.position : 0,
  }
}

export function toPublicNews(article) {
  if (!article || typeof article !== 'object') return null
  return {
    id: article.id,
    title: text(article.title, 300),
    slug: text(article.slug, 200),
    excerpt: text(article.excerpt, 1000),
    content: sanitizeRichText(article.content),
    featured_image: publicUrl(article.featured_image),
    gallery_images: (Array.isArray(article.gallery_images) ? article.gallery_images : [])
      .map(toPublicGalleryImage)
      .filter(Boolean),
    category: toPublicCategory(article.category),
    author: article.author?.name ? { name: text(article.author.name, 160) } : null,
    content_type: ['news', 'event', 'meeting'].includes(article.content_type) ? article.content_type : 'news',
    event_start_at: article.event_start_at || null,
    event_end_at: article.event_end_at || null,
    published_at: article.published_at || null,
    is_important: Boolean(article.is_important),
    show_in_news: Boolean(article.show_in_news),
    show_in_upcoming: Boolean(article.show_in_upcoming),
    show_in_events: Boolean(article.show_in_events),
    show_on_homepage: Boolean(article.show_on_homepage),
  }
}

export function toPublicLegacyOfficial(person) {
  if (!person || typeof person !== 'object') return null
  const slug = text(person.official_slug || person.slug, 200)
  return {
    name: text(person.name, 200),
    role: text(person.role || person.position?.name, 200),
    slug,
    biography: sanitizeRichText(person.biography),
    photo: publicUrl(person.photo),
    position_slug: text(person.position_slug || person.position?.slug, 160),
    termStart: person.termStart || null,
    termEnd: person.termEnd || null,
    serviceStart: person.serviceStart || null,
    serviceEnd: person.serviceEnd || null,
    termStatus: ['current', 'previous', 'future', 'unknown'].includes(person.termStatus) ? person.termStatus : 'unknown',
    electionYear: Number.isInteger(person.electionYear) ? person.electionYear : null,
    election: toPublicElection(person.election),
  }
}

function toPublicElection(election) {
  if (!election || typeof election !== 'object') return null
  return {
    year: Number.isInteger(election.year) ? election.year : null,
    type: text(election.type, 100),
    party: text(election.party, 160),
    votes: Number.isInteger(election.votes) ? election.votes : null,
    vote_link: publicUrl(election.vote_link),
    result: election.result === 'winner' ? 'winner' : null,
  }
}

export function toPublicOfficials(content) {
  if (!content || typeof content !== 'object') return {}
  const groups = ['mayor', 'viceMayor', 'abcPresident', 'sbMembers', 'punongBarangays', 'deptHeads']
  const result = {}
  for (const group of groups) {
    if (Array.isArray(content[group])) result[group] = content[group].map(toPublicLegacyOfficial).filter(Boolean)
    else if (content[group]) result[group] = toPublicLegacyOfficial(content[group])
  }
  if (content.directory && typeof content.directory === 'object') result.directory = toPublicOfficialsDirectory(content.directory)
  return result
}

function publicOfficialKey(official) {
  return [official.slug, official.position?.slug, official.term?.start, official.term?.end]
    .filter(Boolean)
    .join(':')
    .slice(0, 500)
}

function toPublicDirectoryOfficial(official) {
  if (!official || typeof official !== 'object') return null
  const positionSlug = text(official.position?.slug, 160)
  const slug = text(official.slug, 200)
  return {
    publicKey: publicOfficialKey(official),
    personSlug: slug,
    slug,
    name: text(official.name, 200),
    biography: sanitizeRichText(official.biography),
    photo: publicUrl(official.photo),
    role: text(official.role || official.position?.name, 200),
    position: {
      name: text(official.position?.name, 200),
      slug: positionSlug,
      cardinality: ['single', 'multiple'].includes(official.position?.cardinality) ? official.position.cardinality : 'single',
    },
    jurisdiction: {
      type: ['municipal', 'barangay'].includes(official.jurisdiction?.type) ? official.jurisdiction.type : 'municipal',
      id: text(official.jurisdiction?.id, 160) || null,
    },
    term: {
      start: official.term?.start || null,
      end: official.term?.end || null,
      status: ['current', 'previous', 'future', 'unknown'].includes(official.term?.status) ? official.term.status : 'unknown',
      assumption_type: text(official.term?.assumption_type, 100) || 'unknown',
      ...(official.term?.service ? { service: { start: official.term.service.start || null, end: official.term.service.end || null } } : {}),
    },
    election: toPublicElection(official.election),
  }
}

export function toPublicOfficialsDirectory(directory) {
  return {
    items: (Array.isArray(directory.items) ? directory.items : []).map(toPublicDirectoryOfficial).filter(Boolean),
    available: directory.available !== false,
    meta: { election_data: directory.meta?.election_data ? {
      provider: text(directory.meta.election_data.provider, 160),
      data_vintage: text(directory.meta.election_data.data_vintage, 80) || null,
    } : null },
  }
}

export function toPublicBarangay(item) {
  if (!item || typeof item !== 'object') return null
  const latitude = numberOrNull(item.coords?.lat ?? item.latitude)
  const longitude = numberOrNull(item.coords?.lng ?? item.longitude)
  return {
    id: text(item.id || item.slug || item.name, 160),
    slug: text(item.slug || item.id || item.name, 160),
    name: text(item.name, 160),
    population: Number.isFinite(Number(item.population)) ? Number(item.population) : null,
    captain: text(item.captain || item.punong_barangay, 200),
    coords: latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null,
    latitude,
    longitude,
    description: text(item.description, 4000),
    more_information: sanitizeRichText(item.more_information),
    cover_image: publicUrl(item.cover_image),
    cover_image_alt: text(item.cover_image_alt, 255),
    lastUpdated: text(item.lastUpdated, 100),
    termStart: item.termStart || null,
    termEnd: item.termEnd || null,
    captainBio: text(item.captainBio, 4000),
    captainDetails: sanitizeRichText(item.captainDetails),
    captainPhoto: publicUrl(item.captainPhoto),
  }
}

export function toPublicBarangays(items) {
  return (Array.isArray(items) ? items : []).map(toPublicBarangay).filter(Boolean)
}
