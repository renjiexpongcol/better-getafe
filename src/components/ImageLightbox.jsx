import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import './ImageLightbox.css'

const FOCUSABLE_SELECTOR = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const FILENAME_PATTERN = /(?:^|[\\/])[^\\/]+\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i

function readableMetadata(value) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  return text && !FILENAME_PATTERN.test(text) ? text : ''
}

export default function ImageLightbox({ images, currentIndex, articleTitle, onClose, onPrevious, onNext, returnFocusTo }) {
  const dialog = useRef(null)
  const closeButton = useRef(null)
  const titleId = useId()
  const captionId = useId()
  const image = images[currentIndex] || images[0]
  const multi = images.length > 1
  const imageAlt = readableMetadata(image?.alt) || readableMetadata(articleTitle) || 'Article image'
  const altDescription = readableMetadata(image?.alt)
  const caption = readableMetadata(image?.caption) || readableMetadata(image?.description) || (altDescription !== articleTitle ? altDescription : '')
  const credit = readableMetadata(image?.photographer) || readableMetadata(image?.credit) || readableMetadata(image?.source)
  const hasFooter = Boolean(caption || credit || multi)

  useEffect(() => {
    const appRoot = document.getElementById('root')
    const rootStyle = document.documentElement.style
    const bodyStyle = document.body.style
    const previousRootOverflow = rootStyle.overflow
    const previousBodyOverflow = bodyStyle.overflow
    const previousBodyPaddingRight = bodyStyle.paddingRight
    const previousInert = appRoot?.inert ?? false
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    rootStyle.overflow = 'hidden'
    bodyStyle.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      const currentPadding = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0
      bodyStyle.paddingRight = `${currentPadding + scrollbarWidth}px`
    }
    closeButton.current?.focus({ preventScroll: true })
    if (appRoot) {
      appRoot.inert = true
      appRoot.setAttribute('aria-hidden', 'true')
    }

    const keepFocusInDialog = event => {
      if (!dialog.current?.contains(event.target)) closeButton.current?.focus({ preventScroll: true })
    }
    document.addEventListener('focusin', keepFocusInDialog, true)

    return () => {
      document.removeEventListener('focusin', keepFocusInDialog, true)
      rootStyle.overflow = previousRootOverflow
      bodyStyle.overflow = previousBodyOverflow
      bodyStyle.paddingRight = previousBodyPaddingRight
      if (appRoot) {
        appRoot.inert = previousInert
        if (previousAriaHidden === null) appRoot.removeAttribute('aria-hidden')
        else appRoot.setAttribute('aria-hidden', previousAriaHidden)
      }
      if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true })
    }
  }, [returnFocusTo])

  if (!image || typeof document === 'undefined') return null

  const close = () => {
    onClose()
  }

  const closeFromBackground = event => {
    const target = event.target
    if (target === event.currentTarget || (target instanceof Element && target.closest('.article-gallery-lightbox-stage') && !target.closest('button, img'))) close()
  }

  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (multi && event.key === 'ArrowLeft') {
      event.preventDefault()
      onPrevious()
      return
    }
    if (multi && event.key === 'ArrowRight') {
      event.preventDefault()
      onNext()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = [...(dialog.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])]
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return

    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const modal = <div className="article-gallery-lightbox-backdrop" onClick={event => { if (event.target === event.currentTarget) close() }}>
    <section
      ref={dialog}
      className="article-gallery-lightbox"
      role="dialog"
      aria-modal="true"
      aria-labelledby={articleTitle ? titleId : undefined}
      aria-describedby={hasFooter ? captionId : undefined}
      aria-label={articleTitle ? undefined : 'Article image preview'}
      onClick={closeFromBackground}
      onKeyDown={handleKeyDown}
    >
      <header className="article-gallery-lightbox-header">
        <div className="article-gallery-lightbox-context">
          <p>News &amp; Updates</p>
          {articleTitle && <h2 id={titleId}>{articleTitle}</h2>}
        </div>
        <button ref={closeButton} type="button" className="article-gallery-close" aria-label="Close image preview" onClick={close}>
          <X size={21} aria-hidden="true" />
        </button>
      </header>
      <figure className="article-gallery-lightbox-figure">
        <div className="article-gallery-lightbox-stage">
          {multi && <button type="button" className="article-gallery-arrow previous" aria-label="Previous image" onClick={onPrevious}><ChevronLeft size={24} aria-hidden="true" /></button>}
          <img className="article-gallery-lightbox-image" src={image.url} alt={imageAlt} />
          {multi && <button type="button" className="article-gallery-arrow next" aria-label="Next image" onClick={onNext}><ChevronRight size={24} aria-hidden="true" /></button>}
        </div>
        {hasFooter && <figcaption className="article-gallery-lightbox-caption" id={captionId}>
          <span className="article-gallery-lightbox-caption-copy">
            {caption && <span>{caption}</span>}
            {credit && <small>{credit}</small>}
          </span>
          {multi && <span className="article-gallery-lightbox-count" aria-live="polite">Image {currentIndex + 1} of {images.length}</span>}
        </figcaption>}
      </figure>
    </section>
  </div>

  return createPortal(modal, document.body)
}
