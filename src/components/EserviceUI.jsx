import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { requestJson, apiFetch } from "../services/apiClient";
import "./EserviceUI.css";

export const esApi = (path, method = "GET", data, operationKey, options = {}) =>
  requestJson(path, {
    ...options,
    method,
    ...(data ? { body: JSON.stringify(data) } : {}),
    headers: operationKey ? { "Idempotency-Key": operationKey } : {},
  });
export const label = (value) =>
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
            disabled,
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
                <div className="es-address">
                  {[
                    "house",
                    "street",
                    "barangay",
                    "municipality",
                    "province",
                    "postal_code",
                  ].map((key) => (
                    <label key={key}>
                      {label(key)}
                      <input
                        disabled={disabled}
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
                </div>
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
                        disabled={disabled}
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
                  disabled={disabled}
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
              <td>{row.service_name}</td>
              {staff && <td>{row.applicant_name}</td>}
              <td>{date(row.submitted_at)}</td>
              <td>
                <span className="es-status">{label(row.status)}</span>
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
          <strong>{label(event.to_status)}</strong>
          <time>{date(event.created_at)}</time>
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
  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await esApi(
        `/staff/eservices/payment-orders/${order.id}/confirm`,
        "POST",
        { amount, reference },
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
      </dl>
      <table className="es-table">
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
              <td>{item.description}</td>
              <td>{money(item.amount)}</td>
              <td>{item.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Online payment is currently unavailable.</p>
      <p>
        For manual payment, present this payment order to the Municipal
        Treasury.
      </p>
      <h3>Payment history</h3>
      {order.payments.length ? (
        <ul>
          {order.payments.map((payment) => (
            <li key={payment.id}>
              {money(payment.amount)} · {label(payment.status)} ·{" "}
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
            : `Payment confirmation ${receipt.id}`}{" "}
          · {date(receipt.created_at)}
        </p>
      ))}
      {order.receipts.length > 0 && (
        <p>A payment confirmation is separate from an official receipt.</p>
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
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label>
              Cashier transaction reference
              <input
                value={reference}
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
