import { Navigate, useParams } from 'react-router-dom'
export default function OfficeDetail() { const { slug } = useParams(); return <Navigate to={`/departments/${encodeURIComponent(slug)}`} replace /> }
