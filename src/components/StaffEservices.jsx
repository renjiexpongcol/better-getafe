import { StatusBadge } from './ui/Primitives'
import { useEffect, useRef, useState } from "react";
import { REQUEST_STATUSES } from "../data/eserviceWorkflow";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import StaffRequestProcessing from "./StaffRequestProcessing";
import "./StaffRequestDetail.css";
import StaffAssessment from "./StaffAssessment";
import StaffBillingOperations from "./StaffBillingOperations";
import {
  esApi,
  useEservice,
  Feedback,
  RequestTable,
  DynamicFields,
  Activity,
  label,
  date,
} from "./EserviceUI";
export default function StaffEservices() {
  const { id } = useParams();
  return <StaffEservicesPage key={id || "queue"} />;
}

function StaffEservicesPage() {
  const { id } = useParams(),
    [params, setParams] = useSearchParams(),
    { user } = useAuth();
  const [tab, setTab] = useState("Application"),
    [message, setMessage] = useState(""),
    [documentMessage, setDocumentMessage] = useState(""),
    [internal, setInternal] = useState(true),
    [due, setDue] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const mutationPending = useRef(false), contentRef = useRef(null);
  const openTab = value => {
    setTab(value);
    if (window.matchMedia("(max-width: 1100px)").matches) window.requestAnimationFrame(() => contentRef.current?.scrollIntoView({ block: "start" }));
  };
  const queueRefresh = useRef(null);
  const [search,setSearch] = useState(params.get('search')||'');
  const routeSearch = params.get('search')||'';
  useEffect(()=>setSearch(routeSearch),[routeSearch]);
  useEffect(()=>{if(search===routeSearch)return;const timer=setTimeout(()=>{const next=new URLSearchParams(params);next.set('search',search);next.set('page','1');setParams(next,{replace:true})},350);return()=>clearTimeout(timer)},[search,routeSearch,params,setParams]);
  const queueStatus = params.get('status') ?? 'SUBMITTED';
  const queueParams = new URLSearchParams(params);
  if (!queueParams.has('status')) queueParams.set('status', 'SUBMITTED');
  useEffect(() => {
    if (id) return;
    const refresh = () => { if (document.visibilityState === 'visible') queueRefresh.current?.(); };
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [id]);
  const state = useEservice(
    (signal) =>
      esApi(
        id
          ? `/staff/eservices/requests/${id}`
          : `/staff/eservices/requests?${queueParams.toString()}`,
        "GET", undefined, undefined, {signal}),
    [id, params.toString()],
  );
  useEffect(() => {
    queueRefresh.current = state.loading && !state.error ? null : state.refresh;
    return () => { queueRefresh.current = null; };
  }, [state.loading, state.error, state.refresh]);
  const options = useEservice((signal) => esApi("/staff/eservices/options", "GET", undefined, undefined, {signal}), []);
  const filter = (key, value) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== "page") next.set("page", "1");
    setParams(next);
  };
  const act = async (path, data) => {
    if (mutationPending.current) return false;
    mutationPending.current = true;
    setBusy(true);
    state.setError("");
    setNotice("");
    try {
      await esApi(
        `/staff/eservices/requests/${id}/${path}`,
        "POST",
        { ...data, version: state.data.version },
        crypto.randomUUID(),
      );
      await state.refresh();
      setNotice("Request updated.");
      return true;
    } catch (e) {
      state.setError(e.message);
      return false;
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  };
  const can = (permission) => user?.permissions?.includes(permission),
    request = id ? state.data : null;
  const closed = ["COMPLETED", "REJECTED", "CANCELLED"].includes(request?.status);
  return (
    <main className={`es-workspace ${id ? "staff-request-detail" : ""}`}>
      {!id && <h1>E-service requests</h1>}
      <Feedback error={state.error} loading={state.loading && !state.data && !state.error} notice={notice} />
      {!id ? (
        <>
          <p>Incoming requests refresh every 5 seconds.</p>
          <div className="es-toolbar" aria-label="Department request views"><label>Sort<select value={params.get('sort')|| (queueStatus==='SUBMITTED'?'submitted_asc':'submitted_desc')} onChange={event=>filter('sort',event.target.value)}><option value="submitted_asc">Oldest submitted</option><option value="submitted_desc">Newest submitted</option><option value="updated_desc">Recently updated</option><option value="updated_asc">Least recently updated</option><option value="priority">Priority / due date</option></select></label>
            <button type="button" className="es-secondary" aria-pressed={queueStatus === 'SUBMITTED'} onClick={() => filter('status', 'SUBMITTED')}>Incoming queue</button>
            <button type="button" className="es-secondary" aria-pressed={queueStatus === ''} onClick={() => filter('status', '')}>All submitted requests</button>
            <button type="button" className="es-secondary" disabled={state.loading && !state.error} onClick={state.refresh}>Refresh queue</button>
          </div>
          <div className="es-toolbar">
            <label>
              Search
              <input
                placeholder="Reference, business, owner or staff EID"
                value={search} maxLength={100}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Status
              <select
                value={queueStatus}
                onChange={(e) => filter("status", e.target.value)}
              >
                <option value="">All submitted requests</option>
                {REQUEST_STATUSES.filter((s) => s !== "DRAFT").map((s) => (
                  <option key={s} value={s}>{label(s)}</option>
                ))}
              </select>
            </label>
          </div>
          <details className="es-queue-filters">
            <summary>More filters{['service_id','department_id','assigned','from','to'].some(key => params.get(key)) ? ' (active)' : ''}</summary>
            <div className="es-toolbar">
            <label>
              Service
              <select
                value={params.get("service_id") || ""}
                onChange={(e) => filter("service_id", e.target.value)}
              >
                <option value="">All services</option>
                {options.data?.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Office
              <select
                value={params.get("department_id") || ""}
                onChange={(e) => filter("department_id", e.target.value)}
              >
                <option value="">All assigned offices</option>
                {options.data?.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assignment
              <select
                value={params.get("assigned") || ""}
                onChange={(e) => filter("assigned", e.target.value)}
              >
                <option value="">All</option>
                <option value="me">Assigned to me</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </label>
            <label>
              From
              <input
                type="date"
                value={params.get("from") || ""}
                onChange={(e) => filter("from", e.target.value)}
              />
            </label>
            <label>
              Until
              <input
                type="date"
                value={params.get("to") || ""}
                onChange={(e) => filter("to", e.target.value)}
              />
            </label>
          </div>
          </details>
          {params.toString() && <button type="button" className="es-secondary" onClick={() => { setSearch(''); setParams({}) }}>Reset queue</button>}
          {state.data && (
            <>
              <p>{state.data.total} {state.data.total === 1 ? 'matching request' : 'matching requests'}</p>
              <RequestTable
                items={state.data.items}
                base="/app/staff/e-requests"
              />
              <div className="es-toolbar">
                <button
                  disabled={Number(params.get("page") || 1) === 1}
                  onClick={() =>
                    filter("page", String(Number(params.get("page") || 1) - 1))
                  }
                >
                  Previous
                </button>
                <span>Page {params.get("page") || 1}</span>
                <button
                  disabled={
                    Number(params.get("page") || 1) * 20 >= state.data.total
                  }
                  onClick={() =>
                    filter("page", String(Number(params.get("page") || 1) + 1))
                  }
                >
                  Next
                </button>
              </div>
            </>
          )}
          {can("billing.manage") && <StaffBillingOperations />}
        </>
      ) : (
        request && (
          <>
            <Link to="/app/staff/e-requests">Back to incoming queue</Link>
            <header className="staff-request-header"><div><p className="staff-request-kicker">Service request</p><h1>{request.request_number}</h1><h2>{request.service.name}</h2></div><StatusBadge value={request.status} audience="staff"/></header>
            <dl className="es-metadata">
              <div>
                <dt>Status</dt>
                <dd>{label(request.status)}</dd>
              </div>
              <div>
                <dt>Applicant</dt>
                <dd>{request.applicant?.name || request.applicant_user_id}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{date(request.submitted_at)}</dd>
              </div>
              <div>
                <dt>Assigned to</dt>
                <dd>{request.assigned_user_name || "Unassigned"}</dd>
              </div>
            </dl>
            <div className="staff-request-layout"><div className="staff-request-content" ref={contentRef}>
            <nav className="es-tabs" aria-label="Request sections">
              {[
                "Application",
                "Documents",
                "Assessment & payment",
                "Messages & notes",
                "Activity",
              ].map((t) => (
                <button
                  className="es-secondary"
                  aria-pressed={tab === t}
                  key={t}
                  onClick={() => openTab(t)}
                >
                  {t}
                </button>
              ))}
            </nav>
            {tab === "Application" && (
              <>
                {request.appointment && <section className="es-section"><h2>Appointment</h2><dl className="es-metadata"><div><dt>Date and time</dt><dd>{date(request.appointment.appointment_at)}</dd></div><div><dt>Contact number</dt><dd>{request.appointment.contact_number}</dd></div><div><dt>Status</dt><dd>{label(request.appointment.status)}</dd></div></dl><p><strong>Reason:</strong> {request.appointment.reason}</p></section>}
                {request.business && <section className="es-section"><h2>Business details</h2><dl className="es-metadata"><div><dt>Business name</dt><dd>{request.business.business_name}</dd></div><div><dt>Reference</dt><dd>{request.business.business_reference}</dd></div><div><dt>Ownership</dt><dd>{request.business.ownership_type}</dd></div><div><dt>Address</dt><dd>{Object.values(request.business.address || {}).filter(v=>typeof v==='string').join(', ') || "—"}</dd></div></dl></section>}
                <section className="es-section"><h2>Application details</h2>
                {!request.fields.length && <p>No additional application fields.</p>}
                <DynamicFields
                  fields={request.fields}
                  values={request.values}
                  disabled
                  setValues={() => {}}
                /></section>
              </>
            )}
            {tab === "Documents" && (
              <section>
                <h2>Documents</h2>
                {!request.requirements.length && <p>No documents are required for this service.</p>}
                {can("documents.process") && !closed && <label>Document review reason<textarea value={documentMessage} onChange={event => setDocumentMessage(event.target.value)} /></label>}
                {request.requirements.map((r) => (
                  <section className="es-section" key={r.id}>
                    <h2>{r.label}</h2>
                    {request.documents
                      .filter((d) => d.requirement_id === r.id)
                      .map((d) => (
                        <div key={d.id}>
                          <p>
                            <a
                              href={`/api/staff/eservices/requests/${id}/documents/${d.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {d.original_filename}
                            </a>{" "}
                            · {label(d.status)} · {label(d.scan_status)}
                          </p>
                          <p>{d.review_reason}</p>
                          {can("documents.process") && !closed && !request.documents.some(
                            (n) => n.replaces_id === d.id,
                          ) && (
                            <div className="es-toolbar">
                              {[
                                "ACCEPTED",
                                "REPLACEMENT_REQUIRED",
                                "REJECTED",
                              ].map((status) => (
                                <button
                                  className="es-secondary"
                                  key={status}
                                  disabled={busy}
                                  onClick={() =>
                                    act("documents", {
                                      document_id: d.id,
                                      status,
                                      reason: documentMessage,
                                    })
                                  }
                                >
                                  {label(status)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                  </section>
                ))}
                {can("requests.department.process") && request.steps?.find(step => step.status === request.status)?.next_statuses?.includes("NEEDS_INFORMATION") && <>
                <h3>Request applicant corrections</h3>
                <label>
                  Instructions for the applicant
                  <textarea
                    value={documentMessage}
                    onChange={(e) => setDocumentMessage(e.target.value)}
                  />
                </label>
                <label>
                  Correction due date
                  <input
                    type="datetime-local"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy || !documentMessage.trim()}
                  onClick={() =>
                    act("request-information", {
                      message: documentMessage,
                      due_at: due ? `${due}+08:00` : null,
                    })
                  }
                >
                  Request information
                </button></>}
              </section>
            )}
            {tab === "Assessment & payment" && <StaffAssessment key={request.id} request={request} can={can} busy={busy} act={act} refresh={state.refresh} />}
            {tab === "Messages & notes" && (
              <section><h2>Messages & notes</h2>
                {!request.notes.length && <p>No messages or notes yet.</p>}
                {request.notes.map((n) => (
                  <section className="es-section" key={n.id}>
                    <strong>
                      {n.visibility === "INTERNAL"
                        ? "Internal staff note"
                        : "Applicant message"}
                    </strong>
                    <time>{date(n.created_at)}</time>
                    <p>{n.message}</p>
                  </section>
                ))}
                {can("requests.department.process") && !["COMPLETED", "REJECTED", "CANCELLED"].includes(request.status) && <>
                <label>
                  Message
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                  />
                  Internal note (staff only)
                </label>
                <button
                  disabled={busy || !message}
                  onClick={() =>
                    act("notes", {
                      message,
                      visibility: internal ? "INTERNAL" : "APPLICANT",
                    })
                  }
                >
                  Add {internal ? "internal note" : "applicant message"}
                </button></>}
              </section>
            )}
            {tab === "Activity" && (
              <>
                <Activity history={request.history} />
                <h3>Processing history</h3>
                {request.actions?.map((action) => (
                  <p key={action.id}>
                    {date(action.created_at)} · {action.staff_label} · {label(action.action.replaceAll('.',' '))} · {label(action.metadata.status)}{' '}
                    {action.metadata.reason || action.metadata.official_number || action.metadata.reference}
                  </p>
                ))}
              </>
            )}
            </div><StaffRequestProcessing key={`${request.id}:${request.status}:${request.assigned_user_id || "unassigned"}`} request={request} options={options} can={can} user={user} busy={busy} act={act} openTab={openTab} /></div>
          </>
        )
      )}
    </main>
  );
}
