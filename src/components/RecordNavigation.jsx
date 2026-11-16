import { NavLink } from 'react-router-dom'
export default function RecordNavigation({ kind = 'requests' }) {
 const links = kind === 'payments' ? [['/app/payments','Fees & receipts'],['/app/e-billing/all','Billing & payment orders']] : [['/app/e-requests','Service requests'],['/app/requests','Document applications']]
 return <nav className="ui-record-navigation" aria-label={kind === 'payments' ? 'Payment records' : 'Request records'}>{links.map(([to,label]) => <NavLink key={to} to={to} end>{label}</NavLink>)}</nav>
}
