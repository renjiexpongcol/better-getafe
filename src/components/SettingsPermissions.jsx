import { useEffect, useState } from 'react'
const permissions = { 'settings.view': ['View settings', 'Open the system settings area and review configuration.'], 'settings.edit': ['Edit settings', 'Change non-sensitive portal configuration.'], 'settings.secrets.edit': ['Manage secrets', 'Replace passwords, API keys, and other protected credentials.'], 'settings.database.edit': ['Manage databases', 'Update database connection and data-store settings.'], 'settings.storage.edit': ['Manage cloud storage', 'Configure storage providers, uploads, and file access.'], 'settings.security.edit': ['Manage access', 'Change security controls and administrator permissions.'], 'settings.audit.view': ['View audit history', 'Review recorded configuration and security changes.'] }
const names = Object.fromEntries(Object.entries(permissions).map(([key, [label]]) => [key, label]))
export default function SettingsPermissions({ value, disabled, onChange }) {
 const [users, setUsers] = useState([])
 const [error, setError] = useState('')
 useEffect(() => {
  fetch('/api/admin/settings/principals', { credentials: 'include' }).then(async response => { if (!response.ok) throw new Error('Administrator list is unavailable.'); return response.json() }).then(setUsers).catch(error => setError(error.message))
 }, [])
 const grants = JSON.parse(value || '{}')
 return <div>{error && <p role="alert">{error}</p>}{users.map(user => <fieldset key={user.id} disabled={disabled || user.role === 'super_admin'}><legend>{user.name}{user.role === 'super_admin' ? ' · Full administrator access' : ''}</legend>{Object.entries(names).map(([key, label]) => <label className="settings-permission" key={key}><input type="checkbox" checked={(grants[user.id] || Object.keys(names)).includes(key)} onChange={event => { const current = grants[user.id] || Object.keys(names); onChange(JSON.stringify({ ...grants, [user.id]: event.target.checked ? [...current, key] : current.filter(permission => permission !== key) })) }} /><span>{label}</span><span className="permission-help" tabIndex="0" aria-label={`${label}: ${permissions[key][1]}`}>?</span><span className="permission-tooltip" role="tooltip">{permissions[key][1]}</span></label>)}</fieldset>)}</div>
}
