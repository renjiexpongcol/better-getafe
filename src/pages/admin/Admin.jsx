import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Settings from "../../components/AdminSettings";
import AdminPrivacyRequests from "../../components/AdminPrivacyRequests";
import AdminUsers from "../../components/AdminUsers";
import "../../components/ImportantAnnouncement.css";
import "../../citizen.css";
import "./AdminDashboard.css";
import { LayoutDashboard, Newspaper, Tags, Images, Users, MapPin, Settings2, ShieldCheck, LogOut, Menu, X, ChevronDown, UserRound, ArrowRight, Plus, Search, Bell, FileText } from "lucide-react";
const navigationIcons = { dashboard: LayoutDashboard, news: Newspaper, categories: Tags, media: Images, officials: Users, barangays: MapPin, settings: Settings2, privacy: ShieldCheck, users: Users, access: ShieldCheck };
const blank = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category_id: "",
  status: "draft",
  content_type: "news",
  event_start_at: "",
  event_end_at: "",
  show_in_news: true,
  show_in_upcoming: false,
  show_in_events: false,
  show_on_homepage: true,
  is_important: false,
  published_at: "",
};
const api = (url, _token, options = {}) =>
  fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  }).then(async (r) => {
    const contentType = r.headers.get("content-type") || "";
    const body =
      r.status === 204
        ? null
        : contentType.includes("application/json")
          ? await r.json().catch(() => null)
          : null;
    if (!r.ok) throw new Error(body?.error || `Request failed (${r.status})`);
    return body;
  });
