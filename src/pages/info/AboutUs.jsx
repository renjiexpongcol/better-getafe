import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Landmark, Eye, Target, Users, Goal,
  MapPin, Ruler, Layers, Wallet, TrendingUp,
  Home, BarChart3, Navigation, Search, Percent, ArrowUpRight,
  ArrowDownRight, Mountain, Flag, Compass, Database, Info, Wheat,
  Sprout, Loader2, Ship, Sun,
} from 'lucide-react'
import {
  overview, barangayStats, barangayTotals, incomeData, householdData,
  ageData, ageGroupSummary, historicalPopulation, nearestTowns, nearestCities,
  manilaDistance, proportionalShares, notes,
} from '../../data/getafe'

const facts = [
  { label: 'Founded / Incorporated', value: 'Coastal municipality' },
  { label: 'Population (2020)', value: overview.population2020.toLocaleString() },
  { label: 'Land area', value: `${overview.landAreaKm2.toLocaleString()} km²` },
  { label: 'Barangays', value: String(overview.barangayCount) },
]

const goals = [
  'Eradicate extreme poverty and hunger',
  'Promote gender equality',
  'Ensure environmental sustainability',
  'Sustain financial stability of the LGU',
  'Upgrade quality of service through human resource management',
  'Uplift education, health and nutrition status of all Getafenons',
  'Population management',
  'A well-coordinated executive-legislative agenda',
  'Expand employment generation activities and upgrade the capability of the labor sector',
  'Reduce crime incidence and eradicate all illegal activities',
  'Ensure strong government support to marketing network',
  'Provide livelihood opportunities through access to skills training and entrepreneurship',
  'Establish livelihood information and learning center and resource database',
  'Establish agro-industrial promotion center',
  'Develop tourism destination package',
  'Promote eco-tourism and cultural exchange tour program',
]

const MISSION =
  'A Physically and Mentally Participative and Empowered \u201cGetafenhon\u201d Possessing an Enterprising Spirit in Agro-Industrial Development Living in a Peaceful and Ecologically Managed and Sustained Environment.'

const VISION = 'To accelerate the Economic, Social and Political Gains Getafe has sustained.'

const distanceFacts = [
  { label: 'From Tagbilaran (Capital)', value: '± 92 km via cemented highway' },
  { label: 'Nearest point to Cebu', value: 'Closest in Bohol to Cebu City' },
  { label: 'Southern border', value: 'Buenavista' },
  { label: 'Eastern border', value: 'Talibon' },
  { label: 'North & West border', value: 'Bohol Strait' },
]

const weatherFacts = [
  { label: 'Climate type', value: 'Type IV (Philippine Climatological)' },
  { label: 'Average temperature', value: '28.6 °C' },
  { label: 'Coldest months', value: 'Nov, Dec & Jan (± 26.5 °C)' },
  { label: 'Humidity', value: 'More or less even year-round' },
  { label: 'Character', value: 'No pronounced wet or dry season' },
]

const soilTypes = [
  { name: 'Ubay Clay Loam', pct: '42.82%', note: 'Covers the most area' },
  { name: 'Candijay Clay Loam', pct: '—', note: 'Dominant in the locality' },
  { name: 'Baluarte Clay', pct: '—', note: 'Dominant in the locality' },
  { name: 'Corte Clay', pct: '—', note: 'Dominant in the locality' },
  { name: 'Beach Sand', pct: '—', note: 'Coastal areas' },
  { name: 'Stony Sand', pct: '—', note: 'Coastal / hilly areas' },
]

const islandBarangays = [
  { name: 'Alumar', area: '351.50' },
  { name: 'Banacon & Jagoliao', area: '1,775.00' },
  { name: 'Handumon', area: '456.00' },
  { name: 'Jandayan Norte', area: '510.10' },
  { name: 'Jandayan Sur', area: '538.00' },
  { name: 'Mahanay', area: '826.50' },
  { name: 'Nasingin', area: '1,625.80' },
  { name: 'Pandanon', area: '149.00' },
]

const uplandBarangays = [
  { name: 'Buyog', area: '678.00' },
  { name: 'Cabasakan', area: '522.40' },
  { name: 'Cangmundo', area: '2,542.50' },
  { name: 'Campao Oriental', area: '370.40' },
  { name: 'Sto. Niño', area: '1,762.60' },
]

