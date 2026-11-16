import { Link } from 'react-router-dom'

export default function MaintenancePage() {
  return (
    <main className="maintenance-page" aria-labelledby="maintenance-title" aria-describedby="maintenance-message">
      <section className="maintenance-content">
        <svg className="maintenance-illustration" viewBox="0 0 560 360" role="img" aria-label="Illustration of a developer working at a laptop among browser windows">
          <rect x="38" y="51" width="176" height="118" rx="12" fill="#e6f0ed"/><rect x="55" y="68" width="142" height="84" rx="5" fill="#fff"/><path d="M55 84h142" stroke="#c7d9d3" strokeWidth="4"/><circle cx="67" cy="76" r="3" fill="#e8a15c"/><circle cx="78" cy="76" r="3" fill="#d8bd61"/><path d="M72 104h53M72 117h87M72 130h40" stroke="#7ba99c" strokeWidth="6" strokeLinecap="round"/>
          <rect x="351" y="76" width="164" height="103" rx="12" fill="#f7e8cf"/><rect x="369" y="94" width="128" height="67" rx="5" fill="#fffaf2"/><path d="M389 116h86M389 132h55" stroke="#d59f52" strokeWidth="7" strokeLinecap="round"/><circle cx="466" cy="146" r="7" fill="#e6ad63"/>
          <path d="M281 60v34m-17-17h34" stroke="#e5a85d" strokeWidth="8" strokeLinecap="round"/><circle cx="105" cy="226" r="10" fill="#70a99a"/><path d="M104 244v42m0-26-20 16m20-14 18 13" stroke="#397d6d" strokeWidth="9" strokeLinecap="round"/>
          <path d="M224 301h174l-18 15H242z" fill="#245b51"/><path d="M244 293h133l21 8H224z" fill="#3d8173"/><path d="M262 287c-8-30 1-65 24-80 17-11 42-8 53 7 9 12 11 29 5 43l-9 30z" fill="#e9ad78"/><path d="M263 216c2-26 19-39 43-37 20 2 33 17 30 37-14-8-28-15-44-15-8 6-17 11-29 15" fill="#263d42"/><path d="M259 290h83l22 11H248z" fill="#d77c57"/><path d="M290 221c-12 6-19 20-19 35v31h58l-4-44c-1-12-17-28-35-22" fill="#f4c59a"/><rect x="283" y="264" width="51" height="35" rx="4" fill="#264b50"/><path d="M289 271h39m-39 7h29m-29 7h34" stroke="#9ccdc0" strokeWidth="3" strokeLinecap="round"/><path d="M276 298h90" stroke="#1d443e" strokeWidth="6" strokeLinecap="round"/>
        </svg>
        <h1 id="maintenance-title">Down for Maintenance</h1>
        <p id="maintenance-message">We’re making planned updates to the Municipality of Getafe website. We’ll be back soon — meanwhile, visit our <Link to="/news">blog and updates</Link>.</p>
      </section>
    </main>
  )
}
