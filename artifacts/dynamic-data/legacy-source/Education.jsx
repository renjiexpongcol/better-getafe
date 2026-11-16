import ServicePageLayout from '../../components/ServicePageLayout'

export default function Education() {
  return (
    <ServicePageLayout
      kicker="Popular services · Education"
      title="Education & Scholarships"
      subtitle="Financial assistance, scholarships, and skills training programs for Getafe residents."
      intro="The municipality invests in its students and workforce through scholarships, financial aid, and skills training designed to open more opportunities for every Getafe\u00f1o."
      services={[
        {
          name: 'Municipal Scholarship Program',
          desc: 'Financial support for deserving college students who are residents of Getafe.',
          requirements: ['Proof of residency in Getafe', 'Certificate of enrollment or admission', 'Academic records / grades', 'Certificate of Indigency (if applying for aid)'],
        },
        {
          name: 'School Assistance / Financial Aid',
          desc: 'One-time assistance for school needs such as uniforms, supplies, and transportation.',
          requirements: ['Barangay Clearance', 'Proof of enrollment', 'Certificate of Indigency'],
        },
        {
          name: 'Skills Training Programs',
          desc: 'Short-term skills and livelihood training, including TESDA-accredited courses.',
          requirements: ['Valid government ID', 'Proof of residency', 'Completed registration form'],
        },
        {
          name: 'Alternative Learning System',
          desc: 'A program for out-of-school youth and adults to continue their basic education.',
          requirements: ['Valid government ID', 'Enrollment in the ALS program'],
        },
      ]}
      steps={[
        { n: 1, text: 'Secure a Barangay Clearance from your barangay.' },
        { n: 2, text: 'Visit the Municipal Social Welfare and Development (MSWD) office.' },
        { n: 3, text: 'Submit the scholarship or assistance requirements and application form.' },
        { n: 4, text: 'Await evaluation and the release of benefits or training schedule.' },
      ]}
      office={{
        name: 'Municipal Social Welfare and Development (MSWD)',
        location: 'Municipal Hall, Poblacion, Getafe, Bohol',
        hours: 'Monday – Friday, 8:00 AM – 5:00 PM',
      }}
      contact={{ phone: '(038) 502-9088', email: 'lgugetafe@yahoo.com' }}
      related={[
        {
          name: 'Colegio de Getafe',
          desc: 'The official Facebook page of Colegio de Getafe — admissions, announcements, and campus updates.',
          url: 'https://www.facebook.com/cdgetafe/',
          email: 'colegiodegetafe@gmail.com',
          img: '/assets/cdg-getafe/309577993_205055401874207_4310045809763569344_n.jpg',
        },
      ]}
    />
  )
}
