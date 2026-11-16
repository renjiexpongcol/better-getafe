import { apiFetch, requestJson } from './apiTransport.js'

const post = (path, body) => requestJson(path, {
  method: 'POST', body: JSON.stringify(body), errorContext: 'form',
})
const uploadErrors = {
  400: 'The upload link is invalid. Select the image again to start a new upload.',
  401: 'Your session expired. Sign in again and retry the upload.',
  403: 'The upload was denied or expired. Select the image again to retry.',
  413: 'The image exceeds the upload size limit.',
  415: 'Select a JPG, PNG, or WebP image.',
  422: 'The file could not be validated as a supported image.',
  502: 'Media storage could not receive the image. Try again shortly.',
}

export async function uploadMediaImage(file, { context = 'media', folder } = {}) {
  try {
    const grant = await post('/api/storage/upload-url', {
      filename: file.name, contentType: file.type, fileSize: file.size, context,
      ...(folder ? { folder } : {}),
    })
    if (grant.reused) return grant.media
    const url = new URL(grant.uploadUrl, window.location.origin)
    const options = { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }
    const result = url.origin === window.location.origin
      ? await apiFetch(url.pathname + url.search, options)
      : await fetch(url, { ...options, credentials: 'omit' })
    if (!result.ok) {
      const error = await result.json().catch(() => null)
      const referenceId = error?.error?.referenceId || error?.referenceId
      const reference = typeof referenceId === 'string' && /^ERR-[A-Z0-9-]{1,32}$/i.test(referenceId)
        ? ` Reference ${referenceId}.`
        : ''
      const message = uploadErrors[result.status] || 'The server could not finish uploading the image. Try again.'
      const retryAfter = Number(result.headers.get('Retry-After')) || Number(error?.retryAfter) || Number(error?.error?.retryAfter) || 0
      const code = error?.error || error?.code
      throw Object.assign(new Error(message + reference), { code, retryAfter })
    }
    return await post('/api/media/complete', { storagePath: grant.storagePath })
  } catch (error) {
    if (error.code === 'MEDIA_WRITES_PAUSED') throw new Error('Media uploads are paused during storage migration. Check the cutover status in Settings → Storage.')
    if (error.code === 'rate_limited' || error.code === 'temporarily_blocked') {
      const seconds = Math.min(300, Math.max(1, Number(error.retryAfter) || 1))
      throw Object.assign(new Error(error.code === 'temporarily_blocked'
        ? `The server temporarily paused uploads. Wait ${seconds} seconds before uploading the remaining images.`
        : `The upload limit was reached. Wait ${seconds} seconds before uploading the remaining images.`), { code: error.code, retryAfter: seconds })
    }
    throw error
  }
}
