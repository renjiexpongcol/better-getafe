import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layers, MapPin } from 'lucide-react'
import { barangays } from '../../data/barangays'
import BarangayCard from '../../components/BarangayCard'
import BarangayModal from '../../components/BarangayModal'

export default function Barangays() {
  const [selectedBarangay, setSelectedBarangay] = useState(null)
  const [searchParams] = useSearchParams()

  // Auto-open a barangay's modal when arriving with ?brgy=<id> (e.g. from
  // the "Getafe at a Glance" table).
  useEffect(() => {
    const brgyId = searchParams.get('brgy')
    if (brgyId) {
      const found = barangays.find((b) => b.id === brgyId)
      if (found) setSelectedBarangay(found)
    }
  }, [searchParams])

  return (
    <main id="barangays-page">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <h1 className="page-title">Barangays of Getafe</h1>
            <p className="page-subtitle">
              Explore the {barangays.length} officially verified barangays of the Municipality of Getafe.
            </p>
          </div>
        </div>
      </div>

      <div className="content-page container">
        <div className="barangays-intro">
          <span className="getafe-stat-icon blue"><Layers size={18} /></span>
          <p>
            Getafe is composed of <strong>{barangays.length} barangays</strong> scattered across the island and its
            surrounding islets. Select a barangay below to view its population profile.
          </p>
        </div>

        <div className="barangays-grid">
          {barangays.map((brgy) => (
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
