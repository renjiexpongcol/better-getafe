import AppPage from './AppPage'
import { ApplicationRows, DataState } from '../../components/CitizenWidgets'
import { useCitizen } from '../../context/CitizenContext'
export default function Requests() { return <AppPage title="My applications"><Records/></AppPage> }
function Records() { const { data } = useCitizen(); return <section className="citizen-panel"><DataState><ApplicationRows items={data?.applications || []}/></DataState></section> }
