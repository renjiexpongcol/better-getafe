import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { requestJson, apiFetch } from "../services/apiClient";
import "./EserviceUI.css";
import { publicStatus, fieldProfileSource } from '../data/serviceApplication';

export const esApi = (path, method = "GET", data, operationKey, options = {}) =>
  requestJson(path, {
    ...options,
    method,
    ...(data ? { body: JSON.stringify(data) } : {}),
    headers: operationKey ? { "Idempotency-Key": operationKey } : {},
  });
export const label = (value) =>
  ({
    IN_REVIEW: "Under review",
    NEEDS_INFORMATION: "Action required",
    AWAITING_PAYMENT: "Ready for payment",
    ASSESSMENT_PAYMENT: "Assessment + Payment",
    INFORMATION: "Information only",
  })[value] ||
  String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (v) => v.toUpperCase());
export const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    value,
  );
export const date = (value) =>
  value
    ? new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" })
    : "—";
export function useEservice(load, dependencies) {
  const currentKey = JSON.stringify(dependencies),
    [loadedKey, setLoadedKey] = useState(null);
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await load();
      setData(result);
      setLoadedKey(currentKey);
      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    load(controller.signal)
      .then((result) => {
        if (active) {
          setData(result);
          setLoadedKey(currentKey);
        }
      })
      .catch((e) => {
        if (active) {
          setData(null);
          setLoadedKey(currentKey);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, dependencies);
  return {
    data: loadedKey === currentKey ? data : null,
    setData,
    error,
    setError,
    loading: loading || loadedKey !== currentKey,
    refresh,
  };
}
export function Feedback({ error, notice, loading }) {
  return (
    <>
      {loading && <p role="status">Loading…</p>}
      {error && (
        <p className="es-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="es-notice" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
export function DynamicFields({ fields, values, setValues, disabled = false }) {
  const update = (key, value) => setValues({ ...values, [key]: value });
  return (
    <div className="es-form">
      {fields
        .filter(
          (f) =>
            !f.visibility || values[f.visibility.field] === f.visibility.equals,
        )
        .map((field) => {
          const props = {
            id: `field-${field.id}`,
            disabled: disabled || field.profile_readonly || fieldProfileSource(field) === 'user_id',
            required: field.required,
            value: values[field.key] ?? "",
            onChange: (event) => update(field.key, event.target.value),
            maxLength: field.validation?.maxLength || 4000,
            min: field.validation?.min,
            max: field.validation?.max,
          };
          return (
            <div className="es-field" key={field.id}>
              <label htmlFor={props.id}>
                {field.label}
                {field.required ? " *" : ""}
              </label>
              {field.type === "textarea" ? (
                <textarea {...props} />
              ) : field.type === "address" ? (
                <fieldset className="es-address"><legend className="es-sr">{field.label}</legend>
                  {[
                    "house",
                    "street",
                    "purok_sitio",
                    "barangay",
                    "municipality",
                    "province",
                    "postal_code",
                  ].map((key) => (
                    <label key={key}>
                      {label(key)}
                      <input
                        disabled={props.disabled}
                        value={values[field.key]?.[key] || ""}
                        onChange={(e) =>
                          update(field.key, {
                            ...values[field.key],
                            [key]: e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                </fieldset>
              ) : field.type === "select" ? (
                <select {...props}>
                  <option value="">Choose…</option>
                  {field.options.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : field.type === "radio" ? (
                <fieldset>
                  <legend className="es-sr">{field.label}</legend>
                  {field.options.map((option) => (
                    <label key={option}>
                      <input
                        type="radio"
                        name={field.key}
                        disabled={props.disabled}
                        required={field.required}
                        checked={values[field.key] === option}
                        onChange={() => update(field.key, option)}
                      />
                      {option}
                    </label>
                  ))}
                </fieldset>
              ) : field.type === "checkbox" ? (
                <input
                  id={props.id}
                  type="checkbox"
                  disabled={props.disabled}
                  required={field.required}
                  checked={Boolean(values[field.key])}
                  onChange={(e) => update(field.key, e.target.checked)}
                />
              ) : (
                <input
                  {...props}
                  type={
                    ["currency", "number"].includes(field.type)
                      ? "number"
                      : field.type === "telephone"
                        ? "tel"
                        : ["email", "date"].includes(field.type)
                          ? field.type
                          : "text"
                  }
                  step={field.type === "currency" ? "0.01" : undefined}
                />
              )}{" "}
              {field.help_text && <small>{field.help_text}</small>}
            </div>
          );
        })}
    </div>
  );
}
export function RequestTable({ items, base }) {
  const staff = base.includes("/staff/");
  return items.length ? (
    <div className="es-table-wrap">
      <table className="es-table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Service</th>
            {staff && <th>Applicant</th>}
            <th>Submitted</th>
            <th>Status</th>
            {staff && <th>Assigned</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>
                <Link to={`${base}/${row.id}`}>{row.request_number}</Link>
              </td>
              <td>
                {row.service_name}
                {row.business_name && (
                  <small style={{ display: "block" }}>
                    {row.business_name}
                  </small>
                )}
              </td>
              {staff && <td>{row.applicant_name}</td>}
              <td>{date(row.submitted_at)}</td>
              <td>
                <span className="es-status">{staff ? label(row.status) : row.public_status || publicStatus(row.status)}</span>
              </td>
              {staff && <td>{row.assigned_user_name || "Unassigned"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="es-empty">No requests match this view.</p>
  );
}
export function Activity({ history }) {
  return (
    <ol className="es-timeline">
      {history.map((event) => (
        <li key={event.id}>
          <strong>{event.staff_label ? label(event.to_status) : publicStatus(event.to_status)}</strong>
          <time>{date(event.created_at)}</time>
          {event.staff_label && (
            <p>
              {event.staff_label}
              {event.from_status
                ? ` · ${label(event.from_status)} → ${label(event.to_status)}`
                : ""}
            </p>
          )}
          {event.reason && <p>{event.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
export function OrderView({ order, staff = false, onRefresh }) {
  const [amount, setAmount] = useState(""),
    [reference, setReference] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [officialNumber, setOfficialNumber] = useState(""),
    [receiptPayment, setReceiptPayment] = useState(""),
    [rejection, setRejection] = useState(""),
    [viewReceipt, setViewReceipt] = useState(null);
  const pending = order.attempts?.find((a) => a.status === "PENDING");
  const receipt = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await esApi(
        `/staff/eservices/payment-orders/${order.id}/receipt`,
        "POST",
        { payment_id: receiptPayment, official_number: officialNumber },
        crypto.randomUUID(),
      );
      setOfficialNumber("");
      await onRefresh();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await esApi(
        `/staff/eservices/payment-orders/${order.id}/confirm`,
        "POST",
        {
          amount: pending?.amount || amount,
          reference: pending?.payer_reference || reference,
          ...(pending ? { attempt_id: pending.id } : {}),
        },
        crypto.randomUUID(),
      );
      await onRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="es-section">
      <h2>{order.order_number}</h2>
      <dl className="es-metadata">
        <div>
          <dt>Amount</dt>
          <dd>{money(order.amount)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{label(order.status)}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>{date(order.expires_at)}</dd>
        </div>
        <div>
          <dt>Billing period</dt>
          <dd>{order.billing_period || "As assessed"}</dd>
        </div>
        <div>
          <dt>Assessment date</dt>
          <dd>{date(order.assessed_at)}</dd>
        </div>
      </dl>
      <div className="es-table-wrap">
        <table className="es-table es-order-table">
          <thead>
            <tr>
              <th>Assessment</th>
              <th>Amount</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.description}
                  <small className="es-charge-source">{item.source}</small>
                </td>
                <td>
                  {item.fee_type === "CREDIT" ? "− " : ""}
                  {money(item.amount)}
                </td>
                <td>{item.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {order.status !== "PAID" && (
        <p>
          For manual payment, present this payment order to the Municipal
          Treasury.
        </p>
      )}
      <h3>Payment history</h3>
      {order.payments.length ? (
        <ul>
          {order.payments.map((payment) => (
            <li key={payment.id}>
              {money(payment.amount)} · {label(payment.status)} ·{" "}
              {label(payment.method)} ·{" "}
              {payment.payment_reference || payment.provider_reference} ·{" "}
              {date(payment.verified_at)}{" "}
              {order.adjustments?.some((a) => a.payment_id === payment.id)
                ? "· Reversed"
                : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p>No verified payments yet.</p>
      )}
      <h3>Payment confirmations</h3>
      {order.receipts.map((receipt) => (
        <p key={receipt.id}>
          {receipt.kind === "OFFICIAL"
            ? `Official receipt ${receipt.official_number}`
            : `Payment confirmation · ${order.order_number}`}{" "}
          · {date(receipt.created_at)}
          {receipt.kind === "OFFICIAL" && (
            <button
              className="es-secondary"
              onClick={() => setViewReceipt(receipt)}
            >
              View receipt
            </button>
          )}
        </p>
      ))}
      {order.receipts.length > 0 && (
        <p>A payment confirmation is separate from an official receipt.</p>
      )}
      {viewReceipt && (
        <section className="es-section" aria-label="Official receipt details">
          <h3>Official receipt {viewReceipt.official_number}</h3>
          <p>Assessment: {order.order_number}</p>
          <p>Issued: {date(viewReceipt.created_at)}</p>
          <p>
            Amount paid:{" "}
            {money(
              order.payments.find((p) => p.id === viewReceipt.payment_id)
                ?.amount,
            )}
          </p>
          <p>
            Method:{" "}
            {label(
              order.payments.find((p) => p.id === viewReceipt.payment_id)
                ?.method,
            )}
          </p>
          <p>
            Payment date:{" "}
            {date(
              order.payments.find((p) => p.id === viewReceipt.payment_id)
                ?.paid_at,
            )}
          </p>
          <button className="es-secondary" onClick={() => window.print()}>
            Print receipt details
          </button>
          <button className="es-secondary" onClick={() => setViewReceipt(null)}>
            Close receipt details
          </button>
        </section>
      )}
      {!!order.attempts?.length && (
        <section>
          <h3>Payment submissions</h3>
          {order.attempts.map((a) => (
            <p key={a.id}>
              {a.reference} · {money(a.amount)} ·{" "}
              {a.status === "PENDING"
                ? "Pending payment verification"
                : label(a.status)}{" "}
              · {label(a.method)} · {date(a.created_at)}
              {a.reason ? ` · ${a.reason}` : ""}
            </p>
          ))}
        </section>
      )}
      <Feedback error={error} />
      {staff && pending && (
        <section className="es-section">
          <p>
            Submitted reference: <strong>{pending.payer_reference}</strong> ·{" "}
            {money(pending.amount)} · {label(pending.method)}
          </p>
          <label>
            Reason for returning payment
            <textarea
              value={rejection}
              onChange={(e) => setRejection(e.target.value)}
            />
          </label>
          <button
            className="es-secondary"
            disabled={busy || !rejection}
            onClick={async () => {
              setBusy(true);
              try {
                await esApi(
                  `/staff/eservices/payment-orders/${order.id}/reject-submission`,
                  "POST",
                  { attempt_id: pending.id, reason: rejection },
                  crypto.randomUUID(),
                );
                await onRefresh();
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Return for correction
          </button>
        </section>
      )}
      {staff &&
        order.payments.some(
          (p) =>
            p.status === "CONFIRMED" &&
            !order.receipts.some(
              (r) => r.kind === "OFFICIAL" && r.payment_id === p.id,
            ) &&
            !order.adjustments?.some((a) => a.payment_id === p.id),
        ) && (
          <form className="es-form" onSubmit={receipt}>
            <h3>Record issued official receipt</h3>
            <label htmlFor="receipt-payment">Verified payment</label>
            <select
              id="receipt-payment"
              required
              value={receiptPayment}
              onChange={(e) => setReceiptPayment(e.target.value)}
            >
              <option value="">Choose payment</option>
              {order.payments
                .filter(
                  (p) =>
                    p.status === "CONFIRMED" &&
                    !order.receipts.some(
                      (r) => r.kind === "OFFICIAL" && r.payment_id === p.id,
                    ) &&
                    !order.adjustments?.some((a) => a.payment_id === p.id),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.provider_reference} · {money(p.amount)}
                  </option>
                ))}
            </select>
            <label>
              Official receipt number
              <input
                required
                maxLength={100}
                value={officialNumber}
                onChange={(e) => setOfficialNumber(e.target.value)}
              />
            </label>
            <button disabled={busy}>Record official receipt</button>
          </form>
        )}
      {staff &&
        ["UNPAID", "PARTIALLY_PAID", "ISSUED"].includes(order.status) && (
          <form className="es-form" onSubmit={confirm}>
            <h3>Verify Treasury payment</h3>
            <label>
              Amount received
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={pending?.amount || amount}
                readOnly={Boolean(pending)}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label>
              Cashier transaction reference
              <input
                value={pending?.payer_reference || reference}
                readOnly={Boolean(pending)}
                onChange={(e) => setReference(e.target.value)}
                required
              />
            </label>
            <Feedback error={error} />
            <button disabled={busy}>Confirm verified payment</button>
          </form>
        )}
    </section>
  );
}
export async function uploadDocument(request, requirement, file, replaces) {
  const response = await apiFetch(`/requests/${request.id}/documents`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Filename": encodeURIComponent(file.name),
      "X-Requirement-Id": requirement.id,
      "X-Request-Version": String(request.version),
      "Idempotency-Key": crypto.randomUUID(),
      ...(replaces ? { "X-Replaces-Id": replaces } : {}),
    },
    body: file,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "The document could not be uploaded.");
  return result;
}