const putFile = (url, file, onProgress) => {
  const request = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type);
    if (url.startsWith("/api/media/upload-proxy")) request.setRequestHeader("X-Requested-With", "GetafeCitizenPortal");
    request.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("Direct media upload failed"));
    request.onerror = () => reject(new Error("Direct media upload failed"));
    request.onabort = () =>
      reject(new DOMException("Upload cancelled", "AbortError"));
    request.send(file);
  });
  return { promise, cancel: () => request.abort() };
};
export default function Admin() {
  const { user, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const token = true;
  const accountMenuRef = useRef(null);
  const accountButtonRef = useRef(null);
  const accountDialogRef = useRef(null);
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => {
    if (!accountOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    accountDialogRef.current?.querySelector('button')?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); setAccountOpen(false); }
      if (event.key !== 'Tab') return;
      const controls = [...accountDialogRef.current.querySelectorAll('button, a, input')].filter(item => !item.disabled);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); accountButtonRef.current?.focus(); };
  }, [accountOpen]);
  useEffect(() => {
    const dismiss = event => { if (!accountMenuRef.current?.contains(event.target)) setProfileMenuOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const [articles, setArticles] = useState([]),
    [categories, setCategories] = useState([]),
    [officials, setOfficials] = useState(null),
    [barangayRecords, setBarangayRecords] = useState(null),
    [form, setForm] = useState(blank),
    [editing, setEditing] = useState(null),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || "dashboard"),
    [media, setMedia] = useState([]),
    [settings, setSettings] = useState(null),
    [confirmDialog, setConfirmDialog] = useState(null),
    [selectedArticles, setSelectedArticles] = useState([]),
    [selectedMedia, setSelectedMedia] = useState([]),
    [adminSearch, setAdminSearch] = useState(""),
    [profileMenuOpen, setProfileMenuOpen] = useState(false),
    [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  useEffect(() => {
    const onPop = () => setTab(new URLSearchParams(window.location.search).get('tab') || 'dashboard');
    const onEscape = event => { if (event.key === 'Escape') { setMobileSidebarOpen(false); setProfileMenuOpen(false); if (accountMenuRef.current?.contains(document.activeElement)) accountButtonRef.current?.focus(); } };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onEscape);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onEscape); };
  }, []);
  useEffect(() => {
    document.body.classList.toggle("cms-drawer-open", mobileSidebarOpen);
    return () => document.body.classList.remove("cms-drawer-open");
  }, [mobileSidebarOpen]);
  const uploadRequest = useRef(null);
  const noticeTimer = useRef(null);
  useEffect(() => {
    if (!notice) return undefined;
    clearTimeout(noticeTimer.current);
    const duration = Number(
      settings?.values?.["notifications.toastDuration"] ?? 5,
    );
    if (duration > 0)
      noticeTimer.current = setTimeout(() => setNotice(""), duration * 1000);
    return () => clearTimeout(noticeTimer.current);
  }, [notice, settings]);
  const load = async (signal) => {
    const results = await Promise.allSettled([
      api("/api/news?limit=100", token, { signal }),
      api("/api/categories", token, { signal }),
      api("/api/media", token, { signal }),
      api("/api/officials", token, { signal }),
      api("/api/barangays", token, { signal }),
    ]);
    if (signal?.aborted) return;
    const setters = [
      (news) => setArticles(news.items),
      setCategories,
      setMedia,
      setOfficials,
      setBarangayRecords,
    ];
    const labels = [
      "News",
      "Categories",
      "Media library",
      "Officials",
      "Barangays",
    ];
    const errors = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") setters[index](result.value);
      else errors.push(`${labels[index]}: ${result.reason.message}`);
    });
    if (errors.length)
      setNotice(`Some dashboard data could not be loaded. ${errors.join(" ")}`);
  };
  useEffect(() => {
    if (authLoading || !["admin", "super_admin"].includes(user?.role)) return;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [authLoading, user?.id, user?.role]);
  useEffect(() => {
    if (
      !authLoading &&
      ["admin", "super_admin"].includes(user?.role) &&
      tab === "settings"
    )
      api("/api/admin/settings", token)
        .then(setSettings)
        .catch((e) => setNotice(e.message));
  }, [authLoading, user?.id, user?.role, tab]);
  const saveArticle = async (e) => {
    e.preventDefault();
    try {
      await api(editing ? `/api/news/${editing}` : "/api/news", token, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(form),
      });
      setNotice(editing ? "Content updated." : "Content created.");
      setForm(blank);
      setEditing(null);
      setTab("news");
      load();
    } catch (e) {
      setNotice(e.message);
    }
  };
  const askConfirm = (title, message, action) =>
    setConfirmDialog({ title, message, action });
  const removeArticle = async (id) =>
    askConfirm(
      "Delete content item?",
      "This content item will be permanently removed.",
      async () => {
        await api(`/api/news/${id}`, token, { method: "DELETE" });
        load();
      },
    );
  const bulkAction = (action) => {
    if (!selectedArticles.length) return;
    const run = async () => {
      await api("/api/news/bulk", token, {
        method: "POST",
        body: JSON.stringify({ ids: selectedArticles, action }),
      });
      setSelectedArticles([]);
      setNotice(
        action === "delete"
          ? "Selected articles deleted."
          : `Selected articles moved to ${action}.`,
      );
      load();
    };
    if (action === "delete")
      askConfirm(
        "Delete selected articles?",
        `${selectedArticles.length} article${selectedArticles.length === 1 ? "" : "s"} will be permanently removed.`,
        run,
      );
    else run().catch((e) => setNotice(e.message));
  };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (settings?.values?.["features.uploads"] === false)
      return setNotice("Uploads are disabled.");
    if (
      file.size >
      (settings?.values?.["storage.maxUploadMb"] || 5) * 1024 * 1024
    )
      return setNotice("File exceeds the configured upload limit.");
    try {
      setNotice("Requesting upload URL...");
      const urlRes = await fetch("/api/storage/upload-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
          context: "media",
        }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok)
        throw new Error(urlData?.error || "Failed to get upload URL");

      const storageLabel =
        settings?.values?.["storage.provider"] === "backblaze"
          ? "Backblaze B2"
          : "local storage";
      setNotice(`Uploading to ${storageLabel}...`);
      uploadRequest.current = putFile(urlData.uploadUrl, file, (progress) =>
        setNotice(`Uploading to ${storageLabel}... ${progress}%`),
      );
      await uploadRequest.current.promise;
      uploadRequest.current = null;

      setNotice("Finalizing upload...");
      const completeRes = await fetch("/api/media/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: urlData.storagePath,
          originalFilename: file.name,
          contentType: file.type,
          fileSize: file.size,
          name: file.name,
        }),
      });
      const body = await completeRes.json();
      if (!completeRes.ok)
        throw new Error(body?.error || "Upload completion failed");

      setMedia((m) => [body, ...m]);
      setForm((f) => ({
        ...f,
        featured_image: body.storage_path,
        // Render the local file immediately; the remote preview URL may be
        // signed, delayed by object storage, or unavailable in development.
        featured_image_preview: URL.createObjectURL(file),
      }));
      setNotice("Image uploaded and selected.");
    } catch (err) {
      setNotice(err.name === "AbortError" ? "Upload cancelled." : err.message);
    } finally {
      uploadRequest.current = null;
    }
  };
  if (authLoading) return null;
  if (!user) return <Navigate to="/auth/login" replace />;
  if (!["admin", "super_admin", "staff", "it_support", "content_manager"].includes(user.role))
    return <Navigate to="/" replace />;
  const published = articles.filter((a) => a.status === "published").length;
  const navigationGroups = [
    ["Main", [["dashboard", "Dashboard"], ["news", "News & Events"], ["categories", "Categories"], ["media", "Media Library"]]],
    ["Management", [["officials", "Officials"], ["barangays", "Barangays"]]],
    ["Access & security", [["users", "User Management"], ["privacy", "Privacy Requests"]]],
    ["System", [["settings", "Settings"]]],
  ];

  const selectTab = (key) => {
    setProfileMenuOpen(false);
    setTab(key);
    window.history.pushState(null, '', `${window.location.pathname}?tab=${key}`);
    setMobileSidebarOpen(false);
  };
  return (
    <main className={`cms citizen-portal portal-v2 admin-portal${tab === "settings" ? " cms-settings" : ""}`}>
      {mobileSidebarOpen && <button className="portal-scrim" aria-label="Close navigation" onClick={() => setMobileSidebarOpen(false)}/>}
      <aside className={`citizen-sidebar ${mobileSidebarOpen ? 'open' : ''}`} aria-label="Admin navigation" id="cms-navigation">
        <div className="citizen-sidebar-brand"><img src="/assets/getafe-seal.png" alt="Municipality of Getafe seal"/><span>ADMIN PORTAL<small>Municipality of Getafe</small></span><button onClick={() => setMobileSidebarOpen(false)} aria-label="Close menu"><X size={20}/></button></div>
        <nav className="portal-nav">{navigationGroups.map(([group, items]) => <div key={group}><small>{group}</small>{items.map(([key, label]) => { const Icon = navigationIcons[key]; return <a href={`?tab=${key}`} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={event => { event.preventDefault(); selectTab(key); }} key={key}><Icon size={17}/>{label}</a>; })}</div>)}</nav>
      </aside>
      <section className="citizen-main">
        <header className="citizen-topbar"><div className="portal-breadcrumb"><button className="citizen-menu-toggle" onClick={() => setMobileSidebarOpen(true)} aria-label="Open navigation" aria-expanded={mobileSidebarOpen}><Menu size={21}/></button></div>
          <div className="citizen-top-actions">
            <div className="portal-service-search-compact admin-toolbar-search"><label htmlFor="admin-search">Search admin tools</label><div className="portal-search-input"><input id="admin-search" placeholder="Search admin tools…" value={adminSearch} onChange={event => setAdminSearch(event.target.value)}/><Search size={18}/></div>{adminSearch.trim() && <div className="portal-popover">{navigationGroups.flatMap(([, items]) => items).filter(([, label]) => label.toLowerCase().includes(adminSearch.toLowerCase())).map(([key, label]) => <button key={key} onClick={() => { selectTab(key); setAdminSearch(''); }}>{label}</button>)}{!navigationGroups.flatMap(([, items]) => items).some(([, label]) => label.toLowerCase().includes(adminSearch.toLowerCase())) && <p>No matching tools.</p>}</div>}</div>
            <button type="button" className="portal-icon-button admin-notification-button" aria-label="Notifications" data-tooltip="Notifications"><Bell size={18} strokeWidth={1.8}/></button>
            <div className="portal-popover-anchor" ref={accountMenuRef} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setProfileMenuOpen(false); }}><button ref={accountButtonRef} type="button" className="citizen-profile-button" aria-label="Open account menu" aria-expanded={profileMenuOpen} aria-haspopup="menu" aria-controls={profileMenuOpen ? 'admin-account-menu' : undefined} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setProfileMenuOpen(true); requestAnimationFrame(() => accountMenuRef.current?.querySelector('[role="menuitem"]')?.focus()); } }} onClick={() => setProfileMenuOpen(value => !value)}><span className="citizen-avatar">{(user.name || 'Admin').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span><b>{user.name}</b><ChevronDown size={15}/></button>{profileMenuOpen && <div id="admin-account-menu" className="portal-popover portal-profile-menu" role="menu" aria-label="Account" onKeyDown={event => { const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')]; const index = items.indexOf(document.activeElement); let next; if (event.key === 'ArrowDown') next = (index + 1) % items.length; else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = items.length - 1; if (next !== undefined) { event.preventDefault(); items[next].focus(); } }}><button role="menuitem" onClick={() => { setProfileMenuOpen(false); setAccountOpen(true); }}><UserRound size={15}/>My Account</button><button role="menuitem" onClick={() => { setProfileMenuOpen(false); selectTab('settings'); }}><Settings2 size={15}/>Settings</button><button role="menuitem" onClick={async () => { setProfileMenuOpen(false); const result = await logout(); if (result.ok) navigate('/auth/login', { replace: true }); else setNotice(result.error); }}><LogOut size={15}/>Sign out</button></div>}</div>
          </div>
        </header>
        <div className="cms-main citizen-content" id="admin-content">
        {accountOpen && <div className="profile-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAccountOpen(false); }}><section ref={accountDialogRef} className="profile-modal-card" role="dialog" aria-modal="true" aria-labelledby="admin-account-title"><section className="citizen-panel portal-form"><button type="button" className="profile-form-close" aria-label="Close profile" onClick={() => setAccountOpen(false)}><X size={19}/></button><div className="profile-photo-row"><div className="profile-photo"><span>{(user.name || 'Admin').split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span></div><div><h2 id="admin-account-title">Personal and contact information</h2><p className="portal-muted">Your administrator account information. Your email is linked to your account.</p></div></div><div className="portal-form-grid"><label>Full name<input value={user.name || ''} readOnly/></label><label>Email address<input value={user.email || ''} readOnly/></label><label>Role<input value={user.role === 'super_admin' ? 'Super administrator' : 'Administrator'} readOnly/></label></div><Link className="citizen-secondary" to="/auth/forgot-password">Reset password</Link></section></section></div>}
        {tab === 'users' && <AdminUsers key="users" currentUser={user} mode="users"/>}
        {notice && (
          <div
            className={`cms-toast toast-${settings?.values?.["notifications.toastPosition"] || "top-right"}`}
            role="status"
          >
            <span>{notice}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {tab === "dashboard" && (
          <>
            <section className="citizen-welcome"><div><p className="portal-date">{new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p><h1>Welcome back, {(user.name || 'Admin').trim().split(/\s+/)[0]}</h1><p>Manage your municipal content, community and portal settings.</p></div><button className="citizen-primary" onClick={() => { setForm(blank); setEditing(null); selectTab('editor'); }}><Plus size={17}/>Add Content</button></section>
            <section className="citizen-stats" aria-label="Portal at a glance">{[
              ['Published content', Newspaper, published, 'View news, events, and meetings', 'news'],
              ['Draft content', FileText, articles.length - published, 'Continue editing content', 'news'],
              ['Categories', Tags, categories.length, 'Organize portal content', 'categories'],
              ['Media files', Images, media.length, 'Manage your media library', 'media'],
            ].map(([label, Icon, value, description, key]) => <a href={`?tab=${key}`} className="citizen-stat" key={label} onClick={event => { event.preventDefault(); selectTab(key); }}><div><span>{label}</span><Icon size={18}/></div><strong>{value}</strong><small>{description}<ArrowRight size={14}/></small></a>)}</section>
            <section className="portal-quick"><h2>Quick actions</h2><div>{[['Add Content', Newspaper, 'editor'], ['Upload Media', Images, 'media'], ['Manage Users', Users, 'users'], ['Privacy Requests', ShieldCheck, 'privacy'], ['Settings', Settings2, 'settings']].map(([label, Icon, key]) => <button type="button" key={key} onClick={() => { if (key === 'editor') { setForm(blank); setEditing(null); } selectTab(key); }}><Icon size={20}/><span>{label}</span></button>)}</div></section>
            <section><div className="citizen-section-head"><h2>Administration</h2></div><div className="citizen-service-grid">{[['Content management', Newspaper, 'Publish news and organize municipal updates.', 'news'], ['Municipal officials', Users, 'Maintain your directory of public officials.', 'officials'], ['Barangays', MapPin, 'Manage barangay information and profiles.', 'barangays'], ['Access & security', ShieldCheck, 'Manage users, roles and portal permissions.', 'access']].map(([label, Icon, description, key]) => <a className="citizen-service" href={`?tab=${key}`} key={key} onClick={event => { event.preventDefault(); selectTab(key); }}><span><Icon size={20}/></span><strong>{label}</strong><p>{description}</p><small>Manage<ArrowRight size={14}/></small></a>)}</div></section>
            <section className="citizen-panel admin-recent"><div className="citizen-panel-head"><h2>Recent content</h2><a href="?tab=news" onClick={event => { event.preventDefault(); selectTab('news'); }}>View all<ArrowRight size={14}/></a></div>
            <ArticleTable
              articles={articles.slice(0, 5)}
              selected={selectedArticles}
              setSelected={setSelectedArticles}
              onBulkAction={bulkAction}
              edit={(a) => {
                setForm({
                  ...a,
                  featured_image: a.featured_image_path || a.featured_image,
                  published_at: a.published_at?.slice(0, 16) || "",
                  event_start_at: a.event_start_at?.slice(0, 16) || "",
                  event_end_at: a.event_end_at?.slice(0, 16) || "",
                });
                setEditing(a.id);
                setTab("editor");
              }}
              remove={removeArticle}
            />
            </section>
          </>
        )}
        {tab === "news" && (
          <>
            <div className="cms-title">
              <h1>News &amp; Events</h1>
              <div className="admin-title-actions"><button onClick={() => { setForm(blank); setEditing(null); setTab('editor'); }}>+ Add Content</button></div>
            </div>
            <ArticleTable
              articles={articles}
              selected={selectedArticles}
              setSelected={setSelectedArticles}
              onBulkAction={bulkAction}
              edit={(a) => {
                setForm({
                  ...a,
                  featured_image: a.featured_image_path || a.featured_image,
                  published_at: a.published_at?.slice(0, 16) || "",
                  event_start_at: a.event_start_at?.slice(0, 16) || "",
                  event_end_at: a.event_end_at?.slice(0, 16) || "",
                });
                setEditing(a.id);
                setTab("editor");
              }}
              remove={removeArticle}
            />
          </>
        )}
        {tab === "editor" && (
          <form className="cms-editor" onSubmit={saveArticle}>
            <div className="cms-title">
              <h1>{editing ? "Edit content" : "Add content"}</h1>
              <button>
                {form.status === "published" ? "Publish changes" : "Save draft"}
              </button>
            </div>
            <label>
              Title
              <input
                required
                value={form.title}
                onChange={(e) =>
                  setForm({
                    ...form,
                    title: e.target.value,
                    slug:
                      form.slug ||
                      e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                  })
                }
              />
            </label>
            <label>
              URL slug
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </label>
            <label>
              Short excerpt
              <textarea
                required
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              />
            </label>
            <label>
              Full content
              <textarea
                className="content-box"
                required
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
              <small>
                HTML is supported (for example, &lt;p&gt;paragraph&lt;/p&gt;).
              </small>
            </label>
            <div className="cms-row">
              <label>
                Content type
                <select value={form.content_type} onChange={(e) => { const content_type = e.target.value; setForm({ ...form, content_type, ...(editing ? {} : content_type === 'news' ? { show_in_news: true, show_in_upcoming: false, show_in_events: false } : { show_in_news: false, show_in_upcoming: true, show_in_events: true }) }); }}>
                  <option value="news">News</option>
                  <option value="event">Event</option>
                  <option value="meeting">Meeting</option>
                </select>
              </label>
              <label>
                Category
                <select
                  value={form.category_id}
                  onChange={(e) =>
                    setForm({ ...form, category_id: e.target.value })
                  }
                >
                  <option value="">Uncategorised</option>
                  {categories.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>
              <label>
                Publication date
                <input
                  type="datetime-local"
                  value={form.published_at}
                  onChange={(e) =>
                    setForm({ ...form, published_at: e.target.value })
                  }
                />
              </label>
            </div>
            {['event', 'meeting'].includes(form.content_type) && <div className="cms-row"><label>Starts at<input required type="datetime-local" value={form.event_start_at} onChange={(e) => setForm({ ...form, event_start_at: e.target.value })} /></label><label>Ends at<input type="datetime-local" value={form.event_end_at} onChange={(e) => setForm({ ...form, event_end_at: e.target.value })} /></label></div>}
            <fieldset className="cms-display-options"><legend>Display on</legend><p>Choose every public location where this single content item should appear.</p><div>
              <label><input type="checkbox" checked={Boolean(form.show_in_news)} onChange={(e) => setForm({ ...form, show_in_news: e.target.checked })} /> News page</label>
              <label><input type="checkbox" checked={Boolean(form.show_in_upcoming)} onChange={(e) => setForm({ ...form, show_in_upcoming: e.target.checked })} /> Upcoming Events &amp; Meetings</label>
              <label><input type="checkbox" checked={Boolean(form.show_in_events)} onChange={(e) => setForm({ ...form, show_in_events: e.target.checked })} /> Events page (/events)</label>
              <label><input type="checkbox" checked={Boolean(form.show_on_homepage)} onChange={(e) => setForm({ ...form, show_on_homepage: e.target.checked })} /> Homepage</label>
            </div></fieldset>
            <label className="cms-important-control">
              <input
                type="checkbox"
                checked={Boolean(form.is_important)}
                onChange={(e) => setForm({ ...form, is_important: e.target.checked })}
                aria-describedby="important-announcement-help"
              />
              <span>
                Important announcement
                <small id="important-announcement-help">
                  Show the title and short excerpt in a popup when visitors open the landing page.
                  Only published articles whose publication date has arrived appear. If several are marked important,
                  the newest appears. Uncheck this option to remove it from the popup.
                </small>
              </span>
            </label>
            <label>
              Featured image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={upload}
              />
            </label>
            {form.featured_image && (
              <img
                className="cms-preview"
                src={form.featured_image_preview || form.featured_image}
                alt="Selected"
                onError={(event) => { event.currentTarget.style.display = "none" }}
              />
            )}
          </form>
        )}
        {tab === "categories" && (
          <Categories token={token} categories={categories} reload={load} />
        )}
        {tab === "media" && (
          <>
            <div className="cms-title">
              <div>
                <h1>Media Library</h1>
                <p className="cms-page-intro">Store and manage images used across the portal.</p>
              </div>
              <label className="upload-btn">
                Upload image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={upload}
                />
              </label>
            </div>
            {media.length > 0 && (
              <div className="media-toolbar">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedMedia.length === media.length}
                    onChange={() =>
                      setSelectedMedia(
                        selectedMedia.length === media.length
                          ? []
                          : media.map((m) => m.id),
                      )
                    }
                  />{" "}
                  Select all
                </label>
                <span className="media-count">{media.length} {media.length === 1 ? "image" : "images"}</span>
                {selectedMedia.length > 0 && (
                  <>
                    <strong>{selectedMedia.length} selected</strong>
                    <button
                      className="danger"
                      onClick={() =>
                        askConfirm(
                          "Delete selected media?",
                          `${selectedMedia.length} image${selectedMedia.length === 1 ? "" : "s"} will be permanently removed.`,
                          async () => {
                            await Promise.all(
                              selectedMedia.map((id) =>
                                api(`/api/media/${id}`, token, {
                                  method: "DELETE",
                                }),
                              ),
                            );
                            setSelectedMedia([]);
                            load();
                          },
                        )
                      }
                    >
                      Delete selected
                    </button>
                  </>
                )}
              </div>
            )}
            {media.length ? (
              <div className="media-grid">
                {media.map((m) => (
                  <div
                    className={`media-card ${selectedMedia.includes(m.id) ? "selected" : ""}`}
                    key={m.id}
                  >
                    <label className="media-check">
                      <input
                        type="checkbox"
                        checked={selectedMedia.includes(m.id)}
                        onChange={() =>
                          setSelectedMedia((items) =>
                            items.includes(m.id)
                              ? items.filter((id) => id !== m.id)
                              : [...items, m.id],
                          )
                        }
                      />{" "}
                      Select
                    </label>
                    {m.preview_url ? (
                      <img
                        src={m.preview_url}
                        alt={m.original_filename}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.nextElementSibling.style.display =
                            "grid";
                        }}
                      />
                    ) : null}
                    <div
                      className={`media-missing ${m.preview_url ? "" : "visible"}`}
                    >
                      Image unavailable
                    </div>
                    <small title={m.original_filename}>
                      {m.original_filename}
                    </small>
                    <button
                      className="danger"
                      onClick={() =>
                        askConfirm(
                          "Delete image?",
                          "This image will be permanently removed.",
                          async () => {
                            await api(`/api/media/${m.id}`, token, {
                              method: "DELETE",
                            });
                            load();
                          },
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="media-empty">
                <strong>Your media library is empty</strong>
                <span>
                  Upload JPG, PNG, or WEBP images to use them in news articles.
                </span>
              </div>
            )}
          </>
        )}
        {tab === "officials" && (
          <OfficialsSelectorEditor
            token={token}
            value={officials}
            onSaved={(value) => {
              setOfficials(value);
              setNotice("Officials updated.");
            }}
          />
        )}
        {tab === "barangays" && (
          <BarangaysEditor
            token={token}
            value={barangayRecords}
            onSaved={(value) => {
              setBarangayRecords(value);
              setNotice("Barangays updated.");
            }}
          />
        )}
        {tab === "settings" && (
          <Settings
            token={token}
            settings={settings}
            setSettings={setSettings}
            onSaved={setNotice}
          />
        )}
        {tab === "privacy" && <AdminPrivacyRequests onNotice={setNotice} />}
        {confirmDialog && (
          <div className="app-modal-backdrop">
            <div
              className="app-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-dialog-title"
              aria-describedby="delete-dialog-description"
            >
              <h2 id="delete-dialog-title">{confirmDialog.title}</h2>
              <p id="delete-dialog-description">{confirmDialog.message}</p>
              <div className="app-modal-actions">
                <button type="button" onClick={() => setConfirmDialog(null)}>
                  Cancel
                </button>
                <button
                  className="modal-delete"
                  type="button"
                  onClick={async () => {
                    const action = confirmDialog.action;
                    setConfirmDialog(null);
                    try {
                      await action();
                    } catch (e) {
                      setNotice(e.message);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </section>
    </main>
  );
}
function ArticleTable({
  articles,
  edit,
  remove,
  selected,
  setSelected,
  onBulkAction,
}) {
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const locations = (article) => [article.show_in_news && 'News', article.show_in_upcoming && 'Upcoming', article.show_in_events && 'Events', article.show_on_homepage && 'Homepage'].filter(Boolean).join(', ') || 'Hidden';
  const displayDate = (value) => value ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
  const filteredArticles = articles.filter((article) => {
    const schedule = article.event_start_at ? new Date(article.event_end_at || article.event_start_at) : null;
    if (typeFilter && article.content_type !== typeFilter) return false;
    if (statusFilter && article.status !== statusFilter) return false;
    if (timeFilter === 'upcoming' && (!schedule || schedule < new Date())) return false;
    if (timeFilter === 'past' && (!schedule || schedule >= new Date())) return false;
    if (locationFilter && !article[locationFilter]) return false;
    if (dateFilter && String(article.event_start_at || article.published_at || '').slice(0, 10) !== dateFilter) return false;
    return true;
  });
  const visibleIds = filteredArticles.map((a) => a.id);
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const toggle = (id) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  const toggleAll = () =>
    setSelected((current) =>
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    );
  return (
    <div className="cms-table">
      <div className="cms-content-filters" aria-label="Filter content"><select aria-label="Filter by content type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="">All types</option><option value="news">News</option><option value="event">Events</option><option value="meeting">Meetings</option></select><select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option></select><select aria-label="Filter by schedule" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}><option value="">Any date</option><option value="upcoming">Upcoming</option><option value="past">Past</option></select><select aria-label="Filter by display location" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}><option value="">All locations</option><option value="show_in_news">News page</option><option value="show_in_upcoming">Upcoming</option><option value="show_in_events">Events page</option><option value="show_on_homepage">Homepage</option></select><input aria-label="Filter by exact date" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} /></div>
      <div className={`bulk-toolbar ${selected.length ? "visible" : ""}`}>
        <strong>{selected.length} selected</strong>
        <button className="bulk-primary" onClick={() => onBulkAction("published")}>Publish</button>
        <button className="bulk-secondary" onClick={() => onBulkAction("draft")}>Move to draft</button>
        <button className="danger" onClick={() => onBulkAction("delete")}>
          Delete
        </button>
        <button className="bulk-clear" onClick={() => setSelected([])}>
          Clear
        </button>
      </div>
      <div className="cms-table-head">
        <span>
          <input
            type="checkbox"
            aria-label="Select all articles"
            checked={allSelected}
            onChange={toggleAll}
          />
        </span>
        <span>Title</span>
        <span>Type</span>
        <span>Date</span>
        <span>Status</span>
        <span>Display locations</span>
        <span>Last updated</span>
        <span>Actions</span>
      </div>
      {filteredArticles.map((a) => (
        <div className="cms-table-row" key={a.id}>
          <span>
            <input
              type="checkbox"
              aria-label={`Select ${a.title}`}
              checked={selected.includes(a.id)}
              onChange={() => toggle(a.id)}
            />
          </span>
          <strong>{a.title}{a.is_important && <span className="cms-important-badge">Important</span>}</strong>
          <span className="content-type">{a.content_type || 'news'}</span>
          <span>{displayDate(a.event_start_at || a.published_at)}</span>
          <span className={`status ${a.status}`}>{a.status}</span>
          <span className="content-locations">{locations(a)}</span>
          <span>{displayDate(a.updated_at)}</span>
          <span className="row-actions">
            <button className="row-action-edit" type="button" aria-label={`Edit ${a.title}`} onClick={() => edit(a)}>Edit</button>
            <button className="row-action-delete" type="button" aria-label={`Delete ${a.title}`} onClick={() => remove(a.id)}>Delete</button>
          </span>
        </div>
      ))}
    </div>
  );
}
function BarangaysEditor({ token, value, onSaved }) {
  const [form, setForm] = useState(value || []);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const update = (index, field, next) =>
    setForm((current) =>
      current.map((item, i) =>
        i === index ? { ...item, [field]: next } : item,
      ),
    );
  const uploadHeroImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file || selectedIndex === null) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return setError("Please choose a JPG, PNG, or WEBP image.");
    try {
      setUploading(true);
      setError("");
      const response = await fetch("/api/storage/upload-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
          context: "media",
        }),
      });
      const uploadData = await response.json();
      if (!response.ok)
        throw new Error(uploadData?.error || "Could not prepare image upload.");
      await putFile(uploadData.uploadUrl, file, () => {}).promise;
      const complete = await fetch("/api/media/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: uploadData.storagePath,
          originalFilename: file.name,
          contentType: file.type,
          fileSize: file.size,
          name: file.name,
        }),
      });
      const uploaded = await complete.json();
      if (!complete.ok)
        throw new Error(uploaded?.error || "Could not finish image upload.");
      update(
        selectedIndex,
        "heroImage",
        uploaded.preview_url || uploaded.storage_path,
      );
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };
  const save = async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/barangays", token, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      onSaved(result);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  const fields = selectedIndex === null ? null : form[selectedIndex];
  const editFields = fields && (
    <div className="barangay-modal-fields">
      <div className="official-form-row">
        <label>
          Barangay name
          <input
            required
            value={fields.name || ""}
            onChange={(e) => update(selectedIndex, "name", e.target.value)}
          />
        </label>
        <label>
          Punong Barangay
          <input
            required
            value={fields.captain || ""}
            onChange={(e) => update(selectedIndex, "captain", e.target.value)}
          />
        </label>
      </div>
      <div className="official-form-row">
        <label>
          Term start
          <input
            type="date"
            value={fields.termStart || ""}
            onChange={(e) => update(selectedIndex, "termStart", e.target.value)}
          />
        </label>
        <label>
          Term end
          <input
            type="date"
            value={fields.termEnd || ""}
            onChange={(e) => update(selectedIndex, "termEnd", e.target.value)}
          />
        </label>
      </div>
      <div className="official-form-row">
        <label>
          Population
          <input
            type="number"
            min="0"
            value={fields.population ?? ""}
            onChange={(e) =>
              update(
                selectedIndex,
                "population",
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
          />
          <small>2020 Census of Population and Housing</small>
        </label>
        <label>
          Description
          <textarea
            value={fields.description || ""}
            onChange={(e) =>
              update(selectedIndex, "description", e.target.value)
            }
            placeholder={`About Barangay ${fields.name || ""}`}
          />
        </label>
      </div>
      <label className="barangay-details-field">
        More information
        <textarea
          rows="10"
          value={fields.details || ""}
          onChange={(e) => update(selectedIndex, "details", e.target.value)}
          placeholder="Add headings, history, demographics, location, and other public information. HTML is supported."
        />
        <small>
          This content appears on the barangay's dedicated public profile page.
        </small>
      </label>
      <div className="official-form-row">
        <label>
          Latitude
          <input
            type="number"
            step="any"
            value={fields.coords?.lat ?? ""}
            onChange={(e) =>
              update(selectedIndex, "coords", {
                ...(fields.coords || {}),
                lat: e.target.value,
              })
            }
          />
        </label>
        <label>
          Longitude
          <input
            type="number"
            step="any"
            value={fields.coords?.lng ?? ""}
            onChange={(e) =>
              update(selectedIndex, "coords", {
                ...(fields.coords || {}),
                lng: e.target.value,
              })
            }
          />
        </label>
      </div>
    </div>
  );
  return (
    <form className="cms-editor officials-editor" onSubmit={save}>
      <div className="cms-title">
        <div>
          <h1>Barangays of Getafe</h1>
          <p>Select a barangay to edit its information.</p>
        </div>
        <button>Save Barangays</button>
      </div>
      <div className="barangay-selector">
        {form.map((item, index) => (
          <button
            type="button"
            key={item.id || index}
            onClick={() => setSelectedIndex(index)}
          >
            <span>{item.name}</span>
            <small>{item.captain || "No captain assigned"}</small>
            <b>›</b>
          </button>
        ))}
      </div>
      {error && <p className="cms-notice">{error}</p>}
      {selectedIndex !== null && (
        <div
          className="app-modal-backdrop"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setSelectedIndex(null)
          }
        >
          <div
            className="app-modal barangay-edit-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="barangay-modal-heading">
              <div>
                <p className="news-category">EDIT BARANGAY</p>
                <h2>{fields.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIndex(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <label className="barangay-image-field">
              Hero image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={uploadHeroImage}
                disabled={uploading}
              />
              <small>
                {uploading
                  ? "Uploading image…"
                  : "JPG, PNG, or WEBP up to 5 MB. This image appears at the top of the public barangay page."}
              </small>
              {fields.heroImage && (
                <img
                  className="barangay-image-preview"
                  src={fields.heroImage}
                  alt={`${fields.name} hero preview`}
                />
              )}
            </label>
            {editFields}
            <div className="app-modal-actions">
              <button type="button" onClick={() => setSelectedIndex(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

function OfficialsSelectorEditor({ token, value, onSaved }) {
  const fallback = {
    mayor: { name: "Cary M. Camacho, MPM", role: "Municipal Mayor" },
    viceMayor: { name: "Casey Shaun M. Camacho", role: "Municipal Vice-Mayor" },
    sbMembers: [],
    abcPresident: { name: "", role: "ABC President" },
    punongBarangays: [],
    deptHeads: [],
  };
  const [form, setForm] = useState(
    value && Object.keys(value).length ? value : fallback,
  );
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const roleOptions = [
    "Municipal Mayor",
    "Municipal Vice-Mayor",
    "SB Member",
    "ABC President",
    "Punong Barangay",
    "Municipal Administrator",
    "Municipal Treasurer",
    "Municipal Assessor",
    "Municipal Accountant",
    "Municipal Budget Officer",
    "Municipal Engineer",
    "Municipal Planning & Development Coordinator",
    "Local Civil Registrar",
    "Municipal Health Officer",
    "Municipal Social Welfare Officer",
    "Secretary to the Sangguniang Bayan",
  ];
  const people = [
    { key: "mayor", index: null, label: "Mayor", person: form.mayor },
    {
      key: "viceMayor",
      index: null,
      label: "Vice-Mayor",
      person: form.viceMayor,
    },
    {
      key: "abcPresident",
      index: null,
      label: "ABC President",
      person: form.abcPresident,
    },
    ...(form.sbMembers || []).map((person, index) => ({
      key: "sbMembers",
      index,
      label: person.role || "SB Member",
      person,
    })),
    ...(form.punongBarangays || []).map((person, index) => ({
      key: "punongBarangays",
      index,
      label: person.role || "Punong Barangay",
      person,
    })),
    ...(form.deptHeads || []).map((person, index) => ({
      key: "deptHeads",
      index,
      label: person.role || "Department Head",
      person,
    })),
  ];
  const current = selected === null ? null : people[selected];
  const update = (field, next) =>
    setForm((state) => ({
      ...state,
      [current.key]:
        current.index === null
          ? { ...state[current.key], [field]: next }
          : state[current.key].map((item, index) =>
              index === current.index ? { ...item, [field]: next } : item,
            ),
    }));
  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const response = await fetch("/api/storage/upload-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
          context: "media",
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Could not prepare image upload.");
      await putFile(data.uploadUrl, file, () => {}).promise;
      const complete = await fetch("/api/media/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: data.storagePath,
          originalFilename: file.name,
          contentType: file.type,
          fileSize: file.size,
          name: file.name,
        }),
      });
      const uploaded = await complete.json();
      if (!complete.ok)
        throw new Error(uploaded?.error || "Could not finish image upload.");
      update("photo", uploaded.storage_path || uploaded.preview_url);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };
  const save = async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/officials", token, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      onSaved(result);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <form className="cms-editor officials-editor" onSubmit={save}>
      <div className="cms-title">
        <div>
          <h1>Municipal Officials</h1>
          <p>Select an official to edit their public profile.</p>
        </div>
      </div>
      <div className="official-selector-grid">
        {people.map((item, index) => (
          <button
            type="button"
            key={`${item.key}-${item.index ?? "single"}`}
            onClick={() => setSelected(index)}
          >
            <span>{item.label}</span>
            <strong>{item.person?.name || "Unnamed official"}</strong>
            <small>
              {item.person?.biography
                ? "Biography added"
                : "Add biography and photo"}
            </small>
            <b>›</b>
          </button>
        ))}
      </div>
      {error && <p className="cms-notice">{error}</p>}
      {current && (
        <div
          className="app-modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setSelected(null)
          }
        >
          <div
            className="app-modal official-edit-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="barangay-modal-heading">
              <div>
                <p className="news-category">EDIT OFFICIAL</p>
                <h2>{current.person.name || "Unnamed official"}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close editor"
              >
                <X size={20} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
            <div className="official-modal-fields">
              <label>
                Name
                <input
                  required
                  value={current.person.name || ""}
                  onChange={(e) => update("name", e.target.value)}
                />
              </label>
              <label>
                Role
                <select
                  required
                  value={current.person.role || ""}
                  onChange={(e) => update("role", e.target.value)}
                >
                  {!roleOptions.includes(current.person.role) &&
                    current.person.role && (
                      <option value={current.person.role}>
                        {current.person.role}
                      </option>
                    )}
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Biography
                <textarea
                  rows="6"
                  value={current.person.biography || ""}
                  onChange={(e) => update("biography", e.target.value)}
                  placeholder="Biography and public profile information"
                />
              </label>
              <label>
                Profile image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={uploadPhoto}
                  disabled={uploading}
                />
                <small>
                  {uploading
                    ? "Uploading image…"
                    : "Default profile SVG is used when no image is uploaded."}
                </small>
              </label>
            </div>
            <div className="app-modal-actions">
              <button type="button" onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

function OfficialsEditor({ token, value, onSaved }) {
  const fallback = {
    mayor: { name: "Cary M. Camacho, MPM", role: "Municipal Mayor" },
    viceMayor: { name: "Casey Shaun M. Camacho", role: "Municipal Vice-Mayor" },
    sbMembers: [],
    abcPresident: { name: "", role: "ABC President" },
    deptHeads: [],
  };
  const [form, setForm] = useState(
    value && Object.keys(value).length ? value : fallback,
  );
  const [error, setError] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const update = (key, field, value) =>
    setForm((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
  const updateList = (key, index, field, value) =>
    setForm((current) => ({
      ...current,
      [key]: current[key].map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  const add = (key, item) =>
    setForm((current) => ({
      ...current,
      [key]: [...(current[key] || []), item],
    }));
  const remove = (key, index) =>
    setForm((current) => ({
      ...current,
      [key]: current[key].filter((_, i) => i !== index),
    }));
  const uploadPhoto = async (event, onChange) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploadingPhoto(true);
      const response = await fetch("/api/storage/upload-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
          context: "media",
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Could not prepare image upload.");
      await putFile(data.uploadUrl, file, () => {}).promise;
      const complete = await fetch("/api/media/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: data.storagePath,
          originalFilename: file.name,
          contentType: file.type,
          fileSize: file.size,
          name: file.name,
        }),
      });
      const uploaded = await complete.json();
      if (!complete.ok)
        throw new Error(uploaded?.error || "Could not finish image upload.");
      onChange("photo", uploaded.storage_path || uploaded.preview_url);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploadingPhoto(false);
      event.target.value = "";
    }
  };
  const save = async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/officials", token, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      onSaved(result);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  const personFields = (person, onChange) => (
    <div className="official-fields">
      <div className="official-form-row">
        <label>
          Name
          <input
            required
            value={person.name || ""}
            onChange={(e) => onChange("name", e.target.value)}
          />
        </label>
        <label>
          Role
          <input
            required
            value={person.role || ""}
            onChange={(e) => onChange("role", e.target.value)}
          />
        </label>
      </div>
      <div className="official-form-row">
        <label>
          Biography
          <textarea
            value={person.biography || ""}
            onChange={(e) => onChange("biography", e.target.value)}
            placeholder="Biography and public profile information"
          />
        </label>
        <label>
          Profile image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => uploadPhoto(e, onChange)}
            disabled={uploadingPhoto}
          />
          <small>
            {uploadingPhoto
              ? "Uploading image…"
              : "Default profile SVG is used when no image is uploaded."}
          </small>
          {person.photo && (
            <img
              className="official-photo-preview"
              src={person.photo}
              alt="Profile preview"
            />
          )}
        </label>
      </div>
    </div>
  );
  return (
    <form className="cms-editor officials-editor" onSubmit={save}>
      <div className="cms-title">
        <div>
          <h1>Municipal Officials</h1>
          <p>
            Update the officials shown on the public Municipal Officials page.
          </p>
        </div>
        <button>Save Officials</button>
      </div>
      <fieldset>
        <legend>Municipal leadership</legend>
        {personFields(form.mayor, (field, value) =>
          update("mayor", field, value),
        )}
        {personFields(form.viceMayor, (field, value) =>
          update("viceMayor", field, value),
        )}
      </fieldset>
      <fieldset>
        <legend>Sangguniang Bayan</legend>
        {(form.sbMembers || []).map((person, index) => (
          <div className="official-repeat-row" key={index}>
            {personFields(person, (field, value) =>
              updateList("sbMembers", index, field, value),
            )}
            <button
              type="button"
              className="danger"
              onClick={() => remove("sbMembers", index)}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="outline-button"
          onClick={() => add("sbMembers", { name: "", role: "SB Member" })}
        >
          + Add SB Member
        </button>
      </fieldset>
      <fieldset>
        <legend>ABC President</legend>
        {personFields(form.abcPresident, (field, value) =>
          update("abcPresident", field, value),
        )}
      </fieldset>
      <fieldset>
        <legend>Punong Barangays</legend>
        {(form.punongBarangays || []).map((person, index) => (
          <div className="official-repeat-row" key={index}>
            {personFields(person, (field, value) =>
              updateList("punongBarangays", index, field, value),
            )}
            <button
              type="button"
              className="danger"
              onClick={() => remove("punongBarangays", index)}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="outline-button"
          onClick={() => add("punongBarangays", { name: "", role: "" })}
        >
          + Add Punong Barangay
        </button>
      </fieldset>
      <fieldset>
        <legend>Department heads</legend>
        {(form.deptHeads || []).map((person, index) => (
          <div className="official-repeat-row" key={index}>
            {personFields(person, (field, value) =>
              updateList("deptHeads", index, field, value),
            )}
            <button
              type="button"
              className="danger"
              onClick={() => remove("deptHeads", index)}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="outline-button"
          onClick={() => add("deptHeads", { name: "", role: "" })}
        >
          + Add department head
        </button>
      </fieldset>
      {error && <p className="cms-notice">{error}</p>}
    </form>
  );
}

function Categories({ token, categories, reload }) {
  const [name, setName] = useState("");
  const add = async (e) => {
    e.preventDefault();
    try {
      await api("/api/categories", token, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setName("");
      reload();
    } catch (e) {
      alert(e.message);
    }
  };
  return (
    <>
      <h1>Categories</h1>
      <form className="category-form" onSubmit={add}>
        <input
          placeholder="New category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button>Add category</button>
      </form>
      <div className="category-list">
        {categories.map((c) => (
          <div key={c.id}>
            <span>{c.name}</span>
            <button
              className="danger"
              onClick={async () => {
                if (confirm(`Delete ${c.name}?`)) {
                  try {
                    await api(`/api/categories/${c.id}`, token, {
                      method: "DELETE",
                    });
                    reload();
                  } catch (e) {
                    alert(e.message);
                  }
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
