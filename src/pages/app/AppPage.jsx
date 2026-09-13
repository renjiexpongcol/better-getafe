import CitizenLayout from '../../components/CitizenLayout'
export default function AppPage({ title, children }) {
  return <CitizenLayout title={title}><h1 className="portal-page-title">{title}</h1>{children}</CitizenLayout>
}
