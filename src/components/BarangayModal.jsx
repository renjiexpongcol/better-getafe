import { useEffect, useRef } from 'react';

export default function BarangayModal({ barangay, onClose }) {
  const modalRef = useRef(null);
  
  // Close on Escape key and prevent body scroll
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    // Prevent background scrolling
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    
    // Auto focus the modal for accessibility
    if (modalRef.current) {
      modalRef.current.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalStyle;
    };
  }, [onClose]);

  // Handle click outside
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!barangay) return null;

  // Build an OpenStreetMap embed centered on the barangay's coordinates.
  const mapSrc = barangay.coords
    ? (() => {
        const { lat, lng } = barangay.coords;
        const d = 0.012;
        const bbox = `${lng - d},${lat - d * 0.6},${lng + d},${lat + d * 0.6}`;
        return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
          bbox
        )}&layer=mapnik&marker=${lat}%2C${lng}`;
      })()
    : null;
  const mapLink = barangay.coords
    ? `https://www.openstreetmap.org/?mlat=${barangay.coords.lat}&mlon=${barangay.coords.lng}#map=15/${barangay.coords.lat}/${barangay.coords.lng}`
    : null;

  return (
    <div 
      className="modal-backdrop" 
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        className="modal-content" 
        ref={modalRef} 
        tabIndex={-1}
      >
        <button 
          className="modal-close" 
          onClick={onClose}
          aria-label="Close modal"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <h2 id="modal-title">Barangay {barangay.name}</h2>
        
        <div className="modal-body">
          <div className="info-group">
            <span className="info-label">Population</span>
            <span className="info-value">
              {barangay.population !== null ? barangay.population.toLocaleString() : <span className="unavailable">Information unavailable</span>}
            </span>
          </div>
          
          <div className="info-group">
            <span className="info-label">Barangay Captain</span>
            <span className="info-value">
              {barangay.captain !== null ? barangay.captain : <span className="unavailable">Information unavailable</span>}
            </span>
          </div>

          {mapSrc && (
            <div className="modal-map">
              <span className="info-label">Location</span>
              <div className="modal-map-frame">
                <iframe
                  title={`Map of Barangay ${barangay.name}`}
                  src={mapSrc}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              {mapLink && (
                <a href={mapLink} target="_blank" rel="noopener noreferrer" className="modal-map-link">
                  Open in OpenStreetMap ↗
                </a>
              )}
            </div>
          )}

          <div className="info-group">
            <span className="info-label">Description</span>
            <span className="info-value">
              {barangay.description !== null ? barangay.description : <span className="unavailable">Information unavailable</span>}
            </span>
          </div>
        </div>

        {barangay.lastUpdated && (
          <div className="modal-footer">
            Last updated: {barangay.lastUpdated}
          </div>
        )}
      </div>
    </div>
  );
}
