import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import ImageLightbox from './ImageLightbox'
import './ArticleGallery.css'

const MAX_VISIBLE_DOTS = 8

export default function ArticleGallery({ article }) {
  const gallery = (Array.isArray(article.gallery_images) ? article.gallery_images : [])
    .filter(image => image?.url || image?.storage_path)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  if (article.featured_image && !gallery.some(image => (image.storage_path || image.url) === (article.featured_image_path || article.featured_image))) {
    gallery.unshift({ url: article.featured_image, storage_path: article.featured_image_path, alt: article.title, position: -1 })
  }

  const images = gallery.map(image => ({
    ...image,
    url: image.url || image.storage_path,
    alt: image.alt || article.title || 'Article image',
  }))
  const [index, setIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const touchStart = useRef(null)
  const openButton = useRef(null)
  const multi = images.length > 1
  const move = offset => setIndex(current => (current + offset + images.length) % images.length)
  const dotStart = Math.min(Math.max(0, index - MAX_VISIBLE_DOTS + 1), Math.max(0, images.length - MAX_VISIBLE_DOTS))
  const visibleDots = images.slice(dotStart, dotStart + MAX_VISIBLE_DOTS)

  if (!images.length) return null
  const image = images[index] || images[0]

  return <>
    <section
      className="article-gallery"
      aria-label="Article images"
      onTouchStart={event => { touchStart.current = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY } }}
      onTouchEnd={event => {
        if (!multi || !touchStart.current) return
        const dx = event.changedTouches[0].clientX - touchStart.current.x
        const dy = event.changedTouches[0].clientY - touchStart.current.y
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.25) move(dx < 0 ? 1 : -1)
        touchStart.current = null
      }}
    >
      <div className="article-gallery-stage">
        {multi && <button type="button" className="article-gallery-arrow previous" aria-label="Previous image" onClick={() => move(-1)}><ChevronLeft size={24} aria-hidden="true" /></button>}
        <button
          ref={openButton}
          type="button"
          className="article-gallery-open"
          aria-haspopup="dialog"
          aria-expanded={lightboxOpen}
          aria-label={`Open image ${index + 1} in larger view`}
          onClick={event => { openButton.current = event.currentTarget; setLightboxOpen(true) }}
        >
          <img src={image.url} alt={image.alt} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" />
        </button>
        {multi && <button type="button" className="article-gallery-arrow next" aria-label="Next image" onClick={() => move(1)}><ChevronRight size={24} aria-hidden="true" /></button>}
        {multi && <span className="article-gallery-count" aria-live="polite">{index + 1} / {images.length}</span>}
      </div>
      {image.caption && <p className="article-gallery-caption">{image.caption}</p>}
      {multi && <>
        <div className="article-gallery-dots" aria-label="Choose image">
          {visibleDots.map((item, dot) => {
            const imageIndex = dotStart + dot
            return <button key={`${item.id || item.storage_path}-${imageIndex}`} type="button" aria-label={`Show image ${imageIndex + 1}`} aria-current={index === imageIndex ? 'true' : undefined} onClick={() => setIndex(imageIndex)} />
          })}
        </div>
        <div className="article-gallery-thumbnails" aria-label="Article image thumbnails">
          {images.map((item, thumb) => <button key={`${item.id || item.storage_path}-thumb-${thumb}`} type="button" aria-label={`View image ${thumb + 1} of ${images.length}: ${item.alt}`} aria-current={index === thumb ? 'true' : undefined} onClick={() => setIndex(thumb)}><img src={item.thumbnail_url || item.url} alt="" loading="lazy" /></button>)}
        </div>
      </>}
    </section>
    {lightboxOpen && <ImageLightbox
      images={images}
      currentIndex={index}
      articleTitle={article.title}
      onClose={() => setLightboxOpen(false)}
      onPrevious={() => move(-1)}
      onNext={() => move(1)}
      returnFocusTo={openButton.current}
    />}
  </>
}
