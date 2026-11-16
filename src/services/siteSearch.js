export const normalizeSearchTerm = value => String(value || '').trim().replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').toLocaleLowerCase('en-US')

export function resolveSearchTopic(query, suggestions) {
  const normalizedQuery = normalizeSearchTerm(query)
  return (suggestions?.terms || []).find(item => item.normalizedTerm === normalizedQuery) || null
}

export function createSearchSubmissionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export function makeSearchSubmission(query, suggestions, source = 'typed') {
  const topic = resolveSearchTopic(query, suggestions)
  return {
    query: topic?.canonicalQuery || String(query || '').trim().replace(/\s+/g, ' '),
    submission: { submissionId: createSearchSubmissionId(), topicId: topic?.topicId || null, source },
  }
}

export function searchResultsPath(query) {
  const params = new URLSearchParams()
  params.set('q', String(query || '').trim().replace(/\s+/g, ' '))
  return `/search?${params.toString()}`
}
