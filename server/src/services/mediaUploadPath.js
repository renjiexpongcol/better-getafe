const isUuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)

export function isMediaUploadPath(storagePath, prefix = 'media') {
  const prefixParts = String(prefix || '').split('/')
  const pathParts = String(storagePath || '').split('/')
  if (!prefixParts.length || prefixParts.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) return false
  if (pathParts.length !== prefixParts.length + 3) return false
  if (!prefixParts.every((part, index) => pathParts[index] === part)) return false
  if (!/^\d{4}$/.test(pathParts[prefixParts.length]) || !/^(0[1-9]|1[0-2])$/.test(pathParts[prefixParts.length + 1])) return false
  const [filename, extension, ...extra] = pathParts.at(-1).split('.')
  return extra.length === 0 && isUuid(filename) && ['jpg', 'png', 'webp'].includes(extension)
}
