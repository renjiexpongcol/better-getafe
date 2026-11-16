import { ExternalLink } from 'lucide-react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePublicConfig } from '../context/PublicConfig'

export function getFacebookPageUrl(settings = {}) {
  const rawCandidate = import.meta.env.VITE_GETAFE_FACEBOOK_URL || settings['general.facebookUrl'] || ''
  const candidate = String(rawCandidate).trim().replace(/^(?:"|')|(?:"|')$/g, '')
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol) || !/(^|\.)facebook\.com$/i.test(url.hostname)) return ''
    url.hostname = 'www.facebook.com'
    return url.href
  } catch {
    return ''
  }
}

function FacebookFallbackCard() {
  return <div className="facebook-page-feed-native-fallback">
    <span className="facebook-mark" aria-hidden="true">f</span>
    <strong>Municipality of Getafe</strong>
    <p>Follow official announcements, community updates, events, advisories, and municipal information on our Facebook page.</p>
  </div>
}

const FacebookPageFeed = memo(function FacebookPageFeed({ pageUrl: configuredUrl }) {
  const settings = usePublicConfig()
  const configuredFacebookUrl = configuredUrl || settings['general.facebookUrl'] || ''
  const embedMode = settings['general.facebookEmbedMode'] === 'fallback' ? 'fallback' : 'embed'
  const pageUrl = useMemo(() => getFacebookPageUrl({ 'general.facebookUrl': configuredFacebookUrl }), [configuredFacebookUrl])
  const embedRef = useRef(null)
  const [embedWidth, setEmbedWidth] = useState(0)
  const [embedHeight, setEmbedHeight] = useState(0)
  useLayoutEffect(() => {
    const element = embedRef.current
    if (!element) return undefined

    const measure = () => {
      // The timeout message sizes itself. Measure the plugin again after retry.
      if (element.dataset.embedStatus === 'failed') return
      const bounds = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const nextWidth = Math.min(500, Math.floor(bounds.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth)))
      const nextHeight = Math.floor(bounds.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth))
      setEmbedWidth(currentWidth => currentWidth === nextWidth ? currentWidth : nextWidth)
      setEmbedHeight(currentHeight => currentHeight === nextHeight ? currentHeight : nextHeight)
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(element)
    measure()
    return () => observer?.disconnect()
  }, [embedMode, pageUrl])

  const iframeSrc = useMemo(() => {
    if (!pageUrl || embedMode === 'fallback' || embedWidth < 180 || embedHeight < 70) return ''
    // Short article cards only have room for the plugin's compact page header.
    // Keep Follow Page available rather than clipping a full timeline/cover.
    const compact = embedHeight < 180
    const params = new URLSearchParams({ href: pageUrl, tabs: compact ? '' : 'timeline', width: String(embedWidth), height: String(embedHeight), small_header: String(embedHeight < 130), adapt_container_width: 'true', hide_cover: String(compact), show_facepile: String(!compact) })
    return `https://www.facebook.com/plugins/page.php?${params.toString()}`
  }, [embedHeight, embedMode, embedWidth, pageUrl])
  const [status, setStatus] = useState('loading')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    setStatus('loading')
    setRetry(0)
  }, [iframeSrc])

  useEffect(() => {
    if (!iframeSrc || status !== 'loading') return undefined
    const timeout = window.setTimeout(() => setStatus('failed'), 15000)
    return () => window.clearTimeout(timeout)
  }, [iframeSrc, retry, status])

  if (!pageUrl) return null

  const panelClass = `facebook-page-feed${embedHeight > 0 && embedHeight < 180 ? ' facebook-page-feed-compact' : ''}`

  return (
    <aside className={panelClass} data-embed-mode={embedMode} aria-labelledby="facebook-feed-title">
      <div className="facebook-page-feed-heading">
        <p className="eyebrow">Stay connected</p>
        <h2 id="facebook-feed-title">Follow Getafe</h2>
        <p>Official announcements and community updates from the Municipality of Getafe.</p>
      </div>
      <div className="facebook-page-feed-embed" data-embed-status={status} ref={embedRef}>
        {iframeSrc && status === 'loading' && <div className="facebook-page-feed-placeholder" aria-hidden="true"><span className="facebook-mark">f</span><span>Loading official Facebook updates…</span></div>}
        {embedMode === 'fallback' || !iframeSrc ? <FacebookFallbackCard /> : status === 'failed' ? <div className="facebook-page-feed-fallback"><span className="facebook-mark" aria-hidden="true">f</span><p>Facebook updates are temporarily unavailable.</p><button type="button" className="facebook-page-feed-retry" onClick={() => { setStatus('loading'); setRetry(value => value + 1) }}>Try again</button></div> : <iframe key={`${iframeSrc}:${retry}`} title="Municipality of Getafe Facebook Feed" src={iframeSrc} width={embedWidth} height={embedHeight} scrolling="no" frameBorder="0" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" onLoad={() => setStatus('loaded')} onError={() => setStatus('failed')}/>}
      </div>
      <a className="facebook-page-feed-link" href={pageUrl} target="_blank" rel="noopener noreferrer">View on Facebook <ExternalLink size={15} aria-hidden="true" /></a>
    </aside>
  )
})

export default FacebookPageFeed
