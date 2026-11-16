import sanitizeHtml from 'sanitize-html'

const options = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 's', 'blockquote', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'a', 'img', 'hr'],
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'width', 'height', 'data-news-media'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
}

export const sanitizeRichText = value => sanitizeHtml(String(value || ''), options)

export function inlineNewsMediaIds(content) {
  const ids = new Set()
  sanitizeHtml(String(content || ''), {
    ...options,
    transformTags: { img(tagName, attribs) {
      const id = attribs['data-news-media']
      if (/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id || '')) ids.add(id)
      return { tagName, attribs }
    } },
  })
  return [...ids]
}

export function renderNewsMedia(content, urls) {
  return sanitizeHtml(content, {
    ...options,
    transformTags: { ...options.transformTags, img(tagName, attribs) {
      if (!Object.hasOwn(attribs, 'data-news-media')) return { tagName, attribs }
      const { 'data-news-media': id, src: _src, ...rest } = attribs
      const src = urls.get(id)
      return { tagName, attribs: src ? { ...rest, src } : rest }
    } },
    exclusiveFilter: frame => frame.tag === 'img' && !frame.attribs.src,
  })
}

export function sanitizeOfficials(value) {
  if (!value || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (typeof item !== 'string') return item
    return /(?:bio|details|description|content|message|note)/i.test(key) ? sanitizeRichText(item) : item
  }))
}

export function sanitizeBarangays(value) {
  if (!Array.isArray(value)) return value
  return value.map(item => {
    const { cover_image_preview: _preview, details: legacyDetails, ...record } = item || {}
    const coverImage = typeof record.cover_image === 'string' ? record.cover_image.trim() : ''
    const safeCoverImage = /^(?:https?:\/\/[^"'<>\s]+|\/(?!\/)[^"'<>\s]*|media\/[a-zA-Z0-9_\/-]+\.(?:jpg|png|webp))$/i.test(coverImage) ? coverImage : ''
    return {
      ...record,
      more_information: sanitizeRichText(record.more_information ?? legacyDetails),
      cover_image: safeCoverImage,
      cover_image_alt: typeof record.cover_image_alt === 'string' ? record.cover_image_alt.trim().slice(0, 255) : '',
      captainDetails: sanitizeRichText(record.captainDetails),
    }
  })
}
