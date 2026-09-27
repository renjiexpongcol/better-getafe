import { useEffect, useState } from 'react'

const failedSources = new Map()
const FAILURE_COOLDOWN_MS = 30_000

export default function StableAvatar({ src, initials, alt = '', className = '', imageClassName = '', onFailure }) {
  const [failedSource, setFailedSource] = useState('')
  const source = typeof src === 'string' ? src : ''
  const failed = Boolean(source && (failedSource === source || (failedSources.get(source) || 0) > Date.now()))

  useEffect(() => {
    setFailedSource(current => current === source ? current : '')
  }, [source])

  if (!source || failed) return <span className={className} aria-label={alt || undefined}>{initials}</span>
  return <img className={imageClassName || className} src={source} alt={alt} onError={() => { failedSources.set(source, Date.now() + FAILURE_COOLDOWN_MS); setFailedSource(source); onFailure?.() }} />
}
