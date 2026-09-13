import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function OpenStreetMap({ lat, lng, title = 'Location map', className = '' }) {
  const nodeRef = useRef(null)

  useEffect(() => {
    if (!nodeRef.current) return undefined
    const map = L.map(nodeRef.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([lat, lng], 15)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    L.marker([lat, lng]).addTo(map).bindPopup(title)
    const handleWheel = (event) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      event.stopPropagation()
      if (event.deltaY < 0) map.zoomIn()
      else if (event.deltaY > 0) map.zoomOut()
    }
    nodeRef.current.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      nodeRef.current?.removeEventListener('wheel', handleWheel)
      map.remove()
    }
  }, [lat, lng, title])

  return <div ref={nodeRef} className={`openstreetmap ${className}`} role="img" aria-label={title} />
}
