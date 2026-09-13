import { ArrowLeft, Compass, Mountain, Sunrise } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Verador() {
  return <main className="tourism-detail verador-detail">
    <section className="tourism-detail-hero">
      <div className="container">
        <Link to="/tourism" className="tourism-detail-back"><ArrowLeft size={16} /> Discover Getafe</Link>
        <p className="tourism-kicker"><Compass size={15} /> Scenic views · Getafe, Bohol</p>
        <h1>Verador Hill</h1>
        <p>Discover Getafe from its highest peak, where mountain air, island horizons, and glowing evening lights meet.</p>
      </div>
    </section>
    <article className="container tourism-detail-content">
      <div className="tourism-detail-label"><Mountain size={16} /> Mt. Corte highlands</div>
      <div className="tourism-detail-body">
        <p>This hilltop is the highest peak of Getafe. It stands proudly at the crest of gigantic Mt. Corte. From its summit, visitors can see the landscape as far as the town of Ubay on the eastern part of Bohol, the sea waters toward southern Leyte and eastern Cebu, and the waters near Loon, Bohol.</p>
        <p>The dazzling lights of Cebu City can also be seen from afar, appearing like a floating exposition. Its cool mountain breeze, from evening until the early hours of the morning, is a soothing balm to body and soul. A communion with the majestic splendor of Verador Hill is a quiet connection with nature.</p>
        <h2>Sunsets, islands, and sea lights</h2>
        <p>At sunset, visitors can watch the western horizon change its hues while countless islands appear like a navy fleet guarding the peace-loving people of Bohol. Sandbars stretch across the water like dinosaurs lying drowsily after a bountiful meal.</p>
        <p>In the evening, hundreds of fishing lights can be seen from the hilltop, twinkling like stars across the sea.</p>
      </div>
      <div className="verador-detail-note"><Sunrise size={17} /><span>Take time to enjoy the changing light, cool mountain breeze, and wide views across Getafe and the surrounding islands.</span></div>
    </article>
  </main>
}
