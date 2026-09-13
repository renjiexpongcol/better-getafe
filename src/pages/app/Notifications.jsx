import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bell } from 'lucide-react'
import AppPage from './AppPage'
import { DataState, Empty } from '../../components/CitizenWidgets'
import { useCitizen } from '../../context/CitizenContext'
import { citizenApi, dateLabel, notificationLink } from '../../services/citizenData'
export default function Notifications() { return <AppPage title="Notifications"><NotificationRecords/></AppPage> }
function NotificationRecords() {
  const { data, reload } = useCitizen(), [params] = useSearchParams(), [error, setError] = useState('')
  const read = async item => { try { setError(''); await citizenApi(`/notifications/${item.id}/read`, { method: 'PATCH' }); await reload() } catch (error) { setError(error.message) } }
  const items = (data?.notifications || []).filter(item => !params.has('notification') || item.id === params.get('notification'))
  return <section className="citizen-panel">{error && <p className="portal-error" role="alert">{error}</p>}<DataState>{items.length ? items.map(item => <article key={item.id} className="portal-notice"><h3>{item.title} {!item.read_at && <span className="portal-status blue">Unread</span>}</h3><p>{item.message}</p><small className="portal-muted">{dateLabel(item.created_at, { hour: 'numeric', minute: '2-digit' })}</small><div>{(item.application_id || item.document_id) && <Link to={notificationLink(item)}>View details →</Link>}{!item.read_at && <button onClick={() => read(item)}>Mark as read</button>}</div></article>) : params.has('notification') ? <p>Notification not found.</p> : <Empty icon={Bell} title="No notifications yet" description="Updates about your applications, payments and documents will appear here."/>}</DataState></section>
}
