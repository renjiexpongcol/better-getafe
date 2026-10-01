import AppPage from './AppPage'
import { ApplicationRows, DataState } from '../../components/CitizenWidgets'
import { useCitizen } from '../../context/CitizenContext'
import { Link } from 'react-router-dom'
export default function Requests() { return <AppPage title="My applications"><p><Link to="/app/e-requests">My e-service requests</Link></p><Records/></AppPage> }
function Records() { const { data } = useCitizen(); return <section className="citizen-panel"><DataState><ApplicationRows items={data?.applications || []}/></DataState></section> }
