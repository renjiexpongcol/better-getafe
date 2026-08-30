import { Link } from 'react-router-dom'
import { Building2, IdCard, GraduationCap, HeartPulse, ArrowRight } from 'lucide-react'

const services = [
  { icon: Building2, title: 'Business & Trade', url: '/services/business-trade', items: ['Business Permit', 'Barangay Clearance', 'Tax Compliance'] },
  { icon: IdCard, title: 'Certificates & IDs', url: '/services/certificates', items: ['Birth Certificate', 'Barangay ID', 'Local Residency'] },
  { icon: GraduationCap, title: 'Education', url: '/services/education', items: ['Scholarship', 'School Assistance', 'Training Programs'] },
  { icon: HeartPulse, title: 'Health', url: '/services/health', items: ['Health Cards', 'Vaccination', 'Medical Assistance'] },
]

export default function ServicesSection() {
  return (
    <section className="section" id="services">
      <div className="container">
        <div className="section-head">
          <p className="eyebrow">Popular services</p>
          <h2>Official LGU services</h2>
        </div>

        <div className="service-grid">
          {services.map(({ icon: Icon, title, url, items }) => (
            <article className="service-card" key={title}>
              <Link to={url} className="service-card-link" aria-label={`${title} services`}>
                <div className="icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={32} color="#3b82f6" />
                </div>
                <h3>{title}</h3>
                <ul>
                  {items.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <span className="service-view">View all <ArrowRight size={14} /></span>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
