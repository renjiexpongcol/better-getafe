import { useEffect, useState } from "react";
import { esApi, useEservice, Feedback, label, money } from "./EserviceUI";
import { cachedRequest, invalidateCached } from "../services/requestCache";
import StaffDepartmentAccess from "./StaffDepartmentAccess";
import { REQUEST_STATUSES } from "../data/eserviceWorkflow";
const blank = {
  name: "",
  slug: "",
  kind: "APPLICATION",
  version: 1,
  fields: [],
  steps: [],
  requirements: [],
  fees: [],
  definition: { declaration: "" },
  published: false,
  online_available: false,
};
const statuses = REQUEST_STATUSES;
export default function AdminEservices() {
  const [audit, setAudit] = useState(null);
  const [edit, setEdit] = useState(null),
    [tab, setTab] = useState("General"),
    [search, setSearch] = useState(""),
    [department, setDepartment] = useState(""),
    [published, setPublished] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [category, setCategory] = useState(""),
    [categorySlug, setCategorySlug] = useState("");
  const [savedPublished, setSavedPublished] = useState(false);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(timer); }, [search]);
  const options = useEservice(() => cachedRequest("cms:service-catalog-options", () => esApi("/admin/services/options"), { ttl: 60000 }), []);
  const state = useEservice(signal => esApi(`/admin/services?q=${encodeURIComponent(debouncedSearch)}&department=${encodeURIComponent(department)}&published=${published}&page=${page}&limit=20`, "GET", undefined, undefined, { signal }), [debouncedSearch, department, published, page]);
  const filtered = state.data?.items || [];
  const total = state.data?.total ?? filtered.length;
  const pages = Math.max(1, Math.ceil(total / 20));
  const currentPage = page;
  const patch = (key, value) => setEdit({ ...edit, [key]: value });
  const row = (collection, index, key, value) =>
    patch(
      collection,
      edit[collection].map((entry, i) =>
        i === index ? { ...entry, [key]: value } : entry,
      ),
    );
  const add = (collection, value) =>
    patch(collection, [...edit[collection], value]);
  const remove = (collection, index) =>
    patch(
      collection,
      edit[collection].filter((_, i) => i !== index),
    );
  const open = async (id) => {
    setBusy(true);
    try {
      const service = await esApi(`/admin/services/${id}`);
      setEdit(service);
      setSavedPublished(service.published);
      setTab("General");
    } catch (e) {
      state.setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (edit.published !== savedPublished && !window.confirm(edit.published ? `Publish ${edit.name}? These settings will be available to residents.` : `Unpublish ${edit.name}? New applications will no longer be available.`)) return;
    setBusy(true);
    state.setError("");
    try {
      const result = await esApi(
        `/admin/services${edit.id ? `/${edit.id}` : ""}`,
        edit.id ? "PUT" : "POST",
        { ...edit, declaration: edit.definition?.declaration || "" },
      );
      setEdit(result);
      setSavedPublished(result.published);
      await state.refresh();
      setNotice(
        "Service configuration saved. Existing applications retain their original configuration.",
      );
    } catch (e) {
      state.setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const input = (key, title, type = "text") => (
    <label>
      {title}
      <input
        type={type}
        value={edit[key] ?? ""}
        onChange={(e) => patch(key, e.target.value)}
      />
    </label>
  );
  const select = (key, title, items) => (
    <label>
      {title}
      <select
        value={edit[key] ?? ""}
        onChange={(e) => patch(key, e.target.value)}
      >
        <option value="">Choose…</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <main className="es-workspace es-catalog">
      <h1>E-Services · Service catalog</h1>
      <button
        className="es-secondary"
        onClick={async () => {
          try {
            setAudit(await esApi("/admin/eservices/audit"));
          } catch (error) {
            state.setError(error.message);
          }
        }}
      >
        View audit history
      </button>
      {audit && (
        <div className="es-table-wrap">
          <table className="es-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Record</th>
                <th>Actor</th>
                <th>Time</th>
                <th>Correlation</th>
              </tr>
            </thead>
            <tbody>
              {audit.items.map((event) => (
                <tr key={event.id}>
                  <td>{event.action}</td>
                  <td>{event.setting_key}</td>
                  <td>{event.user_id}</td>
                  <td>
                    {new Date(event.created_at).toLocaleString("en-PH", {
                      timeZone: "Asia/Manila",
                    })}
                  </td>
                  <td>{event.correlation_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="es-secondary" onClick={() => setAudit(null)}>
            Close audit history
          </button>
        </div>
      )}
      <Feedback error={state.error || options.error} notice={notice} loading={state.loading || options.loading} />
      {!edit ? (
        <>
          <div className="es-toolbar">
            <label>
              Search
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </label>
            <label>
              Department
              <select
                value={department}
                onChange={(e) => { setDepartment(e.target.value); setPage(1); }}
              >
                <option value="">All offices</option>
                {options.data?.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Publishing
              <select
                value={published}
                onChange={(e) => { setPublished(e.target.value); setPage(1); }}
              >
                <option value="">All</option>
                <option value="true">Published</option>
                <option value="false">Unpublished</option>
              </select>
            </label>
            <button
              onClick={() => {
                setEdit(structuredClone(blank));
                setSavedPublished(false);
                setNotice("");
              }}
            >
              Create service
            </button>
          </div>
          <div className="es-table-wrap">
            <table className="es-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Applications</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        <br />
                        {s.slug}
                      </td>
                      <td>{s.department_name || "Unassigned"}</td>
                      <td><span className={`es-catalog-status ${s.published ? "is-published" : ""}`}>{s.published ? "Published" : "Unpublished"}</span></td>
                      <td>{s.online_available ? "Online" : "Office only"}</td>
                      <td>
                        <button
                          className="es-secondary"
                          disabled={busy}
                          onClick={() => open(s.id)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                {!state.loading && !filtered.length && <tr><td colSpan={5}>No services match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <nav className="es-toolbar es-pagination" aria-label="Catalog pagination"><span>{total} services · Page {currentPage} of {pages}</span><button className="es-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="es-secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>
          <section className="es-section">
            <h2>Service categories</h2>
            <form
              className="es-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (categoryBusy) return;
                setCategoryBusy(true);
                try {
                  await esApi("/admin/service-categories", "POST", {
                    name: category,
                    slug: categorySlug,
                  });
                  setCategory("");
                  setCategorySlug("");
                  invalidateCached("cms:service-catalog-options");
                  await options.refresh();
                } catch (e) {
                  state.setError(e.message);
                } finally { setCategoryBusy(false); }
              }}
            >
              <label>
                Name
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                />
              </label>
              <label>
                Slug
                <input
                  value={categorySlug}
                  onChange={(e) => setCategorySlug(e.target.value)}
                  required
                />
              </label>
              <button disabled={categoryBusy}>{categoryBusy ? "Saving…" : "Create category"}</button>
            </form>
          </section>
          <StaffDepartmentAccess departments={options.data?.departments || []} />
        </>
      ) : (
        <>
          <div className="es-toolbar">
            <button className="es-secondary" onClick={() => { if (window.confirm("Leave the service editor? Unsaved changes will be lost.")) setEdit(null); }}>
              Back to catalog
            </button>
            <button disabled={busy} onClick={save}>
              Save service
            </button>
            {edit.id && (
              <button
                className="es-secondary"
                onClick={() =>
                  setEdit({
                    ...edit,
                    id: undefined,
                    slug: `${edit.slug}-copy`,
                    name: `${edit.name} (copy)`,
                    published: false,
                    version: 1,
                  })
                }
              >
                Duplicate
              </button>
            )}
          </div>
          <nav className="es-tabs" aria-label="Service editor">
            {[
              "General",
              "Requirements",
              "Application form",
              "Documents",
              "Fees",
              "Workflow",
              "Payments",
              "Notifications",
              "Publishing",
            ].map((name) => (
              <button
                key={name}
                aria-pressed={tab === name}
                className="es-secondary"
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </nav>
          {tab === "General" && (
            <div className="es-form">
              {input("name", "Name")}
              {input("slug", "Slug")}
              {select(
                "department_id",
                "Owning department",
                options.data?.departments || [],
              )}
              {select("category_id", "Category", options.data?.categories || [])}
              <label>
                Service type
                <select
                  value={edit.kind}
                  onChange={(e) => patch("kind", e.target.value)}
                >
                  {[
                    "APPLICATION",
                    "BUSINESS_NEW",
                    "BUSINESS_RENEWAL",
                    "BUSINESS",
                    "REAL_PROPERTY",
                    "WATER",
                    "PAYMENT_ORDER",
                    "DIRECTORY",
                  ].map((kind) => (
                    <option key={kind}>{kind}</option>
                  ))}
                </select>
              </label>
              {input("short_description", "Short description")}
              <label>
                Description
                <textarea
                  value={edit.description || ""}
                  onChange={(e) => patch("description", e.target.value)}
                />
              </label>
              {input("eligibility", "Who may apply")}
              {input("processing_time", "Processing time")}
              <label>
                Instructions
                <textarea
                  value={edit.instructions || ""}
                  onChange={(e) => patch("instructions", e.target.value)}
                />
              </label>
              {input("icon", "Icon")}
              {input("hero_image", "Hero image storage path")}
              <label>
                Contact email
                <input
                  type="email"
                  value={edit.contact?.email || ""}
                  onChange={(e) =>
                    patch("contact", { ...edit.contact, email: e.target.value })
                  }
                />
              </label>
              <label>
                Contact phone
                <input
                  value={edit.contact?.phone || ""}
                  onChange={(e) =>
                    patch("contact", { ...edit.contact, phone: e.target.value })
                  }
                />
              </label>
            </div>
          )}
          {["Requirements", "Documents"].includes(tab) && (
            <>
              <p>
                Required attachments are configured here and apply to this
                service revision.
              </p>
              {edit.requirements.map((r, i) => (
                <div key={i} className="es-config-row">
                  <label>
                    Code
                    <input
                      value={r.code}
                      onChange={(e) =>
                        row("requirements", i, "code", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Document label
                    <input
                      value={r.label}
                      onChange={(e) =>
                        row("requirements", i, "label", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Help text
                    <input
                      value={r.help_text || ""}
                      onChange={(e) =>
                        row("requirements", i, "help_text", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={r.required}
                      onChange={(e) =>
                        row("requirements", i, "required", e.target.checked)
                      }
                    />
                    Required
                  </label>
                  <button
                    className="es-secondary"
                    onClick={() => remove("requirements", i)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  add("requirements", { code: "", label: "", required: true })
                }
              >
                Add requirement
              </button>
            </>
          )}
          {tab === "Application form" && (
            <>
              <div>
                <label htmlFor="es-declaration">Applicant declaration</label>
                <textarea
                  id="es-declaration"
                  value={edit.definition?.declaration || ""}
                  onChange={(e) =>
                    patch("definition", {
                      ...edit.definition,
                      declaration: e.target.value,
                    })
                  }
                />
              </div>
              {edit.kind === "BUSINESS_NEW" && (
                <p>
                  Include a business_name field and an address field named
                  business_address.
                </p>
              )}
              {edit.fields.map((f, i) => (
                <div key={i} className="es-config-row">
                  <label>
                    Field key
                    <input
                      value={f.key}
                      onChange={(e) => row("fields", i, "key", e.target.value)}
                    />
                  </label>
                  <label>
                    Label
                    <input
                      value={f.label}
                      onChange={(e) =>
                        row("fields", i, "label", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Type
                    <select
                      value={f.type}
                      onChange={(e) => row("fields", i, "type", e.target.value)}
                    >
                      {[
                        "text",
                        "textarea",
                        "email",
                        "telephone",
                        "number",
                        "currency",
                        "date",
                        "select",
                        "radio",
                        "checkbox",
                        "address",
                      ].map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Help text
                    <input
                      value={f.help_text || ""}
                      onChange={(e) =>
                        row("fields", i, "help_text", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Options, one per line
                    <textarea
                      value={(f.options || []).join("\n")}
                      onChange={(e) =>
                        row("fields", i, "options", e.target.value.split("\n"))
                      }
                    />
                  </label>
                  <label>
                    Maximum length
                    <input
                      type="number"
                      value={f.validation?.maxLength || ""}
                      onChange={(e) =>
                        row("fields", i, "validation", {
                          ...f.validation,
                          maxLength: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                  </label>
                  <label>
                    Minimum value
                    <input
                      type="number"
                      value={f.validation?.min ?? ""}
                      onChange={(e) =>
                        row("fields", i, "validation", {
                          ...f.validation,
                          min: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                  </label>
                  <label>
                    Maximum value
                    <input
                      type="number"
                      value={f.validation?.max ?? ""}
                      onChange={(e) =>
                        row("fields", i, "validation", {
                          ...f.validation,
                          max: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                  </label>
                  <label>
                    Visible when field
                    <select
                      value={f.visibility?.field || ""}
                      onChange={(e) =>
                        row(
                          "fields",
                          i,
                          "visibility",
                          e.target.value
                            ? { field: e.target.value, equals: "" }
                            : null,
                        )
                      }
                    >
                      <option value="">Always visible</option>
                      {edit.fields
                        .filter((x) => x.key !== f.key)
                        .map((x) => (
                          <option key={x.key}>{x.key}</option>
                        ))}
                    </select>
                  </label>
                  {f.visibility && (
                    <label>
                      Equals
                      <input
                        value={f.visibility.equals}
                        onChange={(e) =>
                          row("fields", i, "visibility", {
                            ...f.visibility,
                            equals: e.target.value,
                          })
                        }
                      />
                    </label>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) =>
                        row("fields", i, "required", e.target.checked)
                      }
                    />
                    Required
                  </label>
                  <button
                    className="es-secondary"
                    onClick={() => remove("fields", i)}
                  >
                    Remove field
                  </button>
                  <button
                    className="es-secondary"
                    disabled={i === 0}
                    onClick={() => {
                      const entries = [...edit.fields];
                      [entries[i - 1], entries[i]] = [
                        entries[i],
                        entries[i - 1],
                      ];
                      patch("fields", entries);
                    }}
                  >
                    Move up
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  add("fields", {
                    key: "",
                    label: "",
                    type: "text",
                    required: false,
                    options: [],
                    validation: {},
                  })
                }
              >
                Add field
              </button>
            </>
          )}
          {tab === "Fees" && (
            <>
              {edit.fees.map((f, i) => (
                <div key={i} className="es-config-row">
                  {["code", "description", "amount", "source"].map((key) => (
                    <label key={key}>
                      {label(key)}
                      <input
                        type={key === "amount" ? "number" : "text"}
                        min="0"
                        step={key === "amount" ? "0.01" : undefined}
                        value={f[key]}
                        onChange={(e) => row("fees", i, key, e.target.value)}
                      />
                    </label>
                  ))}
                  <span>{money(f.amount)}</span>
                  <button
                    className="es-secondary"
                    onClick={() => remove("fees", i)}
                  >
                    Remove fee
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  add("fees", {
                    code: "",
                    description: "",
                    amount: "0.00",
                    source: "",
                  })
                }
              >
                Add authorized fee
              </button>
            </>
          )}
          {tab === "Workflow" && (
            <>
              {edit.steps.map((s, i) => (
                <div key={i} className="es-config-row">
                  <label>
                    {i + 1}. Status
                    <select
                      value={s.status}
                      onChange={(e) =>
                        row("steps", i, "status", e.target.value)
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Label
                    <input
                      value={s.label}
                      onChange={(e) => row("steps", i, "label", e.target.value)}
                    />
                  </label>
                  <label>
                    Required permission
                    <select
                      value={s.permission}
                      onChange={(e) =>
                        row("steps", i, "permission", e.target.value)
                      }
                    >
                      {[
                        "requests.own.update",
                        "requests.department.process",
                        "requests.department.approve",
                        "payments.verify",
                        "assessments.create",
                      ].map((permission) => (
                        <option key={permission}>{permission}</option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="es-wide">
                    <legend>Allowed next steps</legend>
                    {edit.steps
                      .filter((n) => n.status !== s.status)
                      .map((n) => (
                        <label key={n.status}>
                          <input
                            type="checkbox"
                            checked={s.next_statuses.includes(n.status)}
                            onChange={(e) =>
                              row(
                                "steps",
                                i,
                                "next_statuses",
                                e.target.checked
                                  ? [...s.next_statuses, n.status]
                                  : s.next_statuses.filter(
                                      (x) => x !== n.status,
                                    ),
                              )
                            }
                          />
                          {label(n.status)}
                        </label>
                      ))}
                  </fieldset>
                  <button
                    className="es-secondary"
                    onClick={() => remove("steps", i)}
                  >
                    Remove step
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  add("steps", {
                    status:
                      statuses.find(
                        (s) => !edit.steps.some((x) => x.status === s),
                      ) || "IN_REVIEW",
                    label: "",
                    permission: "requests.department.process",
                    next_statuses: [],
                  })
                }
              >
                Add workflow step
              </button>
            </>
          )}
          {tab === "Payments" && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={edit.payment_required}
                  onChange={(e) => patch("payment_required", e.target.checked)}
                />
                Payment required
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={edit.settings?.separation_of_duties !== false}
                  onChange={(e) =>
                    patch("settings", {
                      ...edit.settings,
                      separation_of_duties: e.target.checked,
                    })
                  }
                />
                Assessment and payment verification require different employees
              </label>
              <p>Online payment is currently unavailable.</p>
            </>
          )}
          {tab === "Notifications" && (
            <p>
              Application changes create resident notifications. Optional email
              delivery follows the resident’s notification preferences and the
              portal’s email configuration.
            </p>
          )}
          {tab === "Publishing" && (
            <div className="es-form">
              <label>
                <input
                  type="checkbox"
                  checked={edit.published}
                  onChange={(e) => patch("published", e.target.checked)}
                />
                Published
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={edit.online_available}
                  onChange={(e) => patch("online_available", e.target.checked)}
                />
                Online applications available
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={edit.appointment_required}
                  onChange={(e) =>
                    patch("appointment_required", e.target.checked)
                  }
                />
                Appointment required
              </label>
              {input("display_order", "Display order", "number")}
              {input("effective_from", "Effective from (ISO timestamp)")}
              {input("effective_until", "Effective until (ISO timestamp)")}
            </div>
          )}
        </>
      )}
    </main>
  );
}