const coastalBarangays = [
  { name: 'Campao Occidental', area: '103.00' },
  { name: 'Corte Baud', area: '165.20' },
  { name: 'Poblacion', area: '279.40' },
  { name: 'Saguise', area: '330.20' },
  { name: 'Salog & CPG', area: '419.50' },
  { name: 'San Jose', area: '627.90' },
  { name: 'Taytay', area: '248.60' },
  { name: 'Tugas', area: '214.10' },
  { name: 'Tulang', area: '1,088.30' },
]

const hazardMaps = [
  { name: 'Earthquake Induced Landslide', icon: '/assets/vector/landslide.png', url: 'http://www.ppdobohol.lgu.ph/maps/hazard-maps/earthquake-induced-landslide/getafe/' },
  { name: 'Ground Shaking', icon: '/assets/vector/earthquake.png', url: 'http://www.ppdobohol.lgu.ph/maps/hazard-maps/ground-shaking/getafe/' },
  { name: 'Liquefaction', icon: '/assets/vector/liquefaction.png', url: 'http://www.ppdobohol.lgu.ph/maps/hazard-maps/liquefaction/getafe/' },
  { name: 'Rain Induced Landslide', icon: '/assets/vector/rain.png', url: 'http://www.ppdobohol.lgu.ph/maps/hazard-maps/rain-induced-landslide/getafe/' },
  { name: 'Tsunami', icon: '/assets/vector/wave.png', url: 'http://www.ppdobohol.lgu.ph/maps/hazard-maps/tsunami/getafe/' },
]

