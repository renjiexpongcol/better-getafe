import { Link } from 'react-router-dom'
import { Building2, IdCard, GraduationCap, HeartPulse, ArrowRight } from 'lucide-react'

const serviceCategories = [
  { id: 'business', number: '01', icon: Building2, title: 'Business & Trade', url: '/services/business-trade', badge: 'Most requested', featured: true, items: ['Business Permit', 'Barangay Clearance', 'Tax Compliance'] },
  { id: 'certificates', number: '02', icon: IdCard, title: 'Certificates & IDs', url: '/services/certificates', badge: 'Public service', items: ['Birth Certificate', 'Barangay ID', 'Local Residency'] },
  { id: 'education', number: '03', icon: GraduationCap, title: 'Education', url: '/services/education', badge: 'Public service', items: ['Scholarship', 'School Assistance', 'Training Programs'] },
  { id: 'health', number: '04', icon: HeartPulse, title: 'Health', url: '/services/health', badge: 'Public service', items: ['Health Cards', 'Vaccination', 'Medical Assistance'] },
]

function ServiceCard({ category }) {
  const { badge, featured, icon: Icon, items, number, title, url } = category

  return (
    <article className={`service-card ${featured ? 'service-card-featured' : ''}`}>
      <Link to={url} className="service-card-link" aria-label={`View all ${title} services`}>
        <div className="service-card-topline">
          <span>{number}</span>
          <span className={featured ? 'service-badge' : ''}>{badge}</span>
        </div>
        <div className="service-icon" aria-hidden="true"><Icon size={28} strokeWidth={2.15} /></div>
        <h3>{title}</h3>
        <ul className="service-items" aria-label={`${title} services`}>
          {items.map((item) => <li key={item}><span>{item}</span></li>)}
        </ul>
        <span className="service-view">View all services <ArrowRight size={16} aria-hidden="true" /></span>
      </Link>
    </article>
  )
}

export default function ServicesSection() {
  return (
    <section className="section" id="services">
      <div className="container">
        <div className="section-head">
          <p className="eyebrow">Popular services</p>
          <p className="services-intro">Access frequently requested municipal services, applications, certificates, and assistance programs.</p>
        </div>

        <div className="service-grid">
          {serviceCategories.map((category) => <ServiceCard category={category} key={category.id} />)}
        </div>
      </div>
    </section>
  )
}
