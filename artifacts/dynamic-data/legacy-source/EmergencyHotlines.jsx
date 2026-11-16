import { useMemo, useState } from 'react'
import {
  AlertTriangle, Ambulance, ArrowRight, Check, CloudSun,
  Droplets, ExternalLink, HeartHandshake, Landmark, MapPin, Package,
  Phone, ShieldAlert, ShieldCheck, Siren, Waves
} from 'lucide-react'
import { EmptyState, SearchInput } from '../../components/ui/Primitives'
import './EmergencyHotlines.css'

const categories = [
  { id: 'All', icon: Landmark }, { id: 'Emergency', icon: Siren }, { id: 'Disaster', icon: AlertTriangle },
  { id: 'Security', icon: ShieldAlert }, { id: 'Transport', icon: Ambulance }, { id: 'Weather', icon: CloudSun },
  { id: 'Utilities', icon: Droplets }, { id: 'Social Services', icon: HeartHandshake },
]

// Numbers to reach first in an emergency.
const quickDial = [
  { number: '911', name: 'National Emergency', note: 'Police, fire, and medical', tel: 'tel:911' },
  { number: '117', name: 'PNP Hotline', note: 'Philippine National Police', tel: 'tel:117' },
  { number: '143', name: 'Philippine Red Cross', note: 'Emergency & blood services', tel: 'tel:143' },
]

const tips = [
  { icon: MapPin, title: 'Know your exact location', text: 'Be ready to describe your street, barangay, and nearby landmarks when you call for help.' },
  { icon: Phone, title: 'Save these numbers now', text: 'Add 911, 117, and 143 to your phone today — before an emergency happens.' },
  { icon: ShieldCheck, title: 'Stay calm and clear', text: 'Speak slowly, answer the dispatcher\u2019s questions, and stay on the line until told otherwise.' },
  { icon: Package, title: 'Keep an emergency kit', text: 'Prepare water, non-perishable food, a flashlight, batteries, and first-aid supplies at home.' },
]

const hotlines = [
  { category: 'Emergency', name: 'National Emergency Hotline', description: 'Nationwide emergency hotline for police, fire, and medical assistance.', numbers: ['911'], icon: Siren, urgent: true },
  { category: 'Disaster', name: 'National Disaster Risk Reduction and Management Council (NDRRMC)', description: 'Coordinates disaster preparedness, response, and recovery efforts.', numbers: ['(02) 8911-5061 to 65 local 100', '(02) 8911-1406', '(02) 8912-2665', '(02) 8912-5668', '(02) 8911-1873'], icon: AlertTriangle },
  { category: 'Social Services', name: 'Department of Social Welfare and Development', description: 'Social services, disaster relief, and assistance for affected families and communities.', numbers: ['0918-912-2813 · Text Hotline', '(02) 8931-8101 to 07', '(02) 8856-3665 · Disaster Response Unit', '(02) 8852-8081 · Disaster Response Unit'], icon: HeartHandshake },
  { category: 'Emergency', name: 'Philippine Red Cross', description: 'Emergency response, disaster relief, and blood donation services.', numbers: ['143 · Hotline', '(02) 8527-8385 to 95 · National Blood Center', '(02) 8527-0000', '(02) 8790-2300'], icon: HeartHandshake },
  { category: 'Security', name: 'Philippine National Police (PNP)', description: 'Law enforcement hotline for crimes, threats, and public safety concerns.', numbers: ['117 · Emergency Hotline', '(02) 8722-0650', '0917-847-5757 · Text Hotline'], icon: ShieldAlert },
  { category: 'Emergency', name: 'Bureau of Fire Protection (BFP)', description: 'Fire prevention, rescue, and related emergencies.', numbers: ['(02) 8426-0219', '(02) 8426-0246'], icon: Siren },
  { category: 'Emergency', name: 'Philippine Coast Guard', description: 'Maritime safety, rescue, and law enforcement services in Philippine waters.', numbers: ['(02) 8527-8481 to 89', '(02) 8527-3877', '(02) 8527-3880 to 85', '0917-724-3682 · Text Hotline', '0918-967-4697 · Text Hotline'], icon: Waves },
  { category: 'Transport', name: 'Metro Manila Development Authority (MMDA)', description: 'Traffic management, road safety, and emergency response within Metro Manila.', numbers: ['136 · Hotline', '(02) 8882-4151 to 77'], icon: Ambulance },
  { category: 'Transport', name: 'Department of Transportation (DOTr)', description: 'National transport authority for public transportation services and passenger complaints.', numbers: ['7890 · Action Center Hotline', '(02) 8790-8300', '(02) 8726-4925'], icon: Ambulance },
  { category: 'Transport', name: 'Land Transportation Office (LTO)', description: 'Vehicle registration, licensing, and road safety enforcement.', numbers: ['Text LTOHELP to 2600 · All networks', '(02) 8922-9061 to 63'], icon: Ambulance },
  { category: 'Transport', name: 'Land Transportation Franchising and Regulatory Board (LTFRB)', description: 'Regulates public utility vehicles and addresses transport-related complaints.', numbers: ['1342 · 24/7 Hotline', '(02) 8426-2515', '(02) 8426-2534', '0921-448-7777 · Text Hotline'], icon: Ambulance },
  { category: 'Weather', name: 'PAGASA', description: 'Weather forecasts, flood warnings, and typhoon advisories.', numbers: ['(02) 8284-0800'], icon: CloudSun },
  { category: 'Disaster', name: 'PHIVOLCS', description: 'Warnings for earthquakes, tsunamis, and volcanic eruptions.', numbers: ['(02) 8426-1468 to 79'], icon: AlertTriangle },
  { category: 'Utilities', name: 'Manila Water', description: 'Water supply concerns in the East Zone of Metro Manila.', numbers: ['1627'], icon: Droplets },
  { category: 'Utilities', name: 'Maynilad', description: 'Water supply concerns in the West Zone of Metro Manila.', numbers: ['1626', '0998-864-1446 · Text Hotline'], icon: Droplets },
  { category: 'Social Services', name: 'Violence Against Women and Children (VAWC)', description: 'Report and seek help for abuse or violence against women and children.', numbers: ['(02) 8931-8101 to 07 · DSWD', '(02) 8734-8639 · DSWD-NCR', '(02) 8723-0401 to 20 · PNP', '(02) 3410-3213 · PNP-WCPC'], icon: HeartHandshake },
  { category: 'Social Services', name: 'National Center for Mental Health (NCMH)', description: '24/7 crisis hotline and mental health support services.', numbers: ['0917-899-8727 · USAP', '989-8727 · USAP', '(02) 8531-9001 to 10 local 201'], icon: HeartHandshake },
]

