import { useCallback, useEffect, useRef, useState } from 'react';
import { Plug, RefreshCw, Search } from 'lucide-react';
import { requestJson } from '../services/apiTransport.js';
import ModalDialog from './ModalDialog';
import './AdminIntegrations.css';
import AdminApiKeys from './AdminApiKeys.jsx';
import './AdminApiKeys.css';

const base = '/api/admin/integration-hub';
const stamp = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Never';
const statusLabel = value => (value || 'disconnected').replaceAll('_', ' ');

export default function AdminIntegrations({ permissions = [] }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(''), [dialog, setDialog] = useState(null), [history, setHistory] = useState(null);
  const [configuration, setConfiguration] = useState({}), [secrets, setSecrets] = useState({});
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const active = useRef(true), operation = useRef(false);
  const canViewHub = permissions.includes('integrations.view');
  const can = action => permissions.includes(`integrations.${action}`);
  const load = useCallback(async () => {
    try { const result = await requestJson(base); if (active.current) { setData(result); setError(''); } }
    catch (failure) { if (active.current) setError(failure.message); }
    finally { if (active.current) setLoading(false); }
  }, []);
  useEffect(() => {
    active.current = true;
    if (canViewHub) load();
    else setLoading(false);
    return () => { active.current = false; };
  }, [canViewHub, load]);
  useEffect(() => {
    if (!canViewHub || data?.worker?.ready !== false) return;
    let cancelled = false;
    let timer;
    const refresh = async () => {
      await load();
      if (!cancelled) timer = setTimeout(refresh, 10000);
    };
    timer = setTimeout(refresh, 10000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [canViewHub, data?.worker?.ready, load]);
  const run = async work => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); await load(); }
    catch (failure) { setError(failure.message); }
    finally { operation.current = false; setBusy(false); }
  };
  const edit = (definition, installation) => {
    setError(''); setConfiguration(installation?.configuration || {}); setSecrets({});
    setDialog({ kind: 'configure', definition, installation });
  };
  const close = () => { setDialog(null); setSecrets({}); setHistory(null); setError(''); };
  const save = event => {
    event.preventDefault();
    run(async () => {
      let id = dialog.installation?.id;
      if (!id || JSON.stringify(configuration) !== JSON.stringify(dialog.installation.configuration)) {
        id = (await requestJson(`${base}/installations`, { method: 'POST', body: JSON.stringify({ connectorId: dialog.definition.id, configuration }) })).id;
      }
      if (Object.values(secrets).some(Boolean)) await requestJson(`${base}/installations/${id}/credentials`, { method: 'PUT', body: JSON.stringify(secrets) });
      close(); setNotice('Configuration saved. Test the connection to verify availability.');
    });
  };
  const action = (installation, name) => run(async () => {
    const result = await requestJson(`${base}/installations/${installation.id}/${name}`, { method: 'POST', headers: name === 'test' ? { 'Idempotency-Key': crypto.randomUUID() } : {}, body: '{}' });
    if (name === 'authorize') { window.location.assign(result.authorizationUrl); return; }
    setNotice(name === 'test' ? 'Connection test queued. Refresh to see the result.' : 'Connector updated.'); close();
  });
  const viewHistory = installation => run(async () => { const result = await requestJson(`${base}/installations/${installation.id}/history`); setHistory(result); setDialog({ kind: 'history', installation }); });
  if (!canViewHub) return <section className="integration-hub"><AdminApiKeys permissions={permissions} /></section>;
  return <section className="integration-hub" aria-busy={loading || busy}>
    <header className="hub-heading"><div><h1><Plug size={24} aria-hidden="true" />Integrations</h1><p>Connections and recent activity</p></div><button type="button" onClick={load} disabled={busy || loading}><RefreshCw size={16} aria-hidden="true" />Refresh</button></header>
    {!dialog && error && <p className="hub-error" role="alert">{error}</p>}
    <p role="status" className="hub-notice">{notice}</p>
    {loading && <p role="status">Loading integrations…</p>}
    {data && <>
      <dl className="hub-metrics"><div><dt>Configured connectors</dt><dd>{data.installations.length}</dd></div>{['connected','disconnected','degraded','failed','pending_authorization'].map(status => <div key={status}><dt>{statusLabel(status)}</dt><dd>{data.stats[status]}</dd></div>)}</dl>
      <p className={`hub-worker ${data.worker.ready ? '' : 'hub-error'}`} role="status">Worker: {data.worker.ready ? 'available' : 'unavailable — queued work will wait for a worker'}</p>
      {!!data.alerts?.length && <ul className="hub-error" aria-label="Integration alerts">{data.alerts.map((alert, index) => <li key={index}>{data.catalog.find(d => d.id === alert.connectorId)?.name}: {alert.message}</li>)}</ul>}
      <label className="hub-search"><Search size={16} aria-hidden="true" /><span>Find a connector</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="hub-table hub-catalog"><table><caption>Connector catalog</caption><thead><tr><th scope="col">Provider</th><th scope="col">Status</th><th scope="col">Last successful execution</th><th scope="col">Last health check</th><th scope="col">Actions</th></tr></thead><tbody>
        {data.catalog.filter(definition => `${definition.name} ${definition.description}`.toLowerCase().includes(search.toLowerCase())).map(definition => {
          const installation = data.installations.find(row => row.connector_id === definition.id);
          return <tr key={definition.id}><th scope="row"><strong>{definition.name}</strong><small>{definition.description}</small><small>{statusLabel(definition.authentication)}</small></th><td data-label="Status"><span className={`hub-status hub-status-${installation?.status || 'disconnected'}`}>{statusLabel(installation?.status)}</span></td><td data-label="Last successful execution">{stamp(installation?.last_success_at)}</td><td data-label="Last health check">{stamp(installation?.last_health_at)}</td><td data-label="Actions"><div className="hub-actions">
            {can('configure') && <button type="button" disabled={busy} onClick={() => edit(definition, installation)}>Configure</button>}
            {installation && <>
              {definition.authentication === 'oauth2' && can('connect') && <button type="button" disabled={busy || !installation.credentials_configured} onClick={() => action(installation, 'authorize')}>Authorize</button>}
              {can('test') && definition.operations.includes('test_connection') && <button type="button" disabled={busy || !installation.enabled} onClick={() => action(installation, 'test')}>Test connection</button>}
              {can('logs.view') && <button type="button" disabled={busy} onClick={() => viewHistory(installation)}>History</button>}
              {can('configure') && installation.enabled && <button type="button" disabled={busy} onClick={() => action(installation, 'disable')}>Disable</button>}
              {can('disconnect') && installation.credentials_configured && <button type="button" disabled={busy} onClick={() => setDialog({ kind: 'disconnect', installation })}>Disconnect</button>}
            </>}
          </div></td></tr>;
        })}
      </tbody></table>{!data.catalog.some(d => `${d.name} ${d.description}`.toLowerCase().includes(search.toLowerCase())) && <p>No matching connectors.</p>}</div>
      <h2>Usage in the last 24 hours</h2><div className="hub-table"><table><thead><tr><th scope="col">Connector</th><th scope="col">Attempts</th><th scope="col">Successful</th><th scope="col">Failed</th><th scope="col">Average latency</th><th scope="col">Timeouts</th><th scope="col">Rate limits</th><th scope="col">Retries</th></tr></thead><tbody>{data.usage.map(row => <tr key={row.installation_id}><th scope="row">{data.catalog.find(d => d.id === data.installations.find(i => i.id === row.installation_id)?.connector_id)?.name}</th><td>{row.requests}</td><td>{row.successful}</td><td>{row.failed}</td><td>{row.average_latency_ms} ms</td><td>{row.timeouts}</td><td>{row.rate_limits}</td><td>{row.retries}</td></tr>)}</tbody></table>{!data.usage.length && <p>No executions recorded.</p>}</div><p className="hub-note">{data.billing}</p>
    </>}
    {dialog && <ModalDialog label={dialog.kind === 'configure' ? `Configure ${dialog.definition.name}` : dialog.kind === 'history' ? 'Integration history' : 'Disconnect connector'} busy={busy} onClose={close} size="large"><div className="integration-hub portal-action-modal hub-dialog">
      <h2>{dialog.kind === 'configure' ? dialog.definition.name : dialog.kind === 'history' ? 'Execution and audit history' : 'Disconnect connector'}</h2>
      {error && <p className="hub-error" role="alert">{error}</p>}
      {dialog.kind === 'configure' && <form onSubmit={save}>
        {Object.entries(dialog.definition.configuration.properties).map(([key, field]) => <label key={key}>{field.title}<input required={dialog.definition.configuration.required.includes(key)} maxLength={field.maxLength} min={field.minimum} max={field.maximum} type={field.type === 'integer' ? 'number' : field.format === 'uri' ? 'url' : 'text'} value={configuration[key] ?? ''} placeholder={field.default ? String(field.default) : undefined} onChange={event => { const next = { ...configuration }; if (!event.target.value && field.type === 'integer') delete next[key]; else next[key] = field.type === 'integer' ? Number(event.target.value) : event.target.value; setConfiguration(next); }} /></label>)}
        <p className="hub-note">Changing configuration clears the stored credentials and disconnects this connector.</p>
        {can('credentials.rotate') && <fieldset><legend>{dialog.installation?.credentials_configured ? 'Replace credentials (optional)' : 'Credentials'}</legend>{Object.entries(dialog.definition.credentials.properties).map(([key, field]) => <label key={key}>{field.title}<input type="password" autoComplete="new-password" maxLength={field.maxLength} minLength={field.minLength} required={Object.values(secrets).some(Boolean)} value={secrets[key] || ''} onChange={event => setSecrets({ ...secrets, [key]: event.target.value })} /></label>)}<p className="hub-note">Stored credentials are never displayed. Leave blank to keep them.</p></fieldset>}
        <div className="hub-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save configuration'}</button></div>
      </form>}
      {dialog.kind === 'disconnect' && <><p>Disconnecting removes stored credentials and cancels pending work. Google authorization is revoked before credentials are removed.</p><div className="hub-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="button" disabled={busy} onClick={() => action(dialog.installation, 'disconnect')}>Disconnect</button></div></>}
      {dialog.kind === 'history' && history && <><div className="hub-table"><table><thead><tr><th scope="col">Operation</th><th scope="col">Status</th><th scope="col">Attempts</th><th scope="col">Result</th><th scope="col">Created</th><th scope="col">Action</th></tr></thead><tbody>{history.jobs.map(job => <tr key={job.id}><td>{statusLabel(job.operation)}</td><td>{job.status}</td><td>{job.attempts}</td><td>{statusLabel(job.error_code || '—')}</td><td>{stamp(job.created_at)}</td><td>{job.status === 'dead' && can('jobs.retry') && <button type="button" disabled={busy} onClick={() => run(async () => { await requestJson(`${base}/jobs/${job.id}/retry`, { method: 'POST', body: '{}' }); setHistory(await requestJson(`${base}/installations/${dialog.installation.id}/history`)); })}>Retry</button>}</td></tr>)}</tbody></table>{!history.jobs.length && <p>No jobs recorded.</p>}</div><h3>Audit history</h3><ul>{history.audit.map((entry, index) => <li key={index}>{entry.action} · {stamp(entry.created_at)}</li>)}</ul><button type="button" onClick={close}>Close</button></>}
    </div></ModalDialog>}
    <AdminApiKeys permissions={permissions} />
  </section>;
}
