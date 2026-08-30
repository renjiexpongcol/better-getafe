import { Link } from 'react-router-dom'
import {
  History as HistoryIcon, Landmark, Music2, ScrollText, Wheat, Fish, Mountain,
  AudioLines, Star, Handshake, TreePine, Flower2, Bird, Leaf, Music,
} from 'lucide-react'

const sealSymbols = [
  {
    icon: Star,
    circle: 'Outer circle',
    title: '24 Stars',
    text: 'Represent the 24 barangays of the municipality. The texts "Official Seal" and "Getafe, Bohol" are inscribed around the seal.',
  },
  {
    icon: Wheat,
    circle: 'Middle circle',
    title: 'Coconut Fruit & Corn Ear',
    text: 'Signify the agricultural products produced by the town\u2019s industrious farmers for livelihood.',
  },
  {
    icon: Fish,
    circle: 'Middle circle',
    title: 'Fish, Shell & Crab',
    text: 'Three marine products symbolizing the abundance of marine resources, and the livelihood of the people, especially in the island barangays.',
  },
  {
    icon: Mountain,
    circle: 'Middle circle',
    title: 'Mountains, Rice Field, Boat & Sea',
    text: 'Represent the panoramic view of the municipality and its main sources of living — farming and fishing.',
  },
  {
    icon: ScrollText,
    circle: 'Middle circle',
    title: 'Shovel & Mattock',
    text: 'Represent the hardworking traits of the mainland inhabitants with respect to agriculture.',
  },
  {
    icon: Handshake,
    circle: 'Core circle',
    title: 'Crossed Arms, Dagger, Blood Spot & Drinking Cup',
    text: 'Symbolize the "Sandugo" (blood compact) between Rajah Sikatuna and Miguel L\u00f3pez de Legazpi for friendship and unity, also found in the Provincial Seal of Bohol.',
  },
]

const hymnStanzas = [
  [
    'Ang dapit nga unang gitawag',
    'Ambacon sa unang panahon',
    'Gikan sa subangan ngadto sa kasagpan',
    'Ka-islahan, kabukiran ang makit-an',
    'Dinayeg sa mga kastila',
    'Nahimong usa ka lig-ong katilingban',
    'Kadagatan, kabukiran maoy kapaninguha-an',
  ],
  [
    'Sa Hundumon kabayo sa dagat',
    'Bakhawan sa isla sa Banacon',
    'Guso, lambay sa ubang ka-islahan',
    'Kalubihan, kahumayan sa kabukiran',
    'Ug tungod sa programang lungsuranon',
    'Milambo ang kalikupan',
    'Busa\u2019ng Getafe nagmalampuson',
    'Sa kinabuhi nagma-uswagon',
  ],
]

const municipalSymbols = [
  {
    icon: TreePine,
    kind: 'Municipal Tree',
    name: 'Lomboy Tree',
    text: 'Considered the municipal tree not only for its numerous existence, but also because it helps the people economically — its fruits, leaves, and wood provide livelihood.',
  },
  {
    icon: Flower2,
    kind: 'Municipal Flower',
    name: 'Bandera Espa\u00f1ola',
    text: 'A tropical flower grown in Getafe, adopted as the municipal flower in honor of the established sisterhood with Getafe, Spain — Getafe Bohol\u2019s sister town.',
  },
  {
    icon: Bird,
    kind: 'Municipal Bird',
    name: 'Oriole (Antolihaw)',
    text: 'Found in large numbers in the municipal woods, they are environment friendly and have colors that attract the eye. They sometimes visit the municipal plaza and perch on the municipal tree houses.',
  },
  {
    icon: Leaf,
    kind: 'Municipal Plant',
    name: 'Banana (Saging)',
    text: 'Bananas help the people earn a living through its blossom, fruits, and leaves, and exist largely throughout the municipality.',
  },
  {
    icon: Music,
    kind: 'Municipal Dance',
    name: 'Kuratsa',
    text: 'The favorite folk dance of the people of Getafe. Highly requested during special occasions such as fiestas, most townsfolk love to dance the Kuratsa.',
  },
]

