import { useEffect, useState } from "react";
import { esApi, useEservice, Feedback, label, money } from "./EserviceUI";
import { invalidateCached } from "../services/requestCache";
import StaffDepartmentAccess from "./StaffDepartmentAccess";
import { APPLICATION_STEPS, REQUEST_STATUSES } from "../data/eserviceWorkflow";
import { PROFILE_SOURCES } from '../data/serviceApplication';
import { BILLING_STEPS,WORKFLOW_TYPES,PAYMENT_METHODS } from '../data/businessBillingWorkflow';
import { useAuth } from "../context/AuthContext";
import './AdminEservices.css';
const editorSections = ["General", "Requirements", "Application form", "Workflow", "Fees", "Payments", "Notifications", "Publishing"];
const sectionNames = { General: "Service details", Requirements: "Required documents", Publishing: "Review and publish" };
const permissionLabels = {
  "requests.own.update": "Update own request",
  "requests.department.process": "Process department requests",
  "requests.department.approve": "Approve department requests",
  "payments.verify": "Verify payments",
  "assessments.create": "Create assessments",
};
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
  settings: { workflow_type: 'APPLICATION' },
};
const statuses = REQUEST_STATUSES;
export default function AdminEservices() {
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("services.catalog.manage");
  const canManageAccess = user?.permissions?.includes("eservices.admin");
  const [workspace, setWorkspace] = useState("Services");
  const [baseline, setBaseline] = useState(null);
  const [actionError, setActionError] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const canAudit = canManageAccess && user?.permissions?.includes("audit.view");
  const audit = useEservice(signal => esApi(`/admin/eservices/audit?page=${auditPage}`, "GET", undefined, undefined, {signal}), [auditPage, user?.id, Boolean(canAudit)], workspace === "Audit history" && canAudit);
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
  const options = useEservice((signal) => esApi("/admin/services/options", "GET", undefined, undefined, {signal}), []);
  const state = useEservice(signal => esApi(`/admin/services?q=${encodeURIComponent(debouncedSearch)}&department=${encodeURIComponent(department)}&published=${published}&page=${page}&limit=20`, "GET", undefined, undefined, { signal }), [debouncedSearch, department, published, page]);
  const filtered = state.data?.items || [];
  const total = state.data?.total ?? filtered.length;
  const pages = Math.max(1, Math.ceil(total / 20));
  const currentPage = page;
  const dirty = Boolean(edit && JSON.stringify(edit) !== JSON.stringify(baseline));
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const stage = editorSections.indexOf(tab);
  const startEditor = service => {
    setBaseline(service);
    setEdit(service);
    setSavedPublished(Boolean(service.published));
    setTab("General");
    setActionError("");
    setNotice("");
  };
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
      startEditor(service);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!canManage || busy || (edit.id && !dirty)) return;
    if (!edit.name?.trim() || !edit.slug?.trim()) {
      setTab("General");
      setActionError("Enter a service name and URL slug before saving.");
      return;
    }
    setActionError("");
    if (edit.published !== savedPublished && !window.confirm(edit.published ? `Publish ${edit.name}? These settings will be available to residents.` : `Unpublish ${edit.name}? New applications will no longer be available.`)) return;
    setBusy(true);
    setNotice("");
    state.setError("");
    try {
      const result = await esApi(
        `/admin/services${edit.id ? `/${edit.id}` : ""}`,
        edit.id ? "PUT" : "POST",
        { ...edit, declaration: edit.definition?.declaration || "" },
      );
      setBaseline(result);
      setEdit(result);
      setSavedPublished(result.published);
      await state.refresh();
      setNotice(
        "Service configuration saved. Existing applications retain their original configuration.",
      );
    } catch (e) {
      setActionError(e.message);
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
      <header className="esc-heading">
        <div>{edit && <button type="button" className="esc-back" disabled={busy} onClick={() => {
          if (!dirty || window.confirm("Discard unsaved changes and return to the catalog?")) { setEdit(null); setNotice(""); setActionError(""); }
        }}>Back to service catalog</button>}
        <h1>{edit ? edit.name || "New service" : "E-services"}</h1></div>
        {!edit && workspace === "Services" && canManage && <button disabled={busy || options.loading || !!options.error} onClick={() => startEditor(structuredClone(blank))}>Create service</button>}
      </header>
      {!edit && <nav className="esc-workspaces" aria-label="E-services administration">
        {["Services", "Categories", ...(canManageAccess ? ["Staff access"] : []), ...(canManageAccess && user?.permissions?.includes("audit.view") ? ["Audit history"] : [])].map(name =>
          <button key={name} type="button" aria-pressed={workspace === name} onClick={() => {setWorkspace(name); setAuditPage(1); setActionError(""); setNotice("")}}>{name}</button>)}
      </nav>}
      {!edit && canAudit && workspace === "Audit history" && <>
        <Feedback loading={audit.loading && !audit.error} error={audit.error}/>
        {audit.error && <button onClick={audit.refresh}>Retry audit history</button>}
        {audit.data &&
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
              {audit.data.items.map((event) => (
                <tr key={event.id}>
                  <td>{event.action}</td>
                  <td>{event.record_label || event.setting_key}</td>
                  <td>{event.staff_label || 'System'}</td>
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
          {audit.data.items.length === 0 && <p>No audit events recorded.</p>}
          {(auditPage > 1 || audit.data.has_more) && <nav className="es-toolbar" aria-label="Audit pages">
            <button className="es-secondary" disabled={auditPage === 1} onClick={() => setAuditPage(auditPage - 1)}>Previous</button>
            <span>Page {auditPage}</span>
            <button className="es-secondary" disabled={!audit.data.has_more} onClick={() => setAuditPage(auditPage + 1)}>Next</button>
          </nav>}
        </div>}</>}
      {actionError && <p role="alert" className="esc-error">{actionError}</p>}
      <Feedback error={state.error || options.error} notice={notice} loading={(workspace === "Services" && state.loading && !state.error) || (options.loading && !options.error)} />
      {(state.error || options.error) && <button className="es-secondary" disabled={(state.loading && !state.error) || (options.loading && !options.error)} onClick={() => { if (options.error) options.refresh(); if (state.error) state.refresh(); }}>Retry loading catalog</button>}
      {!edit ? (
        <>
          {workspace === "Services" && <><div className="es-toolbar esc-filters">
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
            {(search || department || published) && <button className="es-secondary" onClick={() => {setSearch(""); setDepartment(""); setPublished(""); setPage(1)}}>Clear filters</button>}
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
                          {canManage ? "Edit" : "View"}
                        </button>
                      </td>
                    </tr>
                  ))}
                {!state.loading && !state.error && !filtered.length && <tr><td colSpan={5}>No services match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <nav className="es-toolbar es-pagination" aria-label="Catalog pagination"><span>{total} services · Page {currentPage} of {pages}</span><button className="es-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="es-secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>
          </>}
          {workspace === "Categories" && <section className="es-section">
            <h2>Service categories</h2>
            <ul className="esc-category-list">{options.data?.categories?.map(item => <li key={item.id}>{item.name}</li>)}</ul>
            {canManage && <><h3>Create category</h3>
            <form
              className="es-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!canManage || categoryBusy) return;
                setCategoryBusy(true);
                setActionError("");
                try {
                  await esApi("/admin/service-categories", "POST", {
                    name: category,
                    slug: categorySlug,
                  });
                  setCategory("");
                  setCategorySlug("");
                  setNotice("Category created.");
                  invalidateCached("cms:service-catalog-options");
                  await options.refresh();
                } catch (e) {
                  setActionError(e.message);
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
              <button disabled={!canManage || categoryBusy}>{categoryBusy ? "Saving…" : "Create category"}</button>
            </form></>}
          </section>}
          {workspace === "Staff access" && canManageAccess && <StaffDepartmentAccess departments={options.data?.departments || []} />}
        </>
      ) : (
        <>
          <div className="esc-editor-actions">
            <span role="status">{!canManage ? "View only" : dirty ? "Unsaved changes" : edit.id ? "Saved" : "New draft"}</span>
            {canManage && <button disabled={busy || (!!edit.id && !dirty)} onClick={save}>{busy ? "Saving…" : edit.published !== savedPublished ? (edit.published ? "Publish service" : "Unpublish service") : "Save service"}</button>}
            {edit.id && canManage && (
              <button
                className="es-secondary"
                disabled={!canManage || busy}
                onClick={() => {
                  if (dirty && !window.confirm("Create a copy using these unsaved changes? The original service will keep its saved configuration.")) return;
                  setBaseline(null);
                  setTab("General");
                  setNotice("");
                  setSavedPublished(false);
                  setEdit({
                    ...edit,
                    id: undefined,
                    slug: `${edit.slug}-copy`,
                    name: `${edit.name} (copy)`,
                    published: false,
                    version: 1,
                  });
                }}
              >
                Duplicate
              </button>
            )}
          </div>
          <div className="esc-editor-layout">
            <nav className="esc-section-nav" aria-label="Service editor">
              {editorSections.map(name => <button type="button" key={name} aria-current={name === tab ? "step" : undefined} onClick={() => setTab(name)}>{sectionNames[name] || name}</button>)}
            </nav>
            <section className="esc-editor-panel">
            <h2>{sectionNames[tab] || tab}</h2>
            <fieldset className="esc-fields" disabled={busy || !canManage}>
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
              {edit.kind === 'DIRECTORY' && <label>Catalog category<select value={edit.settings?.directory_category_id || ''} onChange={event => patch('settings', { ...edit.settings, directory_category_id: event.target.value })}><option value="">All categories</option>{options.data?.categories?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
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
                    <option key={kind} value={kind}>{label(kind)}</option>
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
          {tab === "Requirements" && (
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
                  <label>Application section<input value={f.section || ''} placeholder="Applicant information, Business information…" maxLength={100} onChange={e => row('fields', i, 'section', e.target.value)} /></label>
                  <label>Use account information<select value={f.profile_source || ''} onChange={e => row('fields', i, 'profile_source', e.target.value)}><option value="">Automatic for standard field names</option>{PROFILE_SOURCES.map(source => <option key={source} value={source}>{label(source)}</option>)}</select></label>
                  <label><input type="checkbox" checked={f.profile_readonly === true} onChange={e => row('fields', i, 'profile_readonly', e.target.checked)} />Keep account information read-only</label>
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
                  <label>Charge type<select value={f.fee_type || 'CHARGE'} onChange={e=>row('fees',i,'fee_type',e.target.value)}>{['CHARGE','TAX','REGULATORY','PENALTY','CREDIT','PROCESSING'].map(type=><option key={type} value={type}>{label(type)}</option>)}</select></label>
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
                        <option key={status} value={status}>{label(status)}</option>
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
                        <option key={permission} value={permission}>{permissionLabels[permission]}</option>
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
              <button className="es-secondary" onClick={() => patch('steps', APPLICATION_STEPS.map(step => ({ ...step, next_statuses: [...step.next_statuses] })))}>Use municipal application workflow</button>
            </>
          )}
          {tab === "Payments" && (
            <>
              <label>Online payment provider<select value={edit.settings?.payment_provider || ''} onChange={e=>patch('settings',{...edit.settings,payment_provider:e.target.value})}><option value="">No online gateway</option>{options.data?.payment_providers?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label>Workflow type<select value={edit.settings?.workflow_type || (edit.kind==='BUSINESS'?'ASSESSMENT_PAYMENT':'APPLICATION')} onChange={e=>setEdit({...edit,settings:{...edit.settings,workflow_type:e.target.value},...(e.target.value==='ASSESSMENT_PAYMENT'?{payment_required:true,steps:edit.steps.length?edit.steps:BILLING_STEPS}:{})})}>{WORKFLOW_TYPES.map(type=><option key={type} value={type}>{label(type)}</option>)}</select></label>
              <fieldset><legend>Enabled payment methods</legend>{Object.entries(PAYMENT_METHODS).map(([method,title])=><label key={method}><input type="checkbox" checked={(edit.settings?.payment_methods || ['TREASURY']).includes(method)} onChange={e=>patch('settings',{...edit.settings,payment_methods:e.target.checked?[...(edit.settings?.payment_methods || ['TREASURY']),method]:(edit.settings?.payment_methods || ['TREASURY']).filter(m=>m!==method)})} />{title}</label>)}</fieldset>
              <label>Payment instructions<textarea value={edit.settings?.payment_instructions || ''} maxLength={4000} onChange={e=>patch('settings',{...edit.settings,payment_instructions:e.target.value})} /></label>
              <label><input type="checkbox" checked={edit.settings?.allow_partial_payment === true} onChange={e=>patch('settings',{...edit.settings,allow_partial_payment:e.target.checked})} />Allow partial payments</label>
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
              {!options.data?.payment_providers?.length && <p>No online payment provider is connected. Enabled manual methods require Treasury verification.</p>}
            </>
          )}
          {tab === "Notifications" && (
            <><p>
              Application changes create resident notifications. Optional email
              delivery follows the resident’s notification preferences and the
              portal’s email configuration.
            </p><p>Use {'{reference}'} for the transaction reference and {'{status}'} for its current status. Leave blank to use the standard message.</p>{['request.status_changed','payment.requires_attention'].map(event=><fieldset key={event}><legend>{event==='request.status_changed'?'Transaction updates':'Payment updates'}</legend>{['title','message'].map(field=><label key={field}>{label(field)}<textarea maxLength={field==='title'?160:2000} value={edit.settings?.notification_templates?.[event]?.[field] || ''} onChange={e=>patch('settings',{...edit.settings,notification_templates:{...edit.settings?.notification_templates,[event]:{...edit.settings?.notification_templates?.[event],[field]:e.target.value}}})} /></label>)}</fieldset>)}</>
          )}
          {tab === "Publishing" && (
            <div className="es-form">
              <dl className="esc-review">
                <div><dt>Service</dt><dd>{edit.name || "Untitled service"}</dd></div>
                <div><dt>Department</dt><dd>{options.data?.departments?.find(item => item.id === edit.department_id)?.name || "Unassigned"}</dd></div>
                <div><dt>Configuration</dt><dd>{edit.fields.length} fields · {edit.requirements.length} documents · {edit.steps.length} workflow steps</dd></div>
              </dl>
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
            </fieldset>
            <footer className="esc-stage-footer">
              {stage > 0 && <button className="es-secondary" onClick={() => setTab(editorSections[stage - 1])}>Previous</button>}
              {stage < editorSections.length - 1 && <button onClick={() => setTab(editorSections[stage + 1])}>Next: {sectionNames[editorSections[stage + 1]] || editorSections[stage + 1]}</button>}
              {stage === editorSections.length - 1 && canManage && <button disabled={busy || (!!edit.id && !dirty)} onClick={save}>{busy ? "Saving…" : edit.published && !savedPublished ? "Publish service" : "Save changes"}</button>}
            </footer>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
