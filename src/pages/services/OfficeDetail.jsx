import { ArrowLeft, ArrowUpRight, Building2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

const offices = {
  executive: {
    title: 'Executive Office',
    label: 'Office of the Mayor',
    description: 'The Office of the Mayor and executive offices coordinate municipal programs, policy, and public service delivery.',
    services: ['Municipal programs and initiatives', 'Executive communications', 'Public service coordination'],
  },
  engineering: {
    title: 'Engineering Office',
    label: 'Municipal Engineering',
    description: 'Find municipal engineering information, infrastructure coordination, and public works support.',
    services: ['Infrastructure coordination', 'Public works support', 'Project and construction information'],
  },
  'zoning-planning': {
    title: 'Zoning and Planning Office',
    label: 'Municipal Planning',
    description: 'Get guidance on land use, development planning, zoning clearances, and local planning requirements.',
    services: ['Land-use planning', 'Development coordination', 'Zoning guidance'],
  },
  treasury: {
    title: 'Treasurer’s Office',
    label: 'Municipal Treasury',
    description: 'Access local tax, payment, business, and revenue-related information from the Municipal Treasurer.',
    services: ['Local payments and settlements', 'Revenue information', 'Treasury transaction guidance'],
  },
  assessment: {
    title: 'Assessor’s Office',
    label: 'Municipal Assessment',
    description: 'Learn about property assessment, tax declarations, and assessment office transactions.',
    services: ['Property assessment', 'Tax declarations', 'Assessment transactions'],
  },
  'civil-registry': {
    title: 'Civil Registry Office',
    label: 'Municipal Civil Registrar',
    description: 'Find information about birth, marriage, death, and other civil registry document requests.',
    services: ['Birth certificate requests', 'Marriage records', 'Death records'],
    href: '/services/certificates',
  },
  health: {
    title: 'Municipal Health Office',
    label: 'Public Health Services',
    description: 'Connect with municipal health programs, public health services, and rural health support.',
    services: ['Health programs', 'Vaccination services', 'Medical assistance'],
  },
  'social-welfare': {
    title: 'Social Welfare Office',
    label: 'Municipal Social Welfare',
    description: 'Find assistance programs and social welfare support for families, children, senior citizens, and vulnerable residents.',
    services: ['Family assistance', 'Senior citizen support', 'Social welfare programs'],
  },
}

export default function OfficeDetail() {
  const { slug } = useParams()
  const office = offices[slug] || {
    title: 'Municipal Office',
    label: 'Municipal Services',
    description: 'Information about this municipal office is not currently available.',
    services: [],
  }

  return (
    <main className="service-directory-page">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <Link className="article-back" to="/services/directory">← Services &amp; departments</Link>
            <p className="service-directory-kicker">{office.label}</p>
            <h1 className="page-title">{office.title}</h1>
            <p className="page-subtitle">{office.description}</p>
          </div>
        </div>
      </div>
      <section className="service-directory-content section">
        <div className="container">
          <article className="service-directory-card service-office-detail-card">
            <div className="service-directory-icon"><Building2 size={22} aria-hidden="true" /></div>
            <p className="service-directory-label">Office information</p>
            <h2>Available services</h2>
            {office.services.length ? <ul>{office.services.map(service => <li key={service}>{service}</li>)}</ul> : <p>No office services are currently listed.</p>}
            {office.href && <Link className="service-directory-link" to={office.href}>View certificates and IDs <ArrowUpRight size={15} /></Link>}
          </article>
        </div>
      </section>
    </main>
  )
}
