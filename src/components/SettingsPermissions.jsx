import { useEffect, useState } from 'react'
const names = { 'settings.view': 'View settings', 'settings.edit': 'Edit settings', 'settings.secrets.edit': 'Replace secrets', 'settings.database.edit': 'Edit databases', 'settings.storage.edit': 'Edit cloud storage', 'settings.security.edit': 'Manage security and permissions', 'settings.audit.view': 'View audit history' }
export default function SettingsPermissions({ value, disabled, onChange }) {
 const [users, setUsers] = useState([])
 const [error, setError] = useState('')
 useEffect(() => {
  fetch('/api/admin/settings/principals', { credentials: 'include' }).then(async response => { if (!response.ok) throw new Error('Administrator list is unavailable.'); return response.json() }).then(setUsers).catch(error => setError(error.message))
 }, [])
 const grants = JSON.parse(value || '{}')
 return <div>{error && <p role="alert">{error}</p>}{users.map(user => <fieldset key={user.id} disabled={disabled || user.role === 'super_admin'}><legend>{user.name}{user.role === 'super_admin' ? ' · Full administrator access' : ''}</legend>{Object.entries(names).map(([key, label]) => <label className="settings-permission" key={key}><input type="checkbox" checked={(grants[user.id] || Object.keys(names)).includes(key)} onChange={event => { const current = grants[user.id] || Object.keys(names); onChange(JSON.stringify({ ...grants, [user.id]: event.target.checked ? [...current, key] : current.filter(permission => permission !== key) })) }} />{label}</label>)}</fieldset>)}</div>
}
