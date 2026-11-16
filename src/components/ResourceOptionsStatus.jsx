export default function ResourceOptionsStatus({ resource, label = 'Options' }) {
  if (resource.loading) return <p role="status">Loading {label.toLowerCase()}…</p>
  if (resource.error) return <p role="alert">{resource.error} <button type="button" onClick={resource.reload}>Retry</button></p>
  const items = resource.items || resource.data?.items || []
  return items.length ? null : <p role="status">{label} have not been published.</p>
}
