import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CreditCard, FileCheck2, WalletCards } from 'lucide-react'
import AppPage from './AppPage'
import { DataState, Empty, Status } from '../../components/CitizenWidgets'
import { useCitizen } from '../../context/CitizenContext'
import { citizenApi, money, dateLabel, paymentDue } from '../../services/citizenData'

const settlementTypes = [
  ['Ordinance Violation', 'Settle a citation or violation notice.'],
  ['Public Market Stall', 'Settle stall rental or related market fees.'],
  ['Miscellaneous Fees', 'Settle other assessed municipal fees.'],
  ['Transport Franchise', 'Settle transport franchise-related fees.'],
]

export default function Payments() { return <AppPage title="Payments & settlements"><SettlementCenter/><PaymentRecords/></AppPage> }

function SettlementCenter() {
  const { reload } = useCitizen(), [params] = useSearchParams()
  const requestedType = params.get('settlement') || ''
  const [form, setForm] = useState({ category: settlementTypes.some(([name]) => name === requestedType) ? requestedType : '', reference_number: '', amount: '', payment_method: '', notes: '' })
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('')
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }))
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('')
    try {
      const result = await citizenApi('/settlements', { method: 'POST', body: JSON.stringify({ ...form, amount: Number(form.amount) }) })
      setSuccess(`Request ${result.tracking_number} received. The Municipal Treasurer’s Office will verify your settlement and update its status here.`)
      setForm({ category: '', reference_number: '', amount: '', payment_method: '', notes: '' }); await reload()
    } catch (submissionError) { setError(submissionError.message) } finally { setBusy(false) }
  }
  return <section className="citizen-panel settlement-center">
    <div className="citizen-panel-head"><div><h2>Settle a municipal obligation</h2><p>Submit the details of an assessed fee or notice for Treasurer verification.</p></div><WalletCards size={22}/></div>
    <div className="settlement-type-grid">{settlementTypes.map(([name, description]) => <div key={name} className="settlement-type"><FileCheck2 size={18}/><strong>{name}</strong><span>{description}</span></div>)}</div>
    <form className="portal-form settlement-form" onSubmit={submit}>
      <div className="portal-form-grid"><label>Settlement type<select name="category" value={form.category} onChange={update} required><option value="">Select an obligation</option>{settlementTypes.map(([name]) => <option key={name}>{name}</option>)}</select></label><label>Reference number<input name="reference_number" value={form.reference_number} onChange={update} required placeholder="Notice, stall, fee, or franchise no."/></label></div>
      <div className="portal-form-grid"><label>Amount to settle<input name="amount" value={form.amount} onChange={update} required min="0.01" step="0.01" type="number" placeholder="0.00"/></label><label>Payment channel<select name="payment_method" value={form.payment_method} onChange={update} required><option value="">Select a channel</option><option>Treasurer’s Office</option><option>GCash / e-wallet</option><option>Bank transfer</option></select></label></div>
      <label>Additional notes <span className="portal-muted">(optional)</span><textarea name="notes" value={form.notes} onChange={update} maxLength={1000} rows="3" placeholder="Add any details the Treasurer should know."/></label>
      <p className="settlement-disclaimer">Submitting this form does not complete payment. Keep your reference and proof of payment. The Treasurer’s Office will verify the details before marking the settlement paid.</p>
      {error && <p className="portal-error" role="alert">{error}</p>}{success && <p className="portal-success" role="status">{success}</p>}
      <div className="portal-form-actions"><button className="citizen-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit settlement request'}</button></div>
    </form>
  </section>
}

function PaymentRecords() {
  const { data } = useCitizen(), payments = data?.payments || [], settlements = data?.settlements || []
  return <section className="citizen-panel"><div className="citizen-panel-head"><div><h2>Payment history</h2><p>Track assessed fees and settlement requests linked to your account.</p></div><CreditCard size={22}/></div><DataState>{payments.length || settlements.length ? <div className="portal-records">{settlements.map(item => <article className="portal-notice" key={item.id}><div className="portal-record-heading"><h3>{item.category}</h3><Status value={item.status}/></div><p><strong>{money(item.amount)}</strong> · Reference {item.reference_number}</p><p>{dateLabel(item.created_at)} · {item.payment_method}</p><p className="portal-muted">Settlement request tracking: {item.id.slice(0, 8).toUpperCase()}</p></article>)}{payments.map(item => <article className="portal-notice" key={item.id}><div className="portal-record-heading"><h3>{item.service_name || 'Municipal service fee'}</h3><Status value={item.status}/></div><p><strong>{money(item.amount)}</strong> · {dateLabel(item.created_at)}{item.official_receipt && ` · Receipt ${item.official_receipt}`}</p>{paymentDue(item) && <p>To pay this fee, contact the Municipal Treasurer’s Office with your application reference. Online payment is not currently available in this portal.</p>}</article>)}</div> : <Empty icon={CreditCard} title="No payment records yet" description="Any assessed fees, official receipts, and settlement requests will appear here."/>}</DataState></section>
}
