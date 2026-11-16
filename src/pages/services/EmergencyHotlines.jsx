import { useState } from 'react'
import {
  AlertTriangle, Ambulance, ArrowRight, Check, CloudSun,
  Droplets, HeartHandshake, Landmark, MapPin, Package,
  Phone, ShieldAlert, ShieldCheck, Siren, Waves
} from 'lucide-react'
import { usePublishedContent } from '../../hooks/usePublicResource'
import { EmptyState, SearchInput, LoadingState, ErrorState } from '../../components/ui/Primitives'
import './EmergencyHotlines.css'

const iconMap = { AlertTriangle, Ambulance, CloudSun, Droplets, HeartHandshake, Landmark, MapPin, Package, Phone, ShieldAlert, ShieldCheck, Siren, Waves }

const phoneHref = number => /^[+0-9() -]+$/.test(number) ? `tel:${number.replace(/[^0-9+]/g, '')}` : undefined

export default function EmergencyHotlines() {
  const resource = usePublishedContent('hotlines')
  const hotlines = resource.content?.items || []
  const quickDial = resource.content?.quickDial || []
  const tips = resource.content?.tips || []
  const emergency = resource.content?.emergency
  const categories = [{ id: 'All', icon: Landmark }, ...[...new Set(hotlines.map(item => item.category))].map(id => ({ id, icon: iconMap[hotlines.find(item => item.category === id)?.icon] || Phone }))]
  const [active, setActive] = useState('All')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const filtered = hotlines.filter(item => (active === 'All' || item.category === active) && `${item.name} ${item.description} ${item.numbers.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  const copy = async (number) => { try { await navigator.clipboard.writeText(number); setCopied(number); setCopyMessage(`Copied ${number}`); setTimeout(() => setCopied(''), 1600) } catch { setCopyMessage('Could not copy the number. Select the number to copy it manually.') } }

  if (resource.loading || resource.error || !resource.content) return <main className="hotline-page"><div className="page-header"><div className="container page-header-inner"><div><h1 className="page-title">Emergency hotlines</h1></div></div></div><div className="container section">{resource.loading ? <LoadingState label="Loading hotline information…" /> : resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : <EmptyState title="No published hotline information" description="Hotline contacts will appear when published by the municipality." />}</div></main>
  return <div className="hotline-page">
    <main id="top">
      <section className="page-header hotline-hero">
        <div className="container page-header-inner hotline-hero-inner">
          <div>
            <h1 className="page-title">Emergency hotlines</h1>
            <p className="page-subtitle">Contact numbers for emergency assistance and public services in the Philippines.</p>
          </div>
          {emergency?.tel && <a className="call-911" href={emergency.tel}><span className="pulse"><Phone size={22} aria-hidden="true"/></span><span><small>Immediate emergency assistance</small><strong>Call {emergency.number}</strong></span><ArrowRight size={22} aria-hidden="true"/></a>}
        </div>
      </section>

      {quickDial.length > 0 && <section className="quick-section" id="quick">
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
      </section>}

      <section id="directory" className="directory-section">
        <div className="hotline-container">
          <div className="directory-head"><div><h2>Hotline directory</h2></div><p role="status">{filtered.length} service{filtered.length !== 1 ? 's' : ''} shown</p></div>
          <SearchInput label="Search hotlines" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search an agency, service, or number" />
          <div className="filter-row" role="group" aria-label="Hotline categories">{categories.map(({id, icon: Icon}) => <button type="button" key={id} aria-pressed={active === id} onClick={() => setActive(id)} className={active === id ? 'filter active' : 'filter'}><Icon size={16} aria-hidden="true"/>{id}</button>)}</div>
          <div className="hotline-grid">{filtered.map((item) => { const Icon = iconMap[item.icon] || Phone; return <article className={`hotline-card ${item.urgent ? 'urgent' : ''}`} key={item.name}>
            <div className="card-top"><span className="category-icon"><Icon size={21}/></span><span className="category-tag">{item.category}</span></div>
            <h3>{item.name}</h3><p>{item.description}</p>
            <div className="number-list">{item.numbers.map(number => <div className="number-row" key={number}><a href={phoneHref(number)}>{number}</a><button onClick={() => copy(number)} aria-label={`Copy ${number}`}>{copied === number ? <Check size={16}/> : <span>Copy</span>}</button></div>)}</div>
          </article>})}</div>
          {!filtered.length && <EmptyState title="No matching hotline found" description="Try another agency, service, or number." action={<button type="button" className="ui-button ui-button--outline" onClick={() => {setQuery(''); setActive('All')}}>Clear filters</button>}/>}
          <p className="sr-only" role="status">{copyMessage}</p>
        </div>
      </section>

      {tips.length > 0 && <section className="tips-section" id="tips">
        <div className="hotline-container">
          <p className="section-label">Be prepared</p>
          <h2 className="tips-title">Emergency tips</h2>
          <p className="tips-lead">A few small steps can help you stay safe when it matters most.</p>
          <div className="tips-grid">
            {tips.map(({ icon, title, text }) => { const Icon = iconMap[icon] || ShieldCheck; return (
              <div className="tip-card" key={title}>
                <span className="tip-icon"><Icon size={22}/></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            )})}
          </div>
        </div>
      </section>}

    </main>
  </div>
}
