import { useState } from "react";
import { esApi, useEservice, Feedback } from "./EserviceUI";
export default function StaffBillingOperations() {
  const options = useEservice(() => esApi("/staff/eservices/options"), []),
    [report, setReport] = useState(null),
    [data, setData] = useState({
      account_type: "WATER",
      account_number: "",
      property_identifier: "",
      business_id: "",
      user_id: "",
      department_id: "",
      source: "",
      source_reference: "",
      period: "",
      due_at: "",
    }),
    [items, setItems] = useState([{ description: "", amount: "" }]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await esApi(
        "/staff/eservices/billing",
        "POST",
        {
          ...data,
          business_id: data.business_id || null,
          due_at: data.due_at ? `${data.due_at}+08:00` : null,
          items,
        },
        crypto.randomUUID(),
      );
      setNotice(
        `Statement recorded. Payment order ${result.order.order_number} issued.`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="es-section">
      <h2>Authorized billing entry</h2>
      <Feedback error={error || options.error} notice={notice} />
      <form onSubmit={submit}>
        <div className="es-form">
          <label>
            Account type
            <select
              value={data.account_type}
              onChange={(e) =>
                setData({ ...data, account_type: e.target.value })
              }
            >
              {["BUSINESS", "REAL_PROPERTY", "WATER", "OTHER"].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Office
            <select
              required
              value={data.department_id}
              onChange={(e) =>
                setData({ ...data, department_id: e.target.value })
              }
            >
              <option value="">Choose…</option>
              {options.data?.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {[
            ["account_number", "Account number"],
            ["user_id", "Resident user ID"],
            ["property_identifier", "Property identifier"],
            ["business_id", "Business ID"],
            ["source", "Authorized source"],
            ["source_reference", "Source transaction reference"],
            ["period", "Billing period"],
          ].map(([key, name]) => (
            <label key={key}>
              {name}
              <input
                required={!["property_identifier", "business_id"].includes(key)}
                value={data[key]}
                onChange={(e) => setData({ ...data, [key]: e.target.value })}
              />
            </label>
          ))}
          <label>
            Due date
            <input
              type="datetime-local"
              value={data.due_at}
              onChange={(e) => setData({ ...data, due_at: e.target.value })}
            />
          </label>
        </div>
        <h3>Statement items</h3>
        {items.map((item, index) => (
          <div key={index} className="es-config-row">
            <label>
              Description
              <input
                required
                value={item.description}
                onChange={(e) =>
                  setItems(
                    items.map((row, i) =>
                      i === index
                        ? { ...row, description: e.target.value }
                        : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              Amount
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={item.amount}
                onChange={(e) =>
                  setItems(
                    items.map((row, i) =>
                      i === index ? { ...row, amount: e.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="es-secondary"
              disabled={items.length === 1}
              onClick={() => setItems(items.filter((_, i) => i !== index))}
            >
              Remove item
            </button>
          </div>
        ))}
        <div className="es-toolbar">
          <button
            type="button"
            className="es-secondary"
            onClick={() =>
              setItems([...items, { description: "", amount: "" }])
            }
          >
            Add item
          </button>
          <button disabled={busy}>Record authorized statement</button>
          <button
            type="button"
            className="es-secondary"
            onClick={async () => {
              try {
                setReport(await esApi("/staff/eservices/report"));
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            View processing report
          </button>
        </div>
      </form>
      {report && (
        <div className="es-table-wrap">
          <table className="es-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Status</th>
                <th>Requests</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((row) => (
                <tr key={`${row.department_id}:${row.status}`}>
                  <td>{row.department_id}</td>
                  <td>{row.status}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Pending notifications: {report.outbox[0]?.pending || 0}</p>
        </div>
      )}
    </section>
  );
}
