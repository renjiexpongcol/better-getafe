import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Database, Search, SlidersHorizontal } from 'lucide-react';
import { publicData, apiData, collection, label } from '../../services/publicDataApi';
import './publicData.css';
import './publicDataPalette.css';

const categories = ['Population & Demographics', 'Economy', 'Agriculture', 'Employment', 'Education', 'Health', 'Housing', 'Environment', 'Geographic Data', 'Barangay Statistics', 'Other Public Data'];
const metricLabels = [
  { label: 'Available datasets', path: ['datasets'] },
  { label: 'Mirrored datasets', path: ['mirrored'] },
  { label: 'Topics covered', path: ['topics'] },
  { label: 'Mirrored observations', path: ['mirroredCells'] },
  { label: 'Query point limit', path: ['limits', 'points'] },
  { label: 'Matching chunk limit', path: ['limits', 'matchingChunks'] },
];
function metricValue(coverage, metric) {
  const source = coverage?.data || coverage;
  const value = metric.path.reduce((current, key) => current?.[key], source);
  return value === undefined || value === null ? 'Unavailable' : Number(value).toLocaleString('en-PH');
}

export default function Data() {
  const navigate = useNavigate(); const [search, setSearch] = useState(''); const [coverage, setCoverage] = useState(null); const [sync, setSync] = useState('Checking availability…');
  useEffect(() => { const controller = new AbortController(); publicData('/coverage', { signal: controller.signal }).then(result => { const payload = apiData(result); setCoverage(payload); setSync(result.retrievedAt ? `Last checked ${new Date(result.retrievedAt).toLocaleString('en-PH')}` : 'Snapshot available through the public statistics service.'); }).catch(() => setSync('Public statistics service status unavailable.')); return () => controller.abort(); }, []);
  const submit = event => { event.preventDefault(); navigate(`/data/datasets${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`); };
  return <main className="public-data-page">
    <section className="data-intro"><div className="container"><p className="data-eyebrow">PUBLIC DATA PORTAL</p><h1>Philippines Open Data &amp; Statistics</h1><p>Explore demographic, economic, agricultural, geographic, and other public statistics from across the Philippines.</p><form className="data-hero-search" onSubmit={submit}><Search size={20} aria-hidden="true" /><input aria-label="Search datasets" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search population, agriculture, employment, education..." /><button>Search</button></form><div className="data-hero-links"><Link to="/data/datasets#topics">Browse topics</Link><Link to="/data/datasets">Dataset Explorer <ArrowRight size={15} /></Link><a href="#about-data">Data source &amp; methodology</a><span>{sync}</span></div></div></section>
    <section className="container data-section"><div className="section-heading"><div><p className="data-eyebrow">PHILIPPINES AT A GLANCE</p><h2>Available statistical indicators</h2></div><span>Coverage from the public data service.</span></div><div className="glance-grid">{metricLabels.map(metric => <button type="button" className="metric" key={metric.label} onClick={() => navigate('/data/datasets')}><span>{metric.label}</span><strong>{metricValue(coverage, metric)}</strong><small>{coverage?.source || 'Public statistics service'}</small></button>)}</div></section>
    <section className="container data-section" id="topics"><div className="section-heading"><div><p className="data-eyebrow">EXPLORE DATA</p><h2>Browse by topic</h2></div></div><nav className="topic-grid" aria-label="Dataset topics">{categories.map(topic => <Link key={topic} to={`/data/datasets?topic=${encodeURIComponent(topic)}`}>{topic}<ArrowRight size={16} /></Link>)}</nav></section>
    <section className="container data-section data-callout"><Database size={28} aria-hidden="true" /><div><h2>Find a public dataset</h2><p>Search the catalog, inspect release information, and query only the observations you need.</p></div><Link className="data-primary-link" to="/data/datasets"><SlidersHorizontal size={17} /> Open Dataset Explorer</Link></section>
    <section className="container data-about" id="about-data"><h2>About the data</h2><p>Statistical information displayed on this portal is retrieved from public datasets and saved releases provided by external statistical sources. Dataset availability and release dates may differ from the latest publication of the originating agency. Refer to the cited source for official definitions and methodology.</p></section>
  </main>;
}