function BarangayTable({ title, rows }) {
  return (
    <div className="land-area-table">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>Barangay</th>
            <th className="land-area-num">Area (hectare)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="land-area-num">{r.area}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const formatPeso = (n) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatNumber = (n) => n.toLocaleString('en-PH');

function SectionHead({ kicker, title, sub }) {
  return (
    <div className="getafe-section-head">
      <p className="getafe-kicker">{kicker}</p>
      <h2>{title}</h2>
      {sub && <p className="getafe-sub">{sub}</p>}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="getafe-stat">
      <span className={`getafe-stat-icon ${accent || ''}`}><Icon size={20} /></span>
      <span className="getafe-stat-label">{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

const maxIncome = Math.max(...incomeData.map((d) => d.income));
const maxAge = Math.max(...ageData.map((d) => d.population));
const maxHist = Math.max(...historicalPopulation.map((d) => d.population));
const brgyId = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export default function AboutUs() {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('pop2020');
  const [sortDir, setSortDir] = useState('desc');
  const rows = useMemo(() => {
    let list = barangayStats.filter((b) =>
      b.name.toLowerCase().includes(query.trim().toLowerCase())
    );
    list = [...list].sort((a, b) => {
      const av = sortKey === 'name' ? a.name : a[sortKey];
      const bv = sortKey === 'name' ? b.name : b[sortKey];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [query, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  return (
    <main id="about-us">
      <section className="about-hero">
        <div className="about-hero-bg">
          <img src="/assets/pages/bg/about-municipality.png" alt="Aerial view of the coastal town of Getafe, Bohol" />
          <div className="about-hero-overlay" />
        </div>
        <div className="container about-hero-inner">
          <p className="about-hero-kicker">Municipality of Getafe • Bohol</p>
          <h1>About the Municipality</h1>
          <p className="about-hero-sub">The local government of Getafe, Bohol — serving every Getafeño.</p>
        </div>
      </section>

      <div className="content-page container">
        <div className="about-hero-card">
          <img src="/assets/getafe-seal.png" alt="Municipality of Getafe seal" className="about-seal" />
          <div>
            <p className="about-kicker">Municipality of Getafe • Bohol</p>
            <h2>One town, one people.</h2>
            <p>
              Getafe is a coastal municipality in the island province of Bohol. As one town and one people, we are
              honored to serve our citizens through accessible, transparent, and people-centered governance — from
              the town proper of Poblacion to the farthest islets of our archipelago.
            </p>
          </div>
        </div>

        <div className="about-facts">
          {facts.map((f) => (
            <div className="about-fact" key={f.label}>
              <span>{f.label}</span>
              <strong>{f.value}</strong>
            </div>
          ))}
        </div>

        <div className="about-grid">
          <div className="about-card">
            <span className="getafe-stat-icon teal"><Target size={20} /></span>
            <h3>Our Mission</h3>
            <p>{MISSION}</p>
          </div>
          <div className="about-card">
            <span className="getafe-stat-icon violet"><Eye size={20} /></span>
            <h3>Our Vision</h3>
            <p>{VISION}</p>
          </div>
          <div className="about-card">
            <span className="getafe-stat-icon green"><Users size={20} /></span>
            <h3>Who we serve</h3>
            <p>
              Home to {overview.population2020.toLocaleString()} people across {overview.barangayCount} barangays —
              farmers, fishers, entrepreneurs, and families — we serve residents and visitors alike.
            </p>
          </div>
        </div>

        {/* Goals */}
        <section className="about-goals">
          <div className="about-goals-head">
            <span className="getafe-stat-icon blue"><Goal size={22} /></span>
            <div>
              <h2>Our Goals</h2>
              <p>The development goals that guide the Municipality of Getafe.</p>
            </div>
          </div>
          <div className="about-goals-grid">
            {goals.map((goal, i) => (
              <div className="about-goal-item" key={goal}>
                <span className="about-goal-num">{i + 1}</span>
                <p>{goal}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ===== Getafe statistical profile ===== */}
      <section className="getafe-section getafe-overview" id="getafe-profile">
        <div className="container">
          <div className="getafe-stats-grid">
            <StatCard icon={Ruler} accent="blue" label="Land area" value={`${overview.landAreaKm2.toLocaleString()} km²`} sub={`${overview.landAreaSqMi.toLocaleString()} sq mi • ${overview.landAreaShareBohol} of Bohol`} />
            <StatCard icon={Users} accent="teal" label="Population (2020)" value={formatNumber(overview.population2020)} sub={`${overview.populationShareBohol} of Bohol • ${overview.populationShareRegion} of Region VII`} />
            <StatCard icon={Home} accent="green" label="Population density" value={`${overview.densityPerKm2} / km²`} sub={`${overview.densityPerSqMi} per sq mi`} />
            <StatCard icon={Layers} accent="violet" label="Barangays" value={overview.barangayCount} sub="Local government units" />
          </div>

          <div className="getafe-prose">
            <p>
              <strong>Getafe</strong> is a coastal municipality in the island province of{' '}
              <strong>Bohol</strong>. The municipality has a land area of{' '}
              <strong>{overview.landAreaKm2.toLocaleString()} square kilometers</strong> or{' '}
              {overview.landAreaSqMi.toLocaleString()} square miles, which constitutes{' '}
              {overview.landAreaShareBohol} of Bohol's total area. Its population as determined by the{' '}
              <strong>2020 Census</strong> was <strong>{formatNumber(overview.population2020)}</strong>.
            </p>
            <p>
              This represented {overview.populationShareBohol} of the total population of Bohol province, or{' '}
              {overview.populationShareRegion} of the overall population of the Central Visayas region. Based on
              these figures, the population density is computed at{' '}
              <strong>{overview.densityPerKm2} inhabitants per square kilometer</strong> or{' '}
              {overview.densityPerSqMi} inhabitants per square mile.
            </p>
          </div>

          <div className="getafe-profile-facts">
            <div><span>Postal code</span><strong>{overview.postalCode}</strong></div>
            <div><span>Classification</span><strong>Coastal municipality</strong></div>
            <div><span>Marine waterbodies</span><strong>{overview.marineWaterbodies}</strong></div>
            <div><span>Island group</span><strong>{overview.islandGroup}</strong></div>
            <div><span>Region</span><strong>{overview.region}</strong></div>
            <div><span>Province</span><strong>{overview.province}</strong></div>
            <div><span>Coordinates</span><strong>{overview.coordinates}</strong></div>
            <div><span>Elevation (amsl)</span><strong>{overview.elevationM} m · {overview.elevationFt} ft</strong></div>
          </div>
        </div>
      </section>

      {/* Barangays */}
      <section className="getafe-section getafe-section-alt">
        <div className="container">
          <SectionHead
            kicker="Local government units"
            title="Barangays of Getafe"
            sub="Getafe has 24 barangays. Search or sort the table below — touch a column header to reorder."
          />

          <div className="getafe-table-tools">
            <div className="getafe-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search barangay…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search barangays"
              />
            </div>
            <span className="getafe-table-count">{rows.length} of {barangayStats.length} barangays</span>
          </div>

          <div className="getafe-table-wrap">
            <table className="getafe-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleSort('name')} aria-sort={sortKey === 'name' ? sortDir : 'none'}>
                    Barangay {sortKey === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="sortable num" onClick={() => toggleSort('pop2020')} aria-sort={sortKey === 'pop2020' ? sortDir : 'none'}>
                    Pop. (2020) {sortKey === 'pop2020' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="sortable num" onClick={() => toggleSort('pop2015')} aria-sort={sortKey === 'pop2015' ? sortDir : 'none'}>
                    Pop. (2015) {sortKey === 'pop2015' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="sortable num" onClick={() => toggleSort('change')} aria-sort={sortKey === 'change' ? sortDir : 'none'}>
                    Change {sortKey === 'change' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="sortable num" onClick={() => toggleSort('growth')} aria-sort={sortKey === 'growth' ? sortDir : 'none'}>
                    Growth rate {sortKey === 'growth' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const neg = b.change.startsWith('-');
                  return (
                    <tr key={b.name}>
                      <td className="getafe-brgy-name">
                        <Link to={`/services/barangays?brgy=${brgyId(b.name)}`} className="getafe-brgy-link">
                          {b.name}
                        </Link>
                      </td>
                      <td className="num">{formatNumber(b.pop2020)}</td>
                      <td className="num">{formatNumber(b.pop2015)}</td>
                      <td className={`num ${neg ? 'down' : 'up'}`}>
                        {neg ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{b.change}
                      </td>
                      <td className={`num ${b.growth.startsWith('-') ? 'down' : 'up'}`}>{b.growth}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="getafe-empty">No barangays match “{query}”.</td></tr>
                )}
              </tbody>
              {rows.length === barangayStats.length && (
                <tfoot>
                  <tr>
                    <td className="getafe-brgy-name"><strong>Getafe Total</strong></td>
                    <td className="num"><strong>{formatNumber(barangayTotals.pop2020)}</strong></td>
                    <td className="num"><strong>{formatNumber(barangayTotals.pop2015)}</strong></td>
                    <td className="num up"><strong>{barangayTotals.change}</strong></td>
                    <td className="num up"><strong>{barangayTotals.growth}</strong></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </section>

      {/* Economy */}
      <section className="getafe-section">
        <div className="container">
          <SectionHead kicker="Economy" title="Municipal income" sub="Annual regular income of Getafe, fiscal years 2009–2016." />

          <div className="getafe-income-grid">
            <div className="getafe-income-highlight">
              <span className="getafe-income-icon"><Wallet size={22} /></span>
              <small>Annual regular revenue (FY 2016)</small>
              <strong>{formatPeso(overview.income2016)}</strong>
              <span className="getafe-income-trend"><TrendingUp size={15} /> +7.86% vs. 2015</span>
            </div>
            <div className="getafe-chart">
              <p className="getafe-chart-title">Income by fiscal year</p>
              <div className="getafe-bars">
                {incomeData.map((d) => (
                  <div className="getafe-bar-row" key={d.year}>
                    <span className="getafe-bar-year">{d.year}</span>
                    <div className="getafe-bar-track">
                      <div
                        className="getafe-bar-fill"
                        style={{ width: `${(d.income / maxIncome) * 100}%` }}
                        title={`${d.year}: ${formatPeso(d.income)}`}
                      />
                    </div>
                    <span className="getafe-bar-val">₱{(d.income / 1e6).toFixed(1)}M</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="getafe-table-wrap getafe-income-table">
            <table className="getafe-table">
              <thead>
                <tr>
                  <th>Fiscal year</th>
                  <th className="num">Annual regular income</th>
                  <th className="num">Change</th>
                </tr>
              </thead>
              <tbody>
                {incomeData.map((d) => (
                  <tr key={d.year}>
                    <td>{d.year}</td>
                    <td className="num">{formatPeso(d.income)}</td>
                    <td className={`num ${d.change && d.change.startsWith('-') ? 'down' : 'up'}`}>
                      {d.change ? (
                        <>{d.change.startsWith('-') ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{d.change}</>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="getafe-footnote">
            <strong>Annual Regular Income</strong> = Locally Sourced Revenue + Internal Revenue Allotment (IRA)
            Current Year + Other Shares from National Tax Collection. <strong>Locally Sourced Revenue</strong> =
            Real Property Tax (General Fund) + Tax on Business + Other Taxes + Regulatory Fees + Service/User
            Charges + Receipts from Economic Enterprises.
          </p>
        </div>
      </section>

      {/* Demographics */}
      <section className="getafe-section getafe-section-alt">
        <div className="container">
          <SectionHead kicker="Demographics" title="People of Getafe" sub="Households, age structure, and population growth." />

          <div className="getafe-age-grid">
            <div className="getafe-chart getafe-age-chart">
              <p className="getafe-chart-title">Population by age group (2015 census)</p>
              {ageData.map((a) => (
                <div className="getafe-age-row" key={a.group}>
                  <span className="getafe-age-label">{a.group}</span>
                  <div className="getafe-bar-track">
                    <div className="getafe-bar-fill age" style={{ width: `${(a.population / maxAge) * 100}%` }} />
                  </div>
                  <span className="getafe-age-val">{formatNumber(a.population)} · {a.pct}</span>
                </div>
              ))}
            </div>

            <div className="getafe-age-summary">
              <div className="getafe-summary-card">
                <h3><BarChart3 size={17} /> Age group summary</h3>
                {[
                  { label: `Young dependents (${ageGroupSummary.youngDependents.label})`, pct: ageGroupSummary.youngDependents.pct, count: ageGroupSummary.youngDependents.count, color: 'blue' },
                  { label: `Economically active (${ageGroupSummary.economicallyActive.label})`, pct: ageGroupSummary.economicallyActive.pct, count: ageGroupSummary.economicallyActive.count, color: 'teal' },
                  { label: `Senior citizens (${ageGroupSummary.seniorCitizens.label})`, pct: ageGroupSummary.seniorCitizens.pct, count: ageGroupSummary.seniorCitizens.count, color: 'amber' },
                ].map((row) => (
                  <div className="getafe-summary-row" key={row.label}>
                    <span>{row.label}</span>
                    <div className="getafe-summary-meta">
                      <strong>{row.pct}</strong>
                      <small>{formatNumber(row.count)} people</small>
                    </div>
                  </div>
                ))}
                <div className="getafe-summary-facts">
                  <div><span>Median age</span><strong>{ageGroupSummary.medianAge}</strong></div>
                  <div><span>Youth dep. ratio</span><strong>{ageGroupSummary.youthDependencyRatio}</strong></div>
                  <div><span>Old-age dep. ratio</span><strong>{ageGroupSummary.oldAgeDependencyRatio}</strong></div>
                  <div><span>Total dep. ratio</span><strong>{ageGroupSummary.totalDependencyRatio}</strong></div>
                </div>
                <p className="getafe-summary-note">
                  The age group with the highest population is <strong>5 to 9</strong> (3,780), and the
                  lowest is <strong>80 and over</strong> (242). Half the population is younger than 22.
                </p>
              </div>

              <div className="getafe-summary-card">
                <h3><Users size={17} /> Registered voters (2019)</h3>
                <div className="getafe-voters">
                  <strong>{formatNumber(overview.voters2019)}</strong>
                  <span>total electorate</span>
                </div>
                <div className="getafe-summary-facts two">
                  <div><span>Male</span><strong>{formatNumber(overview.votersMale2019)}</strong></div>
                  <div><span>Female</span><strong>{formatNumber(overview.votersFemale2019)}</strong></div>
                </div>
              </div>
            </div>
          </div>

          <div className="getafe-subblock">
            <h3 className="getafe-subblock-title"><Home size={17} /> Households</h3>
            <p className="getafe-subblock-lead">
              The household population of Getafe in the 2015 Census was 30,955, broken down into{' '}
              <strong>6,487 households</strong> or an average of <strong>4.77 members per household</strong>.
            </p>
            <div className="getafe-table-wrap">
              <table className="getafe-table">
                <thead>
                  <tr>
                    <th>Census date</th>
                    <th className="num">Household population</th>
                    <th className="num">Number of households</th>
                    <th className="num">Average household size</th>
                  </tr>
                </thead>
                <tbody>
                  {householdData.map((h) => (
                    <tr key={h.census}>
                      <td>{h.census}</td>
                      <td className="num">{formatNumber(h.population)}</td>
                      <td className="num">{formatNumber(h.households)}</td>
                      <td className="num">{h.size.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="getafe-subblock">
            <h3 className="getafe-subblock-title"><Flag size={17} /> Historical population</h3>
            <p className="getafe-subblock-lead">
              The population of Getafe grew from <strong>4,331 in 1903</strong> to{' '}
              <strong>33,422 in 2020</strong> — an increase of 29,091 people over 117 years. The latest census
              figures denote a positive annualized growth rate of <strong>1.63%</strong>.
            </p>
            <div className="getafe-hist-chart">
              {historicalPopulation.map((h) => (
                <div className="getafe-hist-col" key={h.census} title={`${h.census}: ${formatNumber(h.population)}`}>
                  <span className="getafe-hist-val">{h.population >= 10000 ? `${(h.population / 1000).toFixed(1)}k` : formatNumber(h.population)}</span>
                  <div
                    className="getafe-hist-bar"
                    style={{ height: `${Math.max(6, (h.population / maxHist) * 100)}%` }}
                  >
                    {h.population === maxHist && <span className="getafe-hist-now">now</span>}
                  </div>
                  <span className="getafe-hist-year">{h.census.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Location & distances */}
      <section className="getafe-section">
        <div className="container">
          <SectionHead kicker="Location" title="Where Getafe is" sub="Coordinates, elevation, and distances from neighboring towns and cities." />

          <div className="getafe-loc-grid">
            <div className="getafe-loc-card">
              <span className="getafe-loc-icon"><Compass size={20} /></span>
              <div>
                <h3>Coordinates</h3>
                <p>The municipal center is at approximately <strong>{overview.coordinates}</strong> on the island of Bohol.</p>
                <p>Elevation is estimated at <strong>{overview.elevationM} m</strong> ({overview.elevationFt} ft) above mean sea level.</p>
              </div>
            </div>
            <div className="getafe-loc-card">
              <span className="getafe-loc-icon"><Navigation size={20} /></span>
              <div>
                <h3>From Manila</h3>
                <p>Distance from the national capital: <strong>{manilaDistance.km} km</strong> ({manilaDistance.mi} mi), to the {manilaDistance.dir} ({manilaDistance.bearing}).</p>
                <p>Distances below are based on the great-circle distance between points.</p>
              </div>
            </div>
          </div>

          <div className="getafe-dist-grid">
            <div className="getafe-dist-col">
              <h3 className="getafe-dist-title"><MapPin size={16} /> Nearest towns</h3>
              <ul className="getafe-dist-list">
                {nearestTowns.map((t) => (
                  <li key={t.name}>
                    <strong>{t.name}</strong>
                    <span>{t.km} km ({t.mi} mi) · {t.dir} ({t.bearing})</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="getafe-dist-col">
              <h3 className="getafe-dist-title"><Landmark size={16} /> Nearest cities</h3>
              <ul className="getafe-dist-list">
                {nearestCities.map((c) => (
                  <li key={c.name}>
                    <strong>{c.name}</strong>
                    <span>{c.km} km ({c.mi} mi) · {c.dir} ({c.bearing})</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="getafe-physical">
            <span className="getafe-physical-icon"><Mountain size={18} /></span>
            <div>
              <h3>Nearby physical feature</h3>
              <p><strong>Lauis Point</strong> (Bohol Island), 13.48 km (8.38 mi) to the South-West (S48°W).</p>
            </div>
          </div>
        </div>
      </section>

      {/* Proportional share */}
      <section className="getafe-section getafe-section-alt">
        <div className="container">
          <SectionHead kicker="Proportional share & distribution" title="Getafe in context" sub="How Getafe contributes to its parent administrative divisions." />

          <div className="getafe-share-grid">
            <div className="getafe-share-card">
              <h3><Percent size={17} /> Population share ({formatNumber(overview.population2020)})</h3>
              <ul>
                {proportionalShares.population.map((s) => (
                  <li key={s.label}>
                    <span>{s.label}</span>
                    <div><strong>{s.share}</strong><small>of {s.of}</small></div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="getafe-share-card">
              <h3><Database size={17} /> Barangay count share ({overview.barangayCount} barangays)</h3>
              <ul>
                {proportionalShares.barangays.map((s) => (
                  <li key={s.label}>
                    <span>{s.label}</span>
                    <div><strong>{s.share}</strong><small>of {s.of}</small></div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Location & Geography ===== */}
      <div className="content-page container">
        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><img src="/assets/vector/location.png" alt="" className="history-head-icon-img" /></span>
            <div>
              <h2>Location</h2>
              <p>Getafe, known before as "Jetafe", is a port town of Bohol.</p>
            </div>
          </div>

          <div className="history-article">
            <img src="https://www.getafe.gov.ph/_img/imgLocation.jpg" alt="Getafe, Bohol" className="history-img" />
            <div className="history-prose">
              <p>
                Getafe, known before as <strong>"Jetafe"</strong>, is a port town of Bohol in the Philippines. It
                lies on the northern coast about <strong>92 kilometers</strong> in a fully-cemented highway from the
                capital city of Tagbilaran. It shares its political boundaries with the following municipalities:{" "}
                <strong>Buenavista</strong> on the southern side, <strong>Talibon</strong> on the eastern side, and
                in the northern and western side is bounded by the <strong>Bohol Strait</strong>.
              </p>
              <p>
                It is the nearest point from Bohol to the center of trade, industry and culture which is{" "}
                <strong>Cebu City</strong>. In fact, on a clear and sunny day, the tall buildings and the longish
                island of Cebu can be clearly seen. At night, the countless glowing lights of Metropolitan Cebu
                have a mesmerizing effect on viewers especially on top of <strong>Verador Hill</strong>.
              </p>
              <p>
                The town gained recognition because of its <strong>man-made mangrove forest</strong> — the largest
                in the country, and in Asia. The mangrove forest is located at <strong>Banacon Island</strong> and
                has become an eco-tourist destination. Like the rest of Bohol province, Getafe enjoys good weather
                conditions and a climate conducive to farming and other activities. The people are friendly,
                accommodating and deeply religious. Their warm and vibrant faith revolves around their Patron{" "}
                <strong>Sr. Santo Niño</strong>, whose feast day falls on the month of January.
              </p>
            </div>
          </div>

          <div className="location-facts">
            {distanceFacts.map((f) => (
              <div className="location-fact" key={f.label}>
                <span>{f.label}</span>
                <strong>{f.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><img src="/assets/vector/location.png" alt="" className="history-head-icon-img" /></span>
            <div>
              <h2>Road Network</h2>
              <p>See the municipal road and coastal layout of Getafe.</p>
            </div>
          </div>

          <div className="location-map">
            <a href="https://www.getafe.gov.ph/_asset/map/mapGetafeL.pdf" target="_blank" rel="noopener noreferrer">
              <img src="https://www.getafe.gov.ph/_img/mapGetafeS.jpg" alt="Map of Getafe, Bohol" className="location-map-img" />
            </a>
            <p className="location-map-cap">
              <Ship size={14} /> Map of Getafe — click to open the full-size PDF map.
            </p>
          </div>
        </section>

        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><img src="/assets/vector/location.png" alt="" className="history-head-icon-img" /></span>
            <div>
              <h2>Weather & Climate</h2>
              <p>A type IV climate — no pronounced wet or dry season.</p>
            </div>
          </div>

          <div className="history-article">
            <img src="https://www.getafe.gov.ph/_img/imgSlope.jpg" alt="Getafe weather and terrain" className="history-img" />
            <div className="history-prose">
              <p>
                The climate of Getafe is classified as <strong>type IV</strong> of the Philippine Climatological
                condition. There is no pronounced wet or dry season. Climate condition is characterized by maximum
                rain periods and relatively short dry season. The most common air currents are the{" "}
                <strong>Northeast monsoon</strong> (from the high pressure area of Asia); the{" "}
                <strong>trade winds</strong> (from the Pacific); and the <strong>Southwest monsoon</strong> (from
                the Southern Hemisphere).
              </p>
              <p>
                The general direction of winds from these sources are from North to East (October to January); from
                East to Southeast (February to April); and southerly (May to September). The average temperature is{" "}
                <strong>28.6 degrees Celsius</strong>.
              </p>
              <p>
                The months of <strong>November, December and January</strong> are the coldest with an average of{" "}
                <strong>26.5 degrees Celsius</strong>. Relative humidity is more or less even all throughout the
                year. Generally, it is moderately warm and dry during daytime and generally cool at night.
              </p>
            </div>
          </div>

          <div className="location-facts">
            {weatherFacts.map((f) => (
              <div className="location-fact" key={f.label}>
                <span>{f.label}</span>
                <strong>{f.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><img src="/assets/vector/location.png" alt="" className="history-head-icon-img" /></span>
            <div>
              <h2>Slope & Terrain</h2>
              <p>Moderately undulating and rolling land sloping in many directions.</p>
            </div>
          </div>

          <div className="location-two-col">
            <div className="location-card">
              <span className="getafe-stat-icon blue"><Mountain size={20} /></span>
              <h3>Moderate to Rolling (8–15%)</h3>
              <p>
                The dominant slope covering about <strong>20.65%</strong> of the total land area. These areas are
                very noticeable on the trip of flat level lands running alongside the coastline, and are located in
                the inland barangays.
              </p>
            </div>
            <div className="location-card">
              <span className="getafe-stat-icon teal"><Layers size={20} /></span>
              <h3>Level to Nearly Level (0–3%)</h3>
              <p>
                The coastal barangays in the northern side are generally level to nearly level land, having slopes
                of 0–3%, comprising <strong>50.37%</strong> of the total land area.
              </p>
            </div>
            <div className="location-card">
              <span className="getafe-stat-icon violet"><Mountain size={20} /></span>
              <h3>Mountainous & Hilly</h3>
              <p>
                Coastal barangays in the western side — <strong>Brgys. Campao Oriental, Corte-Baud and Tugas</strong>{" "}
                — are generally mountainous and hilly.
              </p>
            </div>
          </div>
        </section>

        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><img src="/assets/vector/location.png" alt="" className="history-head-icon-img" /></span>
            <div>
              <h2>Soil Types</h2>
              <p>The soils that make Getafe's farmland fertile — and prone to erosion.</p>
            </div>
          </div>

          <div className="history-article">
            <img src="https://www.getafe.gov.ph/_img/imgSlope.jpg" alt="Getafe soil and terrain" className="history-img" />
            <div className="history-prose">
              <p>
                Four types of soil are found dominant in the locality: <strong>Candijay Clay Loam</strong>,{" "}
                <strong>Baluarte Clay</strong>, <strong>Corte Clay</strong>, <strong>Beach Sand</strong>,{" "}
                <strong>Stony Sand</strong> and <strong>Ubay Clay Loam</strong>. Ubay Clay Loam covers the most area
                as this soil type comprises <strong>42.82%</strong> of the total land area.
              </p>
              <p>
                The soil type and slope are factors that basically make more areas in the municipality predominantly
                susceptible to erosion — as this category covers <strong>37.33%</strong> of the total area.
              </p>
            </div>
          </div>

          <div className="soil-grid">
            {soilTypes.map((s) => (
              <div className="soil-card" key={s.name}>
                <span className="soil-icon"><Sun size={16} /></span>
                <h3>{s.name}</h3>
                {s.pct !== '—' && <strong className="soil-pct">{s.pct} of land area</strong>}
                <p>{s.note}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><img src="/assets/vector/location.png" alt="" className="history-head-icon-img" /></span>
            <div>
              <h2>Land Area</h2>
              <p>15,584 hectares across 24 barangays — about 3.78% of Bohol's total land area.</p>
            </div>
          </div>

          <div className="history-prose">
            <p>
              Getafe has, at present, <strong>24 barangays</strong> with a total land area of{" "}
              <strong>15,584 hectares</strong>. It presents about <strong>3.78 percent</strong> of Bohol's total
              land area which is <strong>411,726.8 hectares</strong>.
            </p>
            <p>
              These could have been more had <strong>Buenavista</strong>, a daughter town of Getafe, did not opt to
              separate in 1960.
            </p>
          </div>

          <div className="land-area-grid">
            <BarangayTable title="Island Barangays" rows={islandBarangays} />
            <BarangayTable title="Upland Barangays" rows={uplandBarangays} />
            <BarangayTable title="Coastal Barangays" rows={coastalBarangays} />
          </div>
        </section>

        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><img src="/assets/vector/location.png" alt="" className="history-head-icon-img" /></span>
            <div>
              <h2>Hazard Maps</h2>
              <p>Geologic hazard maps for Getafe from the Bohol Provincial Planning & Development Office.</p>
            </div>
          </div>

          <div className="hazard-grid">
            {hazardMaps.map((h) => (
              <a
                key={h.name}
                href={h.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hazard-card"
              >
                {h.icon && <img src={h.icon} alt="" className="hazard-card-icon-img" />}
                <div>
                  <strong>{h.name}</strong>
                  <span>Open hazard map →</span>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>

      {/* Notes */}
      <section className="getafe-section">
        <div className="container">
          <div className="getafe-notes">
            <h3><Info size={17} /> Notes</h3>
            <ol>
              {notes.map((n, i) => <li key={i}>{n}</li>)}
            </ol>
          </div>
        </div>
      </section>

    </main>
  )
}
