import sanitizeHtml from 'sanitize-html'

const options = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 's', 'blockquote', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'a', 'img', 'hr'],
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'width', 'height'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
}

export const sanitizeRichText = value => sanitizeHtml(String(value || ''), options)

export function sanitizeOfficials(value) {
  if (!value || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (typeof item !== 'string') return item
    return /(?:bio|details|description|content|message|note)/i.test(key) ? sanitizeRichText(item) : item
  }))
}

export function sanitizeBarangays(value) {
  if (!Array.isArray(value)) return value
  return value.map(item => ({ ...item, details: sanitizeRichText(item?.details), captainDetails: sanitizeRichText(item?.captainDetails) }))
}