const phoneHref = (number) => `tel:${number.replace(/[^0-9+]/g, '')}`

export default function EmergencyHotlines() {
  const [active, setActive] = useState('All')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const filtered = useMemo(() => hotlines.filter(item => (active === 'All' || item.category === active) && `${item.name} ${item.description} ${item.numbers.join(' ')}`.toLowerCase().includes(query.toLowerCase())), [active, query])
  const copy = async (number) => { try { await navigator.clipboard.writeText(number); setCopied(number); setCopyMessage(`Copied ${number}`); setTimeout(() => setCopied(''), 1600) } catch { setCopyMessage('Could not copy the number. Select the number to copy it manually.') } }

  return <div className="hotline-page">
    <main id="top">
      <section className="page-header hotline-hero">
        <div className="container page-header-inner hotline-hero-inner">
          <div>
            <h1 className="page-title">Emergency hotlines</h1>
            <p className="page-subtitle">Contact numbers for emergency assistance and public services in the Philippines.</p>
          </div>
          <a className="call-911" href="tel:911"><span className="pulse"><Phone size={22} aria-hidden="true"/></span><span><small>Immediate emergency assistance</small><strong>Call 911</strong></span><ArrowRight size={22} aria-hidden="true"/></a>
        </div>
      </section>

      <section className="quick-section" id="quick">
        <div className="hotline-container">
          <h2 className="quick-title">Quick-dial emergency numbers</h2>
          <div className="quick-grid">
            {quickDial.map((q) => (
              <a className="quick-card" href={q.tel} key={q.number}>
                <span className="quick-number">{q.number}</span>
                <span className="quick-meta">
                  <strong>{q.name}</strong>
                  <small>{q.note}</small>
                </span>
                <span className="quick-call"><Phone size={16}/></span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section id="directory" className="directory-section">
        <div className="hotline-container">
          <div className="directory-head"><div><h2>Hotline directory</h2></div><p role="status">{filtered.length} service{filtered.length !== 1 ? 's' : ''} shown</p></div>
          <SearchInput label="Search hotlines" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search an agency, service, or number" />
          <div className="filter-row" role="group" aria-label="Hotline categories">{categories.map(({id, icon: Icon}) => <button type="button" key={id} aria-pressed={active === id} onClick={() => setActive(id)} className={active === id ? 'filter active' : 'filter'}><Icon size={16} aria-hidden="true"/>{id}</button>)}</div>
          <div className="hotline-grid">{filtered.map((item) => { const Icon = item.icon; return <article className={`hotline-card ${item.urgent ? 'urgent' : ''}`} key={item.name}>
            <div className="card-top"><span className="category-icon"><Icon size={21}/></span><span className="category-tag">{item.category}</span></div>
            <h3>{item.name}</h3><p>{item.description}</p>
            <div className="number-list">{item.numbers.map(number => <div className="number-row" key={number}><a href={phoneHref(number)}>{number}</a><button onClick={() => copy(number)} aria-label={`Copy ${number}`}>{copied === number ? <Check size={16}/> : <span>Copy</span>}</button></div>)}</div>
          </article>})}</div>
          {!filtered.length && <EmptyState title="No matching hotline found" description="Try another agency, service, or number." action={<button type="button" className="ui-button ui-button--outline" onClick={() => {setQuery(''); setActive('All')}}>Clear filters</button>}/>}
          <p className="sr-only" role="status">{copyMessage}</p>
        </div>
      </section>

      <section className="tips-section" id="tips">
        <div className="hotline-container">
          <p className="section-label">Be prepared</p>
          <h2 className="tips-title">Emergency tips</h2>
          <p className="tips-lead">A few small steps can help you stay safe when it matters most.</p>
          <div className="tips-grid">
            {tips.map(({ icon: Icon, title, text }) => (
              <div className="tip-card" key={title}>
                <span className="tip-icon"><Icon size={22}/></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="info-band" id="about"><div className="hotline-container info-grid"><div className="info-icon"><ShieldAlert size={29}/></div><div><p className="section-label">A quick reminder</p><h2>In danger or facing a life-threatening emergency?</h2><p>Call <a href="tel:911">911</a> right away. Provide your location and stay on the line until help arrives.</p></div><a className="outline-call" href="tel:911">Call 911 <Phone size={17}/></a></div></section>
      <section className="report-section" id="report"><div className="hotline-container report-inner"><div><p className="section-label">Help keep this useful</p><h2>Spot information that needs updating?</h2><p>These hotlines are collected from official government sources. Let us know if a number has changed.</p></div><a className="report-button" href="mailto:lgugetafe@yahoo.com?subject=Hotline%20information%20update">Report outdated information <ExternalLink size={17}/></a></div></section>
    </main>
  </div>
}
