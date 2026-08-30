import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

// Global "Back to top" floating button shown on every page once the user
// scrolls down far enough. Smoothly scrolls back to the top on click.
export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      className="back-to-top"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}
    >
      <ArrowUp size={20} aria-hidden="true" />
    </button>
  )
}
