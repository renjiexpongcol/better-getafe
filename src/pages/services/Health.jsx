import ServicePageLayout from '../../components/ServicePageLayout'

export default function Health() {
  return (
    <ServicePageLayout
      kicker="Popular services · Health"
      title="Health Services"
      subtitle="Health programs and assistance from the Municipal Health Office of Getafe."
      intro="The Municipal Health Office provides accessible primary health care and social health programs to protect and improve the well-being of every resident."
      services={[
        {
          name: 'Health Cards / PhilHealth',
          desc: 'Registration and renewal of health card benefits and PhilHealth membership.',
          requirements: ['Valid government ID', 'Proof of residency', 'PhilHealth membership documents'],
        },
        {
          name: 'Vaccination Programs',
          desc: 'Immunization for infants, children, and adults, including routine and catch-up vaccines.',
          requirements: ['Child health book / vaccination record', 'Valid government ID'],
        },
        {
          name: 'Medical Assistance',
          desc: 'Financial assistance for medical treatment, consultations, and hospitalization.',
          requirements: ['Barangay Clearance', 'Certificate of Indigency', 'Medical certificate or hospital bill'],
        },
        {
          name: 'Maternal & Child Health',
          desc: 'Prenatal, natal, and postnatal care for mothers and their children.',
          requirements: ['Valid government ID', 'Pregnancy / child health record'],
        },
        {
          name: 'Senior Citizen & PWD Benefits',
          desc: 'Health and social benefits for senior citizens and persons with disabilities.',
          requirements: ['Senior Citizen ID or PWD ID', 'Valid government ID'],
        },
      ]}
      steps={[
        { n: 1, text: 'Visit the Municipal Health Office (MHO) or the Rural Health Unit.' },
        { n: 2, text: 'Present your ID and the required documents.' },
        { n: 3, text: 'Register for the program or service you need.' },
        { n: 4, text: 'Receive guidance on your benefits and schedule.' },
      ]}
      office={{
        name: 'Municipal Health Office (MHO)',
        location: 'Getafe Rural Health Unit, Poblacion, Getafe, Bohol',
        hours: 'Monday – Friday, 8:00 AM – 5:00 PM',
      }}
      contact={{ phone: '(038) 502-9088', email: 'lgugetafe@yahoo.com' }}
      related={[
        {
          name: 'Getafe Rural Health Unit (RHU)',
          desc: 'The official Facebook page of the Getafe RHU — health programs, schedules, and announcements.',
          url: 'https://www.facebook.com/GetafeRHU',
          img: '/assets/getafe-default/profiles/RHU-getafe.jpg',
        },
      ]}
    />
  )
}
