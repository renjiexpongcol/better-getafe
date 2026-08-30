import ServicePageLayout from '../../components/ServicePageLayout'

export default function BusinessTrade() {
  return (
    <ServicePageLayout
      kicker="Popular services · Business"
      title="Business & Trade"
      subtitle="Permits and clearances to start or renew your business in Getafe."
      intro="Getafe supports local entrepreneurs and business owners. Whether you are starting a new venture or renewing your existing permit, the municipal government is here to help you comply quickly and easily."
      services={[
        {
          name: 'New Business Permit',
          desc: 'Register a new business and secure your Mayor\u2019s Permit to legally operate in Getafe.',
          requirements: ['Barangay Clearance (business)', 'DTI or SEC registration (if applicable)', 'Lease contract or proof of ownership', 'Valid government ID of the owner'],
        },
        {
          name: 'Business Permit Renewal',
          desc: 'Renew your existing business permit for the current year.',
          requirements: ['Previous year\u2019s business permit', 'Updated Barangay Clearance', 'Proof of tax payments', 'Inspection clearance (if required)'],
        },
        {
          name: 'Barangay Clearance (Business)',
          desc: 'A clearance from your barangay certifying your business is operating within its area.',
          requirements: ['Valid government ID', 'Business name and address', 'Payment of applicable barangay fees'],
        },
        {
          name: 'Certificate of No Tax Delinquency',
          desc: 'A certification that your business has no outstanding tax obligations with the municipality.',
          requirements: ['Valid government ID', 'Business permit', 'Prior tax payment records'],
        },
      ]}
      steps={[
        { n: 1, text: 'Secure a Barangay Clearance at your barangay hall.' },
        { n: 2, text: 'Prepare the required documents and fill out the application form at the Business Permit and Licensing Office (BPLO).' },
        { n: 3, text: 'Pay the corresponding registration and permit fees at the Municipal Treasurer\u2019s Office.' },
        { n: 4, text: 'Claim your Business Permit and post it prominently in your establishment.' },
      ]}
      office={{
        name: 'Business Permit and Licensing Office (BPLO)',
        location: 'Municipal Hall, Poblacion, Getafe, Bohol',
        hours: 'Monday – Friday, 8:00 AM – 5:00 PM',
      }}
      contact={{ phone: '(038) 502-9088', email: 'lgugetafe@yahoo.com' }}
    />
  )
}
