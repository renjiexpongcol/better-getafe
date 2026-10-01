import { useEffect, useId, useRef, useState } from "react";
import { requestJson } from "../services/apiClient";
import { esApi, Feedback } from "./EserviceUI";

export function CatalogCombobox({ label, placeholder, value, onChange, search, disabled = false }) {
  const id = useId();
  const [query, setQuery] = useState(value?.name || "");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const typing = useRef(false);
  useEffect(() => { if (!typing.current) setQuery(value?.name || ""); typing.current = false; }, [value]);
  useEffect(() => {
    if (!open || value || disabled) return;
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setError("");
    setItems([]);
    setActive(-1);
    const timer = setTimeout(() => {
      search(query.trim(), controller.signal).then(result => {
        if (current) setItems(result);
      }).catch(e => {
        if (current && e.name !== "AbortError") setError(e.message);
      }).finally(() => { if (current) setLoading(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [query, open, value, disabled, search]);
  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);
  const choose = item => { onChange(item); setOpen(false); setActive(-1); };
  return <div className="es-combobox" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id}>{label}</label>
    <div className="es-combobox-input">
      <input id={id} role="combobox" autoComplete="off" aria-autocomplete="list"
        aria-expanded={open && !value} aria-controls={`${id}-list`}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        aria-describedby={`${id}-status`} disabled={disabled} placeholder={placeholder} value={query}
        onFocus={() => setOpen(true)} onChange={e => { if (value) typing.current = true; onChange(null); setQuery(e.target.value); setOpen(true); }}
        onKeyDown={e => {
          if (e.key === "Escape" || e.key === "Tab") { setOpen(false); setActive(-1); }
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault(); setOpen(true);
            if (items.length) setActive(index => e.key === "ArrowDown" ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1));
          }
          if (e.key === "Enter" && open) { e.preventDefault(); if (active >= 0 && items[active] && !items[active].disabled) choose(items[active]); }
        }} />
      {(query || value) && <button type="button" className="es-secondary" disabled={disabled} aria-label={`Clear ${label.toLowerCase()}`} onClick={() => { onChange(null); setQuery(""); setOpen(false); document.getElementById(id)?.focus(); }}>Clear</button>}
    </div>
    <div id={`${id}-status`} role="status" className="es-selector-status">{open && !value ? error || (loading ? "Searching…" : !query && label === "Staff member" ? "Enter a name, email or staff ID." : !items.length ? "No matches found." : `${items.length} matches`) : value ? `Selected: ${value.name}` : ""}</div>
    {open && !value && <ul id={`${id}-list`} role="listbox" aria-label={`${label} matches`} className="es-combobox-list">
      {items.map((item, index) => <li key={item.id} id={`${id}-${index}`} role="option" aria-selected={active === index} aria-disabled={item.disabled || undefined}
        onMouseDown={e => e.preventDefault()} onClick={() => { if (!item.disabled) choose(item); }}>
        <strong>{item.name}</strong>{item.email && <small>{item.email} · Staff ID: {item.id}</small>}{item.disabled && <small>Already assigned</small>}
      </li>)}
    </ul>}
  </div>;
}
const searchStaff = async (query, signal) => query ? (await requestJson(`/admin/eservices/staff-search?q=${encodeURIComponent(query)}&limit=10`, { signal })).items : [];

export default function StaffDepartmentAccess({ departments = [] }) {
  const [staff, setStaff] = useState(null), [office, setOffice] = useState(null);
  const [memberships, setMemberships] = useState([]), [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [retry, setRetry] = useState(0);
  const dialog = useRef(null);
  useEffect(() => {
    setMemberships([]); setOffice(null); setLoaded(false); setError(""); setNotice("");
    if (!staff) { setLoading(false); return; }
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    requestJson(`/admin/eservices/department-members?user_id=${encodeURIComponent(staff.id)}`, { signal: controller.signal })
      .then(result => { if (current) { setMemberships(result.items); setLoaded(true); } })
      .catch(e => { if (current && e.name !== "AbortError") setError(e.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [staff, retry]);
  useEffect(() => { if (confirmation) dialog.current?.showModal(); }, [confirmation]);
  const searchOffice = useRef(null);
  // Keep the search function stable across unrelated input renders.
  searchOffice.current = async query => departments.filter(d => d.published !== false && d.name.toLowerCase().includes(query.toLowerCase())).map(d => ({ ...d, disabled: memberships.some(m => m.department_id === d.id) }));
  const stableOfficeSearch = useRef((...args) => searchOffice.current(...args)).current;
  const mutate = async () => {
    const action = confirmation;
    setBusy(true); setError(""); setNotice("");
    try {
      await esApi(`/admin/eservices/department-members${action.remove ? "/revoke" : ""}`, "POST", { user_id: staff.id, department_id: action.office.id });
      setMemberships(items => action.remove ? items.filter(m => m.department_id !== action.office.id) : [...items, { department_id: action.office.id, department_name: action.office.name }]);
      setOffice(null); setNotice(action.remove ? "Department access removed." : "Department access granted.");
      dialog.current.close(); setConfirmation(null);
    } catch (e) { setError(e.message); dialog.current.close(); setConfirmation(null); }
    finally { setBusy(false); }
  };
  return <section className="es-section es-department-access">
    <h2>Department access</h2>
    <p>Control which municipal offices a staff member can access.</p>
    <Feedback error={error} notice={notice} loading={loading} />
    {staff && error && !loaded && <button className="es-secondary" onClick={() => setRetry(count => count + 1)}>Retry loading access</button>}
    <form className="es-access-form" onSubmit={e => { e.preventDefault(); if (staff && office && loaded && !busy) setConfirmation({ office }); }}>
      <CatalogCombobox label="Staff member" placeholder="Search staff by name, email, or ID…" value={staff} onChange={setStaff} search={searchStaff} disabled={busy} />
      <CatalogCombobox label="Office" placeholder="Search municipal offices…" value={office} onChange={setOffice} search={stableOfficeSearch} disabled={!staff || !loaded || busy} />
      <button disabled={!staff || !office || !loaded || busy || memberships.some(m => m.department_id === office.id)}>Grant department access</button>
    </form>
    {staff && <div className="es-access-existing"><h3>{staff.name}</h3><small>Staff ID: {staff.id}</small><h3>Existing access</h3>
      {loaded && !memberships.length && <p>No department access assigned.</p>}
      <ul>{memberships.map(m => <li key={m.department_id}><span>{m.department_name}</span><button className="es-secondary" disabled={busy} onClick={() => setConfirmation({ remove: true, office: { id: m.department_id, name: m.department_name } })}>Remove<span className="es-sr-only"> access to {m.department_name}</span></button></li>)}</ul>
    </div>}
    <dialog ref={dialog} className="es-access-dialog" onCancel={e => { if (busy) e.preventDefault(); else setConfirmation(null); }}>
      <h2>{confirmation?.remove ? "Remove department access" : "Grant department access"}</h2>
      <p>{confirmation?.remove ? "Remove" : "Grant"} <strong>{staff?.name}</strong> access to:</p>
      <p><strong>{confirmation?.office.name}</strong></p>
      <div className="es-toolbar"><button disabled={busy} onClick={mutate}>{busy ? "Saving…" : "Confirm"}</button><button className="es-secondary" disabled={busy} onClick={() => { dialog.current.close(); setConfirmation(null); }}>Cancel</button></div>
    </dialog>
  </section>;
}
