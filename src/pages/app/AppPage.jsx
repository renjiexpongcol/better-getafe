import { PageHeader } from '../../components/ui/Primitives'
import CitizenLayout from '../../components/CitizenLayout'
export default function AppPage({ title, description, actions, children }) {
  return <CitizenLayout title={title}><PageHeader title={title} description={description} actions={actions}/>{children}</CitizenLayout>
}
