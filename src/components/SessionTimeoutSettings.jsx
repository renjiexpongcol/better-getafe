import { Info } from 'lucide-react'
import './SessionTimeoutSettings.css'

const durationLabel = minutes => minutes < 60 ? `${minutes} minutes` : minutes % 60 === 0 ? `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}` : `${minutes} minutes`

export default function SessionTimeoutSettings({ fields, values, patch, busy, canEdit, onChange, onUndo }) {
  const definitions = Object.fromEntries(fields)
  const enabledKey = 'authentication.sessionIdleEnabled'
  const idleKey = 'authentication.sessionIdleMinutes'
  const warningKey = 'authentication.sessionWarningMinutes'
  const enabled = values[enabledKey] !== false
  const idle = Number(values[idleKey]) || 30
  const warning = Number(values[warningKey]) || 5
  const disabled = key => busy || !definitions[key] || definitions[key].managedByEnvironment || !canEdit(key, definitions[key])
  const undo = key => Object.hasOwn(patch, key) && <button type="button" className="session-policy-undo" disabled={busy} onClick={() => onUndo(key)}>Undo change</button>
  const durations = [...new Set([5, 15, 30, 60, 120, 180, 240, 300, 360, idle])].sort((a, b) => a - b)
  const warnings = [...new Set([1, 2, 3, 5, 10, 15, 30, warning])].filter(value => value < idle && value <= 30).sort((a, b) => a - b)

  return <div className="session-policy">
    <div className="session-policy-row">
      <div className="session-policy-label"><span>Automatic log out</span><small>Protect accounts left unattended.</small></div>
      <div className="session-policy-control">
        <label className="session-policy-checkbox" htmlFor={enabledKey}>
          <input id={enabledKey} type="checkbox" checked={enabled} disabled={disabled(enabledKey)} onChange={event => onChange(enabledKey, event.target.checked)} aria-describedby="session-policy-help" />
          <span>Log out automatically after being inactive</span>
        </label>
        {undo(enabledKey)}
        {enabled && <div className="session-policy-options">
          {definitions[idleKey] && <div className="session-policy-option">
            <label htmlFor={idleKey}>Inactivity duration</label>
            <select id={idleKey} value={idle} disabled={disabled(idleKey)} onChange={event => onChange(idleKey, Number(event.target.value))} aria-describedby="session-duration-help">
              {durations.map(value => <option key={value} value={value}>{durationLabel(value)}</option>)}
            </select>
            <p id="session-duration-help">Only time without keyboard, mouse, or touch activity counts.</p>
            {undo(idleKey)}
          </div>}
          {definitions[warningKey] && <div className="session-policy-option">
            <label htmlFor={warningKey}>Show a warning before log out</label>
            <select id={warningKey} value={warning} disabled={disabled(warningKey)} onChange={event => onChange(warningKey, Number(event.target.value))}>
              {warnings.map(value => <option key={value} value={value}>{value} {value === 1 ? 'minute' : 'minutes'} before</option>)}
            </select>
            <p>Let people choose to keep working before their session expires.</p>
            {undo(warningKey)}
          </div>}
        </div>}
        <p className="session-policy-note" id="session-policy-help"><Info size={16} aria-hidden="true" /><span>{enabled ? 'Activity keeps the session open. Background refreshes do not reset the inactivity timer.' : 'Inactivity log out is off. The maximum sign-in lifetime still applies.'}</span></p>
      </div>
    </div>
  </div>
}
