import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import AppPage from './AppPage'
import { DataState, Empty } from '../../components/CitizenWidgets'
import { useCitizen } from '../../context/CitizenContext'
import { citizenApi, dateLabel, notificationLink } from '../../services/citizenData'
export default function Notifications() { return <AppPage title="Notifications"><NotificationRecords/></AppPage> }
function NotificationRecords() {
  const { data, reload } = useCitizen(), [params] = useSearchParams(), [error, setError] = useState('')
  const read = async item => { try { setError(''); await citizenApi(`/notifications/${item.id}/read`, { method: 'PATCH' }); await reload() } catch (error) { setError(error.message) } }
  const markAllRead = async () => { try { setError(''); await citizenApi('/notifications/read-all', { method: 'PATCH' }); await reload() } catch (error) { setError(error.message) } }
  const items = (data?.notifications || []).filter(item => !params.has('notification') || item.id === params.get('notification'))
  const unread = items.filter(item => !item.read_at).length
  return <section className="citizen-panel notifications-page-panel">
    {unread > 0 && <div className="notifications-page-actions"><button type="button" className="notifications-mark-all" onClick={markAllRead}><CheckCheck size={16}/> Mark all as read</button></div>}
    {error && <p className="portal-error notifications-page-error" role="alert">{error}</p>}
    <DataState>{items.length ? <div className="notifications-list">{items.map(item => <article key={item.id} className={`portal-notice${item.read_at ? '' : ' is-unread'}`}><div className="portal-notice-marker" aria-hidden="true"/><div className="portal-notice-content"><div className="portal-notice-heading"><h3>{item.title}</h3>{!item.read_at && <span className="portal-status blue">Unread</span>}</div><p>{item.message}</p><small className="portal-muted">{dateLabel(item.created_at, { hour: 'numeric', minute: '2-digit' })}</small><div>{(item.application_id || item.document_id) && <Link to={notificationLink(item)}>View details <span aria-hidden="true">→</span></Link>}{!item.read_at && <button onClick={() => read(item)}>Mark as read</button>}</div></div></article>)}</div> : params.has('notification') ? <p>Notification not found.</p> : <Empty icon={Bell} title="No notifications yet" description="Updates about your applications, payments and documents will appear here."/>}</DataState>
  </section>
}
