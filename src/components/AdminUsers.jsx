import { useEffect, useState } from "react";
import { Users, ShieldCheck, Search, Plus, LockKeyhole } from "lucide-react";
import SettingsPermissions from "./SettingsPermissions";
import "./AdminUsers.css";

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}
const roleName = (role) =>
  ({
    admin: "Administrator",
    super_admin: "Super administrator",
    staff: "Staff",
    it_support: "IT support",
    content_manager: "Content manager",
    disabled: "Access disabled",
  })[role] || role;
const roleHelp = [
  [
    ShieldCheck,
    "Super administrator",
    "Full settings access and authority to manage other super administrators. Individual settings grants do not restrict this role.",
  ],
  [
    Users,
    "Administrator",
    "Manages portal content. Settings access is controlled below. User management requires both settings edit and security permissions.",
  ],
  [
    LockKeyhole,
    "Access disabled",
    "Cannot access the admin panel or protected admin APIs. The account is retained and can be reactivated.",
  ],
];
const permissionLabels = {
  'settings.view': ['View settings', 'Open and review system configuration.'],
  'settings.edit': ['Edit settings', 'Change non-sensitive portal configuration.'],
  'settings.secrets.edit': ['Manage secrets', 'Replace protected credentials such as API keys and passwords.'],
  'settings.database.edit': ['Manage databases', 'Update database connection and data-store settings.'],
  'settings.storage.edit': ['Manage cloud storage', 'Configure uploads and file access.'],
  'settings.security.edit': ['Manage access', 'Change security controls and administrator permissions.'],
  'settings.audit.view': ['View audit history', 'Review recorded configuration and security changes.'],
};
export default function AdminUsers({ currentUser }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [formError, setFormError] = useState("");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [form, setForm] = useState(null),
    [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(null),
    [grants, setGrants] = useState("{}");
  const load = async () => {
    setError("");
    try {
      const result = await request("/api/admin/users");
      setData(result);
      const snapshot = await request("/api/admin/settings");
      setSettings(snapshot);
      setGrants(snapshot.values["security.permissionGrants"]);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFormError("");
    setMessage("");
    try {
      const result = await request(`/api/admin/users${form.id ? `/${form.id}` : ""}`, {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(form),
      });
      const accountId = form.id || result.id;
      if (accountId && (form.id || form.role === "staff")) {
        const nextGrants = { ...JSON.parse(grants) };
        if (form.role === "staff") nextGrants[accountId] = form.permissions || [];
        else delete nextGrants[accountId];
        await request("/api/admin/settings/security", {
          method: "PATCH",
          body: JSON.stringify({
            values: {
              "security.permissionGrants": JSON.stringify(nextGrants),
            },
          }),
        });
      }
      setForm(null);
      setMessage(result.warning || (form.id ? "Account saved. Access changes apply to subsequent requests." : "Account created and welcome email sent."));
      await load();
    } catch (e) {
      if (form) setFormError(e.message);
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveGrants = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request("/api/admin/settings/security", {
        method: "PATCH",
        body: JSON.stringify({
          values: { "security.permissionGrants": grants },
        }),
      });
      setMessage("Access permissions saved.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const users = data?.users || [];
  const visible = users.filter(
    (user) =>
      (filter === "all" || user.role === filter) &&
      `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="admin-users">
      <div className="cms-title">
        <div>
          <h1>User management</h1>
          <p className="admin-description">
            Manage users, roles, permissions, and access levels from one place.
          </p>
        </div>
      </div>
      {error && (
        <div className="admin-feedback error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="admin-feedback" role="status">
          {message}
        </div>
      )}
      {!data && !error && <p role="status">Loading accounts…</p>}
      {data && (
        <>
          <div className="admin-metrics">
            {[
              [Users, "Total accounts", users.length],
              [
                ShieldCheck,
                "Active administrators",
                users.filter((u) => u.role !== "disabled").length,
              ],
              [
                LockKeyhole,
                "Access disabled",
                users.filter((u) => u.role === "disabled").length,
              ],
            ].map(([Icon, label, count]) => (
              <article key={label}>
                <span className="admin-metric-icon">
                  <Icon size={22} />
                </span>
                <div>
                  <small>{label}</small>
                  <strong>{count}</strong>
                </div>
              </article>
            ))}
          </div>
          <section className="admin-card">
            <div className="admin-table-heading">
              <div>
                <h2>Administrator directory</h2>
                <p className="admin-description">
                  {visible.length} of {users.length} accounts · CMS access
                </p>
              </div>
              <button
                onClick={() => {
                  setForm({ name: "", email: "", password: "", role: "admin", permissions: [] });
                  setError("");
                  setFormError("");
                }}
              >
                <Plus size={17} /> Add account
              </button>
            </div>
            <div className="admin-filters">
              <label className="admin-search">
                <Search size={18} />
                <input
                  aria-label="Search users"
                  placeholder="Search name or email…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                aria-label="Filter by role"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All roles</option>
                {["admin", "super_admin", "staff", "it_support", "content_manager", "disabled"].map((role) => (
                  <option key={role} value={role}>
                    {roleName(role)}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Account status</th>
                    <th>Access level</th>
                    <th>Last active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="admin-person">
                          <span>{user.name.slice(0, 1).toUpperCase()}</span>
                          <strong>
                            {user.name}
                            {user.id === currentUser.id ? " (you)" : ""}
                          </strong>
                        </div>
                      </td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`admin-role ${user.role}`}>
                          {roleName(user.role)}
                        </span>
                      </td>
                      <td>
                        {user.role === "disabled" ? "Disabled" : "Active"}
                      </td>
                      <td>
                        {user.role === "super_admin"
                          ? "Full access"
                          : `${user.permissions.length} permissions`}
                      </td>
                      <td>
                        {user.lastActive
                          ? new Date(user.lastActive).toLocaleDateString(
                              "en-PH",
                            )
                          : "Not available"}
                      </td>
                      <td>
                        <button
                          className="admin-edit"
                          disabled={
                            user.id === currentUser.id ||
                            (!data.canGrantSuper && user.role === "super_admin")
                          }
                          onClick={() => {
                            setForm({
                              id: user.id,
                              name: user.name,
                              email: user.email,
                              role: user.role,
                              permissions: JSON.parse(grants)[user.id] || user.permissions,
                            });
                            setError("");
                            setFormError("");
                          }}
                        >
                          Manage Access
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length && (
                <p className="admin-empty">No accounts match your search.</p>
              )}
            </div>
          </section>
          {form && (
            <div
              className="admin-access-modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setForm(null);
              }}
            >
              <section
                className="admin-access-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-access-title"
              >
                <div className="admin-access-modal-heading">
                  <div>
                    <h2 id="admin-access-title">
                      {form.id ? "Manage access" : "Create staff or administrator account"}
                    </h2>
                    <p className="admin-description">
                      Review account details and assigned access before saving.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="admin-modal-close"
                    aria-label="Close access dialog"
                    onClick={() => setForm(null)}
                  >
                    ×
                  </button>
                </div>
                {formError && <div className="admin-feedback error admin-modal-feedback" role="alert">{formError}</div>}
                <form onSubmit={save}>
                  <fieldset disabled={busy}>
                    <label>
                      Full name
                      <input
                        required
                        maxLength={160}
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Email address
                      <input
                        required
                        type="email"
                        disabled={Boolean(form.id)}
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                      />
                    </label>
                    {!form.id && (
                      <label>
                        Initial password
                        <input
                          type="password"
                          autoComplete="new-password"
                          required
                          minLength={12}
                          maxLength={128}
                          value={form.password}
                          onChange={(e) =>
                            setForm({ ...form, password: e.target.value })
                          }
                        />
                        <small>
                          At least 12 characters. Share securely with the
                          account owner.
                        </small>
                      </label>
                    )}
                    <label>
                      Role and access
                      <select
                        value={form.role}
                        onChange={(e) =>
                          setForm({ ...form, role: e.target.value })
                        }
                      >
                        {[
                          "admin", "staff", "it_support", "content_manager",
                          ...(data.canGrantSuper ? ["super_admin"] : []),
                          "disabled",
                        ].map((role) => (
                          <option key={role} value={role}>
                            {roleName(role)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {form.role === "staff" && <fieldset className="admin-access-permissions"><legend>Delegated access</legend><p>Choose the settings this staff member can access. These permissions override the Staff role defaults.</p>{data.permissions.map((permission) => { const assigned = form.permissions || []; const [label, description] = permissionLabels[permission] || [permission, 'Permission for this system capability.']; return <label key={permission} title={description}><input type="checkbox" checked={assigned.includes(permission)} onChange={(event) => setForm({ ...form, permissions: event.target.checked ? [...assigned, permission] : assigned.filter((item) => item !== permission) })}/><span>{label}</span><span className="permission-help" tabIndex="0" aria-label={`${label}: ${description}`}>?</span><span className="permission-tooltip" role="tooltip">{description}</span></label>; })}</fieldset>}
                    <div className="admin-form-actions">
                      <button type="button" onClick={() => setForm(null)}>
                        Cancel
                      </button>
                      <button type="submit">
                        {busy ? "Saving…" : "Save account"}
                      </button>
                    </div>
                  </fieldset>
                </form>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
