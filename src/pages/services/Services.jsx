import ServicesSection from '../../components/ServicesSection'

export default function Services() {
  return (
    <main id="services-page">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <h1 className="page-title">Municipal Services</h1>
            <p className="page-subtitle">Official LGU services of the Municipality of Getafe, Bohol</p>
          </div>
        </div>
      </div>
      <ServicesSection />
    </main>
  )
}
