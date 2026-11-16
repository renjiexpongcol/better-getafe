import { forwardRef, useId, cloneElement } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, FolderOpen, Search, X } from 'lucide-react'
import { statusPresentation } from '@getafe/design-system'
import './styles.css'

export const Button = forwardRef(function Button({ variant = 'primary', size = 'medium', busy = false, loadingLabel, disabledReason, children, className = '', to, ...props }, ref) {
  const classes = `ui-button ui-button--${variant} ui-button--${size} ${className}`
  const content = busy && loadingLabel ? loadingLabel : children
  const describedBy = disabledReason ? [props['aria-describedby'], `${props.id || 'ui-button'}-disabled-reason`].filter(Boolean).join(' ') : props['aria-describedby']
  const reason = disabledReason ? <span className="ui-button-reason" id={`${props.id || 'ui-button'}-disabled-reason`}>{disabledReason}</span> : null
  if (to) {
    const unavailable = props.disabled || busy
    return <>{reason}<Link ref={ref} {...props} className={classes} to={to} aria-disabled={unavailable || undefined} aria-busy={busy || undefined} aria-describedby={describedBy} tabIndex={unavailable ? -1 : props.tabIndex} onClick={event => { if (unavailable) event.preventDefault(); else props.onClick?.(event) }}>{content}</Link></>
  }
  return <>{reason}<button ref={ref} type="button" {...props} disabled={props.disabled || busy} aria-busy={busy || undefined} aria-describedby={describedBy} className={classes}>{content}</button></>
})
export const IconButton = forwardRef(function IconButton({ label, children, ...props }, ref) {
  return <Button ref={ref} variant="ghost" {...props} aria-label={label} title={label} data-icon-button="ghost">{children}</Button>
})
export function PageHeader({ title, description, actions, context, className = '' }) {
  return <header className={`ui-page-header ${className}`}><div>{context && <div className="ui-page-context">{context}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="ui-page-actions">{actions}</div>}</header>
}
export function SectionHeader({ title, actions }) { return <div className="ui-section-header"><h2>{title}</h2>{actions}</div> }
export function Field({ label, hint, error, required, children, id: suppliedId }) {
  const generatedId = useId(), id = suppliedId || children.props.id || generatedId
  const describedBy = [children.props['aria-describedby'], hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return <div className="ui-field"><label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>{cloneElement(children, { id, required: required || children.props.required, 'aria-invalid': error ? true : children.props['aria-invalid'], 'aria-describedby': describedBy })}{hint && <small id={`${id}-hint`}>{hint}</small>}{error && <p id={`${id}-error`} role="alert">{error}</p>}</div>
}
export function FormSection({ title, description, children }) { return <fieldset className="ui-form-section"><legend>{title}</legend>{description && <p>{description}</p>}<div className="ui-form-grid">{children}</div></fieldset> }
export function SearchInput({ label = 'Search', value, onChange, ...props }) {
  const generatedId = useId(), id = props.id || generatedId
  return <div className="ui-search"><label className="sr-only" htmlFor={id}>{label}</label><Search size={18} aria-hidden="true"/><input {...props} id={id} type="search" value={value} onChange={onChange}/>{value && <IconButton label={`Clear ${label.toLowerCase()}`} disabled={props.disabled} onClick={event => { const input = event.currentTarget.parentElement.querySelector('input'); onChange({ target: { value: '' } }); input?.focus() }}><X size={16} aria-hidden="true"/></IconButton>}</div>
}
export function StatusBadge({ value, audience = 'resident', label, className = '' }) {
  const status = statusPresentation(value, audience)
  return <span className={`ui-badge ui-badge--${status.tone} ${className}`}>{label || status.label}</span>
}
export function Alert({ children, tone = 'info', action }) { return <div className={`ui-alert ui-alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{tone !== 'danger' && <AlertCircle size={18} aria-hidden="true"/>}<div>{children}</div>{action}</div> }
export function EmptyState({ title = 'No records yet', description, action, icon: Icon = FolderOpen }) { return <div className="ui-empty"><Icon size={24} aria-hidden="true"/><h3>{title}</h3>{description && <p>{description}</p>}{action}</div> }
export function LoadingState({ label = 'Loading records…' }) { return <div className="ui-loading" role="status"><span>{label}</span><div aria-hidden="true">{[0, 1, 2].map(key => <div className="ui-skeleton" key={key}/>)}</div></div> }
export function ErrorState({ message, onRetry }) { return <Alert tone="danger" action={onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}>{message}</Alert> }
export function Toolbar({ children, label = 'Filters and actions' }) { return <div className="ui-toolbar" role="group" aria-label={label}>{children}</div> }
export function Pagination({ page, totalPages, onChange }) { return <nav className="ui-pagination" aria-label="Pagination"><Button variant="outline" size="small" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button><span aria-live="polite">Page {page} of {Math.max(1, totalPages)}</span><Button variant="outline" size="small" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</Button></nav> }
export function Table({ children, label, className = '' }) { return <div className="ui-table-scroll" role="region" aria-label={label} tabIndex={0}><table className={`ui-table ${className}`}><caption className="sr-only">{label}</caption>{children}</table></div> }
export function MetadataList({ items }) { return <dl className="ui-metadata">{items.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl> }
