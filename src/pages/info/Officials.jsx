import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Landmark, Users, MapPin, Building2 } from 'lucide-react'
import { barangays } from '../../data/barangays'
const officialId = (name) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// Placeholder avatar used until an official's photo is provided.
// In the future the CMS will supply each official's photo URL, which will
// replace this placeholder (pass it via the `photo` prop).
const PLACEHOLDER = '/assets/brgy-user-vector/profile-circle.svg'

const mayor = { name: 'Cary M. Camacho, MPM', role: 'Municipal Mayor' }
const viceMayor = { name: 'Casey Shaun M. Camacho', role: 'Municipal Vice-Mayor' }

const sbMembers = [
  { name: 'Ramil T. Botero', role: 'SB Member' },
  { name: 'Eduardo A. Torremocha', role: 'SB Member' },
  { name: 'Marcelino C. Mejias', role: 'SB Member' },
  { name: 'Jonas T. Socias', role: 'SB Member' },
  { name: 'Mario P. Monillas', role: 'SB Member' },
  { name: 'Prince Dayaw G. Lugod', role: 'SB Member' },
  { name: 'Felipe S. Pogoy', role: 'SB Member' },
  { name: 'Norberto B. Caba\u00f1ero', role: 'SB Member' },
]

const abcPresident = { name: 'Cydon Cariso M. Camacho II', role: 'ABC President' }

const deptHeads = [
  { name: 'Diana Y. Camacho, RN', role: 'Municipal Administrator' },
  { name: 'Arlene T. Renegado', role: 'Municipal Treasurer' },
  { name: 'Ma. Luchie L. Valcorza', role: 'Municipal Assessor' },
  { name: 'Atty. Jairus T. Socias, CPA', role: 'Municipal Accountant' },
  { name: 'Elvira L. Ego-ogan', role: 'Municipal Budget Officer' },
  { name: 'Engr. Amadeus T. Masecampo', role: 'Municipal Engineer' },
  { name: 'Wilma J. Monillas', role: "Municipal Planning & Dev't. Coordinator" },
  { name: 'Erlinda Deryl Estrella', role: 'Local Civil Registrar' },
  { name: 'Dr. Raye Angeli Abella', role: 'Municipal Health Officer' },
  { name: 'Jessa Mae V. Balaba', role: 'Municipal Social Welfare Officer' },
  { name: 'Jesfer N. Camacho, RN', role: 'Secretary to the Sangguniang Bayan' },
]

function OfficialCard({ name, role, lead, photo, biography }) {
  return (
    <div className={lead ? 'official-card lead' : 'official-card'}>
      <img src={photo || PLACEHOLDER} alt={`${name} profile`} className="official-img" />
      <div>
        <Link to={`/info/officials/${officialId(name)}`}><strong>{name}</strong></Link>
        <span>{role}</span>
      </div>
    </div>
  )
}

export default function Officials() {
  const [cms, setCms] = useState(null)
  useEffect(() => { fetch('/api/officials').then((r) => r.ok ? r.json() : Promise.reject()).then((value) => { if (value?.mayor) setCms(value) }).catch(() => {}) }, [])
  const currentMayor = cms?.mayor || mayor
  const currentViceMayor = cms?.viceMayor || viceMayor
  const currentSbMembers = cms?.sbMembers?.length ? cms.sbMembers : sbMembers
  const currentAbcPresident = cms?.abcPresident?.name ? cms.abcPresident : abcPresident
  const currentDeptHeads = cms?.deptHeads?.length ? cms.deptHeads : deptHeads
  const currentPunongBarangays = cms?.punongBarangays?.length ? cms.punongBarangays : barangays.map((b) => ({ name: b.captain, role: b.name }))
  return (
    <main id="officials">
      <section className="about-hero officials-hero">
        <div className="about-hero-bg"><img src="/assets/pages/bg/Municipal-Officials.png" alt="Getafe Municipal Hall" /><div className="about-hero-overlay" /></div>
        <div className="container about-hero-inner"><p className="about-hero-kicker">Municipality of Getafe • Bohol</p><h1>Municipal Officials</h1><p className="about-hero-sub">The elected leaders, barangay captains, and department heads serving Getafe.</p></div>
      </section>

      <div className="content-page container">
        {/* Elected Officials */}
        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><Landmark size={22} /></span>
            <div>
              <h2>Elected Officials</h2>
              <p>The local government executive and legislative leadership of Getafe.</p>
            </div>
          </div>

          <div className="officials-lead">
            <OfficialCard name={currentMayor.name} role={currentMayor.role} biography={currentMayor.biography} photo={currentMayor.photo} lead />
            <OfficialCard name={currentViceMayor.name} role={currentViceMayor.role} biography={currentViceMayor.biography} photo={currentViceMayor.photo} lead />
          </div>

          <h3 className="officials-subhead"><Users size={16} /> Sangguniang Bayan</h3>
          <div className="officials-grid">
            {currentSbMembers.map((m) => (
              <OfficialCard name={m.name} role={m.role} biography={m.biography} photo={m.photo} key={m.name} />
            ))}
            <OfficialCard name={currentAbcPresident.name} role={currentAbcPresident.role} biography={currentAbcPresident.biography} photo={currentAbcPresident.photo} />
          </div>
        </section>

        {/* Punong Barangays */}
        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><MapPin size={22} /></span>
            <div>
              <h2>Punong Barangays</h2>
              <p>The 24 barangay captains leading Getafe's communities.</p>
            </div>
          </div>

          <div className="brgy-officials-grid">
            {currentPunongBarangays.map((b) => (
              <div className="brgy-official" key={b.role}>
                <img
                  src={b.photo || PLACEHOLDER}
                  alt={`${b.name} — Punong Barangay of ${b.role}`}
                  className="brgy-official-img"
                />
                <div>
                    <Link to={`/info/officials/${officialId(b.name)}`}><strong>{b.name}</strong></Link>
                    <span>{b.role}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Department Heads */}
        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><Building2 size={22} /></span>
            <div>
              <h2>Department Heads</h2>
              <p>The officials managing the offices of the municipal government.</p>
            </div>
          </div>

          <div className="dept-grid">
            {currentDeptHeads.map((d) => (
              <div className="dept-card" key={d.role}>
                <img src={d.photo || PLACEHOLDER} alt={`${d.name} profile`} className="dept-img" />
                <div>
                  <Link to={`/info/officials/${officialId(d.name)}`}><strong>{d.name}</strong></Link>
                  <span>{d.role}</span>{d.biography && <p className="official-bio">{d.biography}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </main>
  )
}
