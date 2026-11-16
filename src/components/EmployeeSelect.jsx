import { securityFetch as fetch } from '../services/securityFetch.js'
import { useEffect, useState } from 'react';

// Reuse the same configured choices for employee creation and profile editing.
export function useEmployeeOptions(enabled = true) {
  const [options, setOptions] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    setError('');
    fetch('/api/admin/users/options', { credentials: 'include', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Employee choices could not be loaded. Try again.');
      const result = await response.json();
      if (active) setOptions(result);
    }).catch(issue => { if (active) setError(issue.message); });
    return () => { active = false; controller.abort(); };
  }, [enabled, revision]);
  return { options, error, retry: () => setRevision(value => value + 1) };
}

export default function EmployeeSelect({ label, value, options = [], onChange, required = false, disabled = false, placeholder = 'Not assigned' }) {
  const choices = [...new Set(options.filter(option => typeof option === 'string' && option.trim()))];
  const existing = value && !choices.includes(value);
  return <label>{label}<select required={required} disabled={disabled} value={value || ''} onChange={event => onChange(event.target.value)}><option value="">{placeholder}</option>{existing && <option value={value}>{value} (existing value)</option>}{choices.map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
}
