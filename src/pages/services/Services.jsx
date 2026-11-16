import ServiceCatalog from '../../components/ServiceCatalog'
import PopularServiceLinks from '../../components/PopularServiceLinks'

export default function Services() {
  return <main id="services-page">
    <div className="page-header"><div className="container page-header-inner"><div><h1 className="page-title">Municipal Services</h1><p className="page-subtitle">Official LGU services of the Municipality of Getafe, Bohol</p></div></div></div>
    <div className="services-page-content container">
      <ServiceCatalog heading="Service catalog"/>
      <PopularServiceLinks/>
    </div>
  </main>
}
