import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { barangays } from '../../data/barangays'
import BarangayCard from '../../components/BarangayCard'
import BarangayModal from '../../components/BarangayModal'

export default function Barangays() {
  const [records, setRecords] = useState(barangays)
  const [selectedBarangay, setSelectedBarangay] = useState(null)
  const [searchParams] = useSearchParams()
  useEffect(() => { fetch('/api/barangays').then((r) => r.ok ? r.json() : Promise.reject()).then((value) => { if (Array.isArray(value) && value.length) setRecords(value) }).catch(() => {}) }, [])

  // Auto-open a barangay's modal when arriving with ?brgy=<id> (e.g. from
  // the "Getafe at a Glance" table).
  useEffect(() => {
    const brgyId = searchParams.get('brgy')
    if (brgyId) {
      const found = records.find((b) => b.id === brgyId)
      if (found) setSelectedBarangay(found)
    }
  }, [searchParams, records])

  return (
    <main id="barangays-page">
      <div className="page-header barangays-hero" style={{ '--barangays-hero-image': "url('/assets/getafe-default/about-getafe.jpg')" }}>
        <div className="container page-header-inner">
          <div>
            <p className="barangays-hero-eyebrow">MUNICIPALITY OF GETAFE · BOHOL</p><h1 className="page-title">Barangays of Getafe</h1>
            <div className="barangays-hero-summary"><div><p>Explore the communities across Getafe’s islands and surrounding islets. Select a barangay to learn more.</p></div></div>
          </div>
        </div>
      </div>

      <div className="content-page container">
        <div className="barangays-grid">
          {records.map((brgy) => (
            <BarangayCard key={brgy.id} barangay={brgy} onClick={setSelectedBarangay} />
          ))}
        </div>

        <p className="barangays-note">
          <MapPin size={14} /> Population figures are from the 2020 Census of Population and Housing (PSA).
        </p>
      </div>

      {selectedBarangay && (
        <BarangayModal barangay={selectedBarangay} onClose={() => setSelectedBarangay(null)} />
      )}
    </main>
  )
}
