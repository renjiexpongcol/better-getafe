import { useEffect, useRef } from 'react'
import { MapPin, Users, UserRound, ExternalLink, X } from 'lucide-react'

export default function BarangayModal({ barangay, onClose }) {
  const modalRef = useRef(null)
  const closeButtonRef = useRef(null)

  useEffect(() => {
    if (!barangay) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    requestAnimationFrame(() => {
      closeButtonRef.current?.focus()
    })

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [barangay, onClose])

  if (!barangay) return null

  const hasCoordinates =
    barangay.coords &&
    Number.isFinite(Number(barangay.coords.lat)) &&
    Number.isFinite(Number(barangay.coords.lng))

  const lat = hasCoordinates ? Number(barangay.coords.lat) : null
  const lng = hasCoordinates ? Number(barangay.coords.lng) : null

  const mapSrc = hasCoordinates
    ? (() => {
        const deltaLng = 0.012
        const deltaLat = 0.007

        const bbox = [
          lng - deltaLng,
          lat - deltaLat,
          lng + deltaLng,
          lat + deltaLat,
        ].join(',')

        return (
          'https://www.openstreetmap.org/export/embed.html' +
          `?bbox=${encodeURIComponent(bbox)}` +
          '&layer=mapnik' +
          `&marker=${lat}%2C${lng}`
        )
      })()
    : null

  const mapLink = hasCoordinates
    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`
    : null

  const population =
    typeof barangay.population === 'number'
      ? barangay.population.toLocaleString('en-PH')
      : null

  const hasCaptain =
    typeof barangay.captain === 'string' &&
    barangay.captain.trim().length > 0

  const hasDescription =
    typeof barangay.description === 'string' &&
    barangay.description.trim().length > 0

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="barangay-modal-title"
      aria-describedby="barangay-modal-description"
    >
      <div
        className="modal-content"
        ref={modalRef}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div className="modal-header-text">
            <span className="modal-eyebrow">
              Municipality of Getafe
            </span>

            <h2 id="barangay-modal-title">
              Barangay {barangay.name}
            </h2>

            <p id="barangay-modal-description">
              Barangay information and location
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={`Close Barangay ${barangay.name} information`}
          >
            <X size={22} strokeWidth={2} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-info-grid">
            <div className="info-group">
              <div className="info-icon">
                <Users size={18} />
              </div>

              <div className="info-content">
                <span className="info-label">Population</span>

                {population ? (
                  <strong className="info-value">
                    {population}
                  </strong>
                ) : (
                  <span className="info-value unavailable">
                    Information unavailable
                  </span>
                )}

                <small className="info-meta">
                  2020 Census of Population and Housing
                </small>
              </div>
            </div>

            <div className="info-group">
              <div className="info-icon">
                <UserRound size={18} />
              </div>

              <div className="info-content">
                <span className="info-label">
                  Barangay Captain
                </span>

                {hasCaptain ? (
                  <strong className="info-value">
                    {barangay.captain}
                  </strong>
                ) : (
                  <span className="info-value unavailable">
                    Information unavailable
                  </span>
                )}
              </div>
            </div>
          </div>

          <section className="modal-section">
            <div className="modal-section-heading">
              <div>
                <span className="info-label">Location</span>

                <h3>
                  {hasCoordinates
                    ? 'Barangay location'
                    : 'Location unavailable'}
                </h3>
              </div>

              {hasCoordinates && (
                <MapPin size={19} aria-hidden="true" />
              )}
            </div>

            {hasCoordinates ? (
              <>
                <div className="modal-map-frame">
                  <iframe
                    title={`Map showing the location of Barangay ${barangay.name}, Getafe, Bohol`}
                    src={mapSrc}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    style={{
                      width: '100%',
                      height: '300px',
                      border: 0,
                    }}
                  />
                </div>

                <a
                  href={mapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="modal-map-link"
                >
                  <MapPin size={15} />
                  <span>View on OpenStreetMap</span>
                  <ExternalLink size={14} />
                </a>
              </>
            ) : (
              <div className="modal-unavailable-box">
                <MapPin size={18} />

                <span>
                  Location coordinates are not currently
                  available for this barangay.
                </span>
              </div>
            )}
          </section>

          <section className="modal-section">
            <div className="modal-section-heading">
              <div>
                <span className="info-label">About</span>
                <h3>Barangay information</h3>
              </div>
            </div>

            {hasDescription ? (
              <p className="modal-description">
                {barangay.description}
              </p>
            ) : (
              <div className="modal-unavailable-box">
                <span>
                  A detailed description for Barangay{' '}
                  {barangay.name} is not currently available.
                </span>
              </div>
            )}
          </section>
        </div>

        <div className="modal-footer">
          <span>
            {barangay.lastUpdated
              ? `Data reference: ${barangay.lastUpdated}`
              : 'Data reference unavailable'}
          </span>

          <button
            type="button"
            className="modal-footer-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}