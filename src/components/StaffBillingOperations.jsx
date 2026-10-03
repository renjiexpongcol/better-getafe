import { useState, useEffect } from "react";
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
  const [partySearch, setPartySearch] = useState(""),
    [partyQuery, setPartyQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setPartyQuery(partySearch), 300);
    return () => clearTimeout(timer);
  }, [partySearch]);
  const parties = useEservice(
    (signal) =>
      partyQuery.length >= 2
        ? esApi(
            `/staff/eservices/billing-parties?q=${encodeURIComponent(partyQuery)}`,
            "GET",
            undefined,
            undefined,
            { signal },
          )
        : Promise.resolve({ items: [] }),
    [partyQuery],
  );
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
            Find resident or business
            <input
              value={partySearch}
              onChange={(e) => setPartySearch(e.target.value)}
              placeholder="Name, email or business account"
            />
          </label>
          <label>
            Account holder
            <select
              required
              value={`${data.user_id}:${data.business_id}`}
              onChange={(e) => {
                const selected = parties.data?.items.find(
                  (p) => `${p.id}:${p.business_id || ""}` === e.target.value,
                );
                if (selected)
                  setData({
                    ...data,
                    user_id: selected.id,
                    business_id: selected.business_id || "",
                  });
              }}
            >
              <option value=":">Choose a matching account</option>
              {parties.data?.items.map((p) => (
                <option
                  key={`${p.id}:${p.business_id || ""}`}
                  value={`${p.id}:${p.business_id || ""}`}
                >
                  {p.name} · {p.email}
                  {p.business_name
                    ? ` · ${p.business_name} (${p.business_reference})`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          <Feedback error={parties.error} loading={parties.loading} />
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
            ["property_identifier", "Property identifier"],
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
                  <td>
                    {options.data?.departments.find(
                      (d) => d.id === row.department_id,
                    )?.name || "Municipal office"}
                  </td>
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
