import { useState } from "react";
import { REQUEST_STATUSES } from "../data/eserviceWorkflow";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import StaffBillingOperations from "./StaffBillingOperations";
import {
  esApi,
  useEservice,
  Feedback,
  RequestTable,
  DynamicFields,
  Activity,
  OrderView,
  label,
  date,
} from "./EserviceUI";
export default function StaffEservices() {
  const { id } = useParams(),
    [params, setParams] = useSearchParams(),
    { user } = useAuth();
  const [tab, setTab] = useState("Application"),
    [message, setMessage] = useState(""),
    [internal, setInternal] = useState(true),
    [assigned, setAssigned] = useState(""),
    [target, setTarget] = useState(""),
    [due, setDue] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [order, setOrder] = useState(null);
  const [feeCodes,setFeeCodes] = useState([]),[billingPeriod,setBillingPeriod] = useState('');
  const state = useEservice(
    () =>
      esApi(
        id
          ? `/staff/eservices/requests/${id}`
          : `/staff/eservices/requests?${params.toString()}`,
      ),
    [id, params.toString()],
  );
  const options = useEservice(() => esApi("/staff/eservices/options"), []);
  const filter = (key, value) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== "page") next.set("page", "1");
    setParams(next);
  };
  const act = async (path, data) => {
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
    } catch (e) {
      state.setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const loadOrder = async (oid) => {
    try {
      setOrder(await esApi(`/staff/eservices/payment-orders/${oid}`));
    } catch (e) {
      state.setError(e.message);
    }
  };
  const can = (permission) => user?.permissions?.includes(permission),
    request = id ? state.data : null;
  return (
    <main className="es-workspace">
      <h1>
        {id ? request?.request_number || "Request" : "E-service requests"}
      </h1>
      <Feedback error={state.error} loading={state.loading} notice={notice} />
      {!id ? (
        <>
          <div className="es-toolbar">
            <label>
              Search
              <input
                placeholder="Reference, business, owner or staff EID"
                value={params.get("search") || ""}
                onChange={(e) => filter("search", e.target.value)}
              />
            </label>
            <label>
              Status
              <select
                value={params.get("status") || ""}
                onChange={(e) => filter("status", e.target.value)}
              >
                <option value="">All requests</option>
                {REQUEST_STATUSES.filter((s) => s !== "DRAFT").map((s) => (
                  <option key={s} value={s}>{label(s)}</option>
                ))}
              </select>
            </label>
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
          {state.data && (
            <>
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
            <Link to="/app/staff/e-requests">All requests</Link>
            <h2>{request.service.name}</h2>
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
            <nav className="es-tabs">
              {[
                "Application",
                "Documents",
                "Assessment & payment",
                "Messages & notes",
                "Activity",
              ].map((t) => (
                <button
                  className="es-secondary"
                  aria-selected={tab === t}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </nav>
            {tab === "Application" && (
              <>
                {request.business && <section className="es-section"><h2>{request.business.business_name}</h2><p>{request.business.business_reference} · {request.business.ownership_type}</p><p>{Object.values(request.business.address || {}).filter(v=>typeof v==='string').join(', ')}</p></section>}
                <DynamicFields
                  fields={request.fields}
                  values={request.values}
                  disabled
                  setValues={() => {}}
                />
                {can("requests.department.assign") && (
                  <section className="es-section">
                    <label>
                      Assigned staff
                      <select
                        value={assigned}
                        onChange={(e) => setAssigned(e.target.value)}
                      >
                        <option value="">Assign to me</option>
                        {options.data?.members
                          .filter(
                            (m) => m.department_id === request.department_id,
                          )
                          .map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.staff_label || 'Staff member'}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="es-toolbar">
                      <button
                        disabled={busy}
                        onClick={() =>
                          act("assign", {
                            assigned_user_id: assigned || user.id,
                          })
                        }
                      >
                        {assigned ? "Assign staff" : "Assign to me"}
                      </button>
                    </div>
                  </section>
                )}
                <section className="es-section">
                  <label>
                    Next status
                    <select
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">Choose…</option>
                      {request.steps
                        .find((s) => s.status === request.status)
                        ?.next_statuses.filter(
                          (s) =>
                            ![
                              "AWAITING_PAYMENT",
                              "PAID",
                              "NEEDS_INFORMATION",
                            ].includes(s),
                        )
                        .map((s) => (
                          <option key={s} value={s}>{label(s)}</option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Reason
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || !target}
                    onClick={() =>
                      act(target === "APPROVED" ? "approve" : "status", {
                        status: target,
                        reason: message,
                      })
                    }
                  >
                    Update status
                  </button>
                </section>
              </>
            )}
            {tab === "Documents" && (
              <section>
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
                          {!request.documents.some(
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
                                      reason: message,
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
                <label>
                  Reason for replacement or rejection
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
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
                  disabled={busy || !message}
                  onClick={() =>
                    act("request-information", {
                      message,
                      due_at: due ? `${due}+08:00` : null,
                    })
                  }
                >
                  Request information
                </button>
              </section>
            )}
            {tab === "Assessment & payment" && (
              <section>
                {can("assessments.adjust") &&
                  request.status === "AWAITING_PAYMENT" && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        act("adjust-assessment", { reason: message });
                      }}
                    >
                      <label>
                        Reason for applying the current authorized fee schedule
                        <textarea
                          required
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                        />
                      </label>
                      <button disabled={busy || !message}>
                        Replace unpaid assessment
                      </button>
                    </form>
                  )}
                {can("assessments.create") &&
                  request.status === "FOR_ASSESSMENT" && (
                    <div className="es-form"><label>Assessment due date<input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)} /></label>
                    <label>Billing period<input maxLength={100} value={billingPeriod} onChange={e=>setBillingPeriod(e.target.value)} placeholder="e.g. Q4 2026" /></label>
                    {request.business && <fieldset><legend>Applicable configured charges</legend>{request.fees?.map(fee=><label key={fee.code}><input type="checkbox" checked={feeCodes.includes(fee.code)} onChange={e=>setFeeCodes(e.target.checked?[...feeCodes,fee.code]:feeCodes.filter(c=>c!==fee.code))} />{fee.description} · ₱{fee.amount}</label>)}</fieldset>}
                    <button
                      disabled={busy}
                      onClick={() => act("assessment", {fee_codes:feeCodes,billing_period:billingPeriod,due_at:due?`${due}+08:00`:null})}
                    >
                      Issue assessment and payment order
                    </button>
                    </div>
                  )}
                {request.orders.map((o) => (
                  <p key={o.id}>
                    <button
                      className="es-secondary"
                      onClick={() => loadOrder(o.id)}
                    >
                      {o.order_number} · {label(o.status)}
                    </button>
                  </p>
                ))}
                {order && (
                  <OrderView
                    order={order}
                    staff={can("payments.verify")}
                    onRefresh={async () => {
                      await loadOrder(order.id);
                      await state.refresh();
                    }}
                  />
                )}
              </section>
            )}
            {tab === "Messages & notes" && (
              <section>
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
                </button>
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
          </>
        )
      )}
    </main>
  );
}
