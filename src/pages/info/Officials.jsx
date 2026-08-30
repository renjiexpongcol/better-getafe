import { Link } from 'react-router-dom'
import { Landmark, Users, MapPin, Building2 } from 'lucide-react'
import { barangays } from '../../data/barangays'

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

function OfficialCard({ name, role, lead, photo }) {
  return (
    <div className={lead ? 'official-card lead' : 'official-card'}>
      <img src={photo || PLACEHOLDER} alt={`${name} profile`} className="official-img" />
      <div>
        <strong>{name}</strong>
        <span>{role}</span>
      </div>
    </div>
  )
}

export default function Officials() {
  return (
    <main id="officials">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <p className="history-kicker">Municipality of Getafe</p>
            <h1 className="page-title">Municipal Officials</h1>
            <p className="page-subtitle">The elected leaders, barangay captains, and department heads serving Getafe.</p>
          </div>
        </div>
      </div>

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
            <OfficialCard name={mayor.name} role={mayor.role} lead />
            <OfficialCard name={viceMayor.name} role={viceMayor.role} lead />
          </div>

          <h3 className="officials-subhead"><Users size={16} /> Sangguniang Bayan</h3>
          <div className="officials-grid">
            {sbMembers.map((m) => (
              <OfficialCard name={m.name} role={m.role} key={m.name} />
            ))}
            <OfficialCard name={abcPresident.name} role={abcPresident.role} />
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
            {barangays.map((b) => (
              <div className="brgy-official" key={b.name}>
                <img
                  src="/assets/brgy-user-vector/profile-circle.svg"
                  alt={`${b.captain} — Punong Barangay of ${b.name}`}
                  className="brgy-official-img"
                />
                <div>
                  <strong>{b.captain}</strong>
                  <span>{b.name}</span>
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
            {deptHeads.map((d) => (
              <div className="dept-card" key={d.role}>
                <img src={d.photo || PLACEHOLDER} alt={`${d.name} profile`} className="dept-img" />
                <div>
                  <strong>{d.name}</strong>
                  <span>{d.role}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="history-back">
          <Link to="/info/about">Back to About Us</Link> · <Link to="/contact">Contact Us</Link>
        </p>
      </div>
    </main>
  )
}
