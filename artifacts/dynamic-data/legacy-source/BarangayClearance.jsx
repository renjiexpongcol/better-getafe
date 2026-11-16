import { useSearchParams } from 'react-router-dom'
import ServicePageLayout from '../../components/ServicePageLayout'

export default function BarangayClearance() {
  const [params] = useSearchParams()
  const barangay = params.get('barangay') || ''
  const barangayLabel = barangay || 'your barangay'
  const officeLabel = barangay ? `${barangay} Barangay Hall` : 'Your Barangay Hall'
  return <ServicePageLayout
    variant="barangay-service"
    backLabel="Back to services"
    showBackLink={false}
    kicker="Public service · Barangay documents"
    title="Barangay Clearance"
    subtitle={barangay ? `${barangay} Barangay · Certificate & Clearance` : 'Certificate & Clearance · All barangays in Getafe'}
    intro="A Barangay Clearance confirms that you are a resident or have a stated purpose within the barangay. Prepare the items below before visiting your barangay hall."
    requirementsTitle="What to bring"
    stepsTitle="Get your clearance"
    services={[{ name: 'Required documents', desc: 'Bring the following items for verification. The barangay office may request additional documents depending on your purpose.', requirements: ['Valid government-issued ID', 'Proof of residency, if requested', 'Clear purpose for the clearance', 'Payment for the applicable barangay fee'] }]}
    steps={[{ n: 1, text: `Visit ${barangayLabel} Barangay Hall during office hours.` }, { n: 2, text: 'Ask for the Barangay Clearance application form and complete it accurately.' }, { n: 3, text: 'Submit your ID and any supporting document for verification.' }, { n: 4, text: 'Confirm the applicable fee and pay through the barangay office.' }, { n: 5, text: 'Review the details on your clearance before receiving it.' }]}
    office={{ name: officeLabel, location: barangay ? `${barangay}, Getafe, Bohol` : 'Getafe, Bohol', hours: 'Monday – Friday, 8:00 AM – 5:00 PM' }}
    contact={{ phone: '(038) 502-9088', email: 'lgugetafe@yahoo.com' }}
  />
}
