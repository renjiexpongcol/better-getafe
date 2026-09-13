import { useSearchParams, Link } from 'react-router-dom'
import { CreditCard } from 'lucide-react'
import AppPage from './AppPage'
import { DataState, Empty, Status } from '../../components/CitizenWidgets'
import { useCitizen } from '../../context/CitizenContext'
import { money, dateLabel, paymentDue } from '../../services/citizenData'
export default function Payments() { return <AppPage title="Payments"><PaymentRecords/></AppPage> }
function PaymentRecords() {
  const { data } = useCitizen(), [params] = useSearchParams(), payments = (data?.payments || []).filter(item => !params.has('payment') || item.id === params.get('payment'))
  return <section className="citizen-panel"><DataState>{payments.length ? payments.map(item => <article className="portal-notice" key={item.id}><div className="portal-record-heading"><h2>{money(item.amount)}</h2><Status value={item.status}/></div><h3>{item.service_name || 'Municipal service fee'}</h3><p>{dateLabel(item.created_at)}{item.official_receipt && ` · Receipt ${item.official_receipt}`}</p>{paymentDue(item) && <p>To pay this fee, contact the Municipal Treasurer’s Office with your application reference. Online payment is not currently available in this portal.</p>}<Link to={`/app/requests/${encodeURIComponent(item.application_id)}`}>View associated application →</Link></article>) : params.has('payment') ? <p>Payment not found.</p> : <Empty icon={CreditCard} title="No payment records yet" description="Any fees assessed for your applications and official receipt references will appear here."/>}</DataState></section>
}
