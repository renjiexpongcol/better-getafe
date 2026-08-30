import ServicePageLayout from '../../components/ServicePageLayout'

export default function Certificates() {
  return (
    <ServicePageLayout
      kicker="Popular services · Civil registry"
      title="Certificates & IDs"
      subtitle="Official certificates, clearances, and identification documents for residents."
      intro="From barangay clearances to resident certificates, the municipality issues the documents you need for work, school, and personal transactions."
      services={[
        {
          name: 'Barangay Clearance',
          desc: 'A certification that you are a resident of the barangay with no derogatory record.',
          requirements: ['Valid government ID', 'Proof of residency', 'Payment of barangay clearance fee'],
        },
        {
          name: 'Barangay ID',
          desc: 'An identification card issued to verified residents of the barangay.',
          requirements: ['Valid government ID', 'Barangay Clearance', 'Proof of residency', '1x1 ID picture'],
        },
        {
          name: 'Certificate of Indigency',
          desc: 'A certification that you qualify for financial assistance or government programs.',
          requirements: ['Barangay Clearance', 'Proof of income', 'Recommendation from a barangay official'],
        },
        {
          name: 'Local Residency Certificate',
          desc: 'Certifies that you have been residing in Getafe for a given period.',
          requirements: ['Valid government ID', 'Proof of residence (billing statement or lease)'],
        },
        {
          name: 'Community Tax Certificate (Cedula)',
          desc: 'The annual residence and occupation tax certificate issued by the municipality.',
          requirements: ['Valid government ID', 'Previous cedula (if renewing)'],
        },
      ]}
      steps={[
        { n: 1, text: 'Visit your barangay hall or the Municipal Civil Registrar\u2019s Office.' },
        { n: 2, text: 'Present the required documents and fill out the application form.' },
        { n: 3, text: 'Pay the applicable certification or processing fee.' },
        { n: 4, text: 'Receive your certificate or ID.' },
      ]}
      office={{
        name: 'Municipal Civil Registrar\u2019s Office',
        location: 'Municipal Hall, Poblacion, Getafe, Bohol',
        hours: 'Monday – Friday, 8:00 AM – 5:00 PM',
      }}
      contact={{ phone: '(038) 502-9088', email: 'lgugetafe@yahoo.com' }}
    />
  )
}