export default function History() {
  return (
    <main id="history">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <p className="history-kicker">About Getafe</p>
            <h1 className="page-title">History, Seal & Hymn</h1>
            <p className="page-subtitle">The story, symbols, and song of the Municipality of Getafe, Bohol.</p>
          </div>
        </div>
      </div>

      <div className="content-page container">
        {/* Brief History */}
        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><HistoryIcon size={22} /></span>
            <div>
              <h2>Brief History</h2>
              <p>From the fishing village of Ambacon to the town of Getafe.</p>
            </div>
          </div>

          <div className="history-article">
            <img src="https://www.getafe.gov.ph/_img/imgHistory.jpg" alt="Getafe, Bohol" className="history-img" />
            <div className="history-prose">
              <p>
                Originally, during the Spanish occupation, Getafe was a small fishing village close to the sea
                known as <strong>"AMBACON"</strong>. Its indigenous name likely existed even before the first
                Spaniards arrived in the Philippines, as it appeared in a rare Spanish geographic dictionary
                dated 1850. Most probably the name <em>Ambacon</em> is derived from the fact that in reaching the
                coastal settlement, inhabitants from the highland had to go down — <strong>"AMBAK"</strong>, a
                Visayan word meaning <em>"to go down"</em>.
              </p>
              <p>
                The Spaniards, especially the priests, found the highland settlement hilly and unsuited for a town
                site, and urged the settlers to go down to the plain along the coast. Though not easy to persuade,
                the people eventually re-established themselves in Ambacon, which later became a{" "}
                <strong>"VISITA DE AMBACON"</strong> under the political and ecclesiastical jurisdiction of
                Inabanga.
              </p>
              <p>
                On <strong>April 26, 1877</strong>, the Military and Political Governor of the district of Bohol,
                Don Joaquin Benguechea, gathered the Heads of Talibon, Inabanga, and Getafe to designate the
                jurisdictional boundaries of Getafe, which was a parish segregated from Inabanga. By the Royal
                Decree of <strong>October 12, 1874</strong>, Ambacon — bearing its new name <strong>Getafe</strong> —
                was created as an independent town, named after the native town of the Rev. Parish Priests Fray
                Valentin Garcia and Fray Lino Mateo in Spain.
              </p>
            </div>
          </div>
        </section>

        {/* Municipal Seal */}
        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><Landmark size={22} /></span>
            <div>
              <h2>Municipal Seal</h2>
              <p>Registered with the DILG — vividly represented by three circles.</p>
            </div>
          </div>

          <div className="seal-layout">
            <div className="seal-visual">
              <img src="https://www.getafe.gov.ph/_img/imgSealSymbols.jpg" alt="Getafe Municipal Seal symbolism" className="seal-img" />
              <img src="/assets/getafe-seal.png" alt="Official Seal of Getafe" className="seal-official" />
              <p>The official seal, registered with the Department of Interior and Local Government (DILG).</p>
            </div>

            <div className="seal-symbols">
              {sealSymbols.map(({ icon: Icon, circle, title, text }) => (
                <div className="seal-symbol" key={title}>
                  <span className="seal-symbol-icon"><Icon size={18} /></span>
                  <div>
                    <span className="seal-circle">{circle}</span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Getafe Hymn */}
        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><Music2 size={22} /></span>
            <div>
              <h2>The Getafe Hymn</h2>
              <p>The municipal hymn of Getafe, Bohol.</p>
            </div>
          </div>

          <div className="hymn-card">
            <span className="hymn-icon"><AudioLines size={28} /></span>
            <div className="hymn-info">
              <h3>Getafe Hymn</h3>
              <p>Press play to listen to the municipal hymn.</p>
            </div>
            <audio className="hymn-audio" controls preload="none" src="/assets/getafe-hymn/getafeHymn.mp3">
              Your browser does not support the audio element.
            </audio>
          </div>

          <div className="hymn-lyrics">
            {hymnStanzas.map((stanza, i) => (
              <div className="hymn-stanza" key={i}>
                {stanza.map((line) => <p key={line}>{line}</p>)}
              </div>
            ))}
          </div>
        </section>

        {/* Municipal Symbols */}
        <section className="history-block">
          <div className="history-head">
            <span className="history-head-icon"><Flower2 size={22} /></span>
            <div>
              <h2>Municipal Symbols</h2>
              <p>The official symbols that represent Getafe, Bohol.</p>
            </div>
          </div>

          <div className="symbols-grid">
            {municipalSymbols.map(({ icon: Icon, kind, name, text }) => (
              <div className="symbol-card" key={kind}>
                <span className="symbol-card-icon"><Icon size={22} /></span>
                <span className="symbol-card-kind">{kind}</span>
                <h3>{name}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="history-back">
          <Link to="/info/about">Back to About Us</Link>
        </p>
      </div>
    </main>
  )
}
