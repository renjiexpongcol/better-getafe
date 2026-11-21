import MediaFolderPicker, { MediaFolderBrowser } from '../../components/MediaFolderBrowser'
import { uploadMediaImage } from '../../services/mediaUpload'
import ModalDialog from '../../components/ModalDialog'
import { PageHeader, Button, Field, ErrorState, Alert, EmptyState } from '../../components/ui/Primitives'
import { requestJson, apiFetch } from '../../services/apiTransport.js';
const AdminPublicContent = lazy(() => import('../../components/AdminPublicContent'));
const AdminDepartments = lazy(() => import('../../components/AdminDepartments'));
const AdminEservices = lazy(() => import('../../components/AdminEservices'));
const AdminDestinations = lazy(() => import('../../components/AdminDestinations'));
import { lazy, useEffect, useRef, useState } from "react";
import { Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
const Settings = lazy(() => import('../../components/AdminSettings'));
const AdminPrivacyRequests = lazy(() => import('../../components/AdminPrivacyRequests'));
const AdminErrorLogs = lazy(() => import('../../components/AdminErrorLogs'));
const AdminIntegrations = lazy(() => import('../../components/AdminIntegrations'));
const AdminAiManagement = lazy(() => import('../../components/AdminAiManagement'));
const AiContentStudio = lazy(() => import('../../components/AiContentStudio'));
const SearchManagement = lazy(() => import('../../components/SearchManagement'));
const WebsiteAnalytics = lazy(() => import('../../components/WebsiteAnalytics'));
const AdminAccessManagement = lazy(() => import('../../components/AdminAccessManagement'));
import PasswordChangeModal from "../../components/PasswordChangeModal";
import "../../citizen.css";
import "./AdminDashboard.css";
import { LayoutDashboard, Newspaper, Tags, Images, Users, MapPin, Settings as SettingsIcon, ShieldCheck, LogOut, Menu, X, ChevronDown, UserRound, ArrowRight, Plus, Search, FileText, Camera, MoreVertical, GripVertical, ExternalLink, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, ImageOff, Check, Copy, Download, Eye, RotateCcw, Info, AlertTriangle, ClipboardList, BarChart3, Clock3, RefreshCw, Sparkles } from "lucide-react";
import { hasModulePermission, resolveModule } from "../../applicationModuleRegistry";
import { ModuleAccessDeniedPage, ModuleNotFoundPage } from "../../components/RouteStatusPages";
import StableAvatar from "../../components/StableAvatar";
import { invalidateCachedPrefix } from "../../services/requestCache";
import { adminLocation, ADMIN_MODULE_PATHS, getAdminActiveModule, ROUTES } from "../../routeRegistry";
import { normalizePublicError } from "../../services/publicError";
import { routeRequest } from '../../services/routeRequests';
import { hasPermission } from '@getafe/auth-client';
const ImageLightbox = lazy(() => import('../../components/ImageLightbox'));
const normalizeAdminTab = value => value === 'system-settings' ? 'settings' : value;
const toIsoDateTime = value => value ? new Date(value).toISOString() : value;
const accessActivityLabel = value => String(value || 'Activity').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const accessActivityDate = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }); };
const toLocalDateTimeInput = value => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const navigationIcons = { 'service-catalog': FileText, search: Search, 'website-analytics': BarChart3, departments: Users, discover: MapPin, dashboard: LayoutDashboard, news: Newspaper, categories: Tags, media: Images, officials: Users, barangays: MapPin, settings: SettingsIcon, ai: Sparkles, errors: AlertTriangle, privacy: ShieldCheck, users: Users, groups: Users, permissions: ShieldCheck, policies: ShieldCheck, audit: FileText, access: ShieldCheck };
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
  ai_generation_id: "",
  featured_image: "",
  gallery_images: [],
};
const api = (url, _token, options = {}) => (!options.method || options.method === 'GET') ? routeRequest(url, { scope: 'cms', ...options }) : requestJson(url, options);
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
const checksumFile = async (file) => {
  if (!window.crypto?.subtle) return '';
  const digest = await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
const editorDraftPayload = ({ featured_image_preview: _preview, ...value }) => ({
  ...value,
  gallery_images: (value.gallery_images || []).map(({ preview, url, thumbnail_url, ...image }) => image),
  published_at: toIsoDateTime(value.published_at),
  event_start_at: toIsoDateTime(value.event_start_at),
  event_end_at: toIsoDateTime(value.event_end_at),
});
const hasDraftContent = (value) => Boolean(
  value.title?.trim() || value.excerpt?.trim() || value.content?.trim() || value.featured_image || value.gallery_images?.length,
);
const formatFileSize = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};
const formatMediaType = (value) => {
  const type = String(value || '').split('/').pop();
  return type ? type.toUpperCase() : 'IMAGE';
};
async function compactAvatar(file) {
  if (typeof createImageBitmap !== 'function') return file;
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }
  try {
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 180 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp', lastModified: Date.now() }) : file;
  } finally { bitmap.close?.(); }
}
export default function Admin() {
  const { user, loading: authLoading, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = adminLocation(location.pathname);
  const activeAdminModule = getAdminActiveModule(location);
  const requestedModule = routeState?.module || null;
  const tab = normalizeAdminTab(requestedModule || 'dashboard');
  const requestedModuleAccess = resolveModule('admin', requestedModule === 'settings' ? 'system-settings' : requestedModule);
  const can = permission => hasPermission(user, permission);
  const routeAuthorized = hasModulePermission(requestedModuleAccess, user);
  const canViewAccess = hasPermission(user, 'users.view');
  const token = true;
  const accountMenuRef = useRef(null);
  const mediaTriggerRef = useRef(null);
  const navigationRef = useRef(null), mainRef = useRef(null), navigationTriggerRef = useRef(null);
  const accountButtonRef = useRef(null);
  const accountDialogRef = useRef(null);
  const avatarInputRef = useRef(null);
  const changePasswordButtonRef = useRef(null);
  const passwordOpenRef = useRef(false);
  const mediaDeleteTriggerRef = useRef(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInitials = (user.name || 'Admin').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  passwordOpenRef.current = passwordOpen;
  useEffect(() => { setAvatarBroken(false); }, [user.avatar_url]);
  const uploadAvatar = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('The image must be 5 MB or smaller.');
      return;
    }
    setAvatarBusy(true);
    try {
      const compactFile = await compactAvatar(file);
      const response = await apiFetch('/api/account/avatar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': compactFile.type, 'X-Requested-With': 'GetafeCitizenPortal' }, body: compactFile });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(normalizePublicError({ status: response.status, body }, 'form').message);
      await refreshUser();
      setNotice('Profile image updated.');
    } catch (error) {
      setAvatarError(error.message);
    } finally {
      setAvatarBusy(false);
    }
  };
  useEffect(() => {
    if (!accountOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    accountDialogRef.current?.querySelector('button')?.focus();
    const onKey = event => {
      if (passwordOpenRef.current) return;
      if (event.key === 'Escape') { event.preventDefault(); setAccountOpen(false); }
      if (event.key !== 'Tab') return;
      const controls = [...accountDialogRef.current.querySelectorAll('button, a, input')].filter(item => !item.disabled && item.offsetParent !== null);
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
    [newsLoading, setNewsLoading] = useState(false),
    [newsError, setNewsError] = useState(''),
    [newsReloadRevision, setNewsReloadRevision] = useState(0),
    [accessActivity, setAccessActivity] = useState([]),
    [accessActivityLoading, setAccessActivityLoading] = useState(false),
    [accessActivityError, setAccessActivityError] = useState(''),
    [accessActivityRevision, setAccessActivityRevision] = useState(0),
    [articleCounts, setArticleCounts] = useState({ published: 0, draft: 0 }),
    [newsPagination, setNewsPagination] = useState({ page: 1, pages: 1, total: 0 }),
    [newsPage, setNewsPage] = useState(1),
    [newsFilters, setNewsFilters] = useState({}),
    [categories, setCategories] = useState([]),
    [categoryLoad, setCategoryLoad] = useState({ loading: false, error: '' }),
    [officials, setOfficials] = useState(null),
    [barangayRecords, setBarangayRecords] = useState(null),
    [form, setForm] = useState(blank),
    [editing, setEditing] = useState(null),
    [saving, setSaving] = useState(false),
    [autosaveState, setAutosaveState] = useState(''),
    [notice, setNotice] = useState(""),
    [media, setMedia] = useState([]),
    [settings, setSettings] = useState(null),
    [settingsLoading, setSettingsLoading] = useState(false),
    [confirmDialog, setConfirmDialog] = useState(null),
    [confirmBusy, setConfirmBusy] = useState(false),
     [selectedArticles, setSelectedArticles] = useState([]),
     [selectedMedia, setSelectedMedia] = useState([]),
     [mediaDetails, setMediaDetails] = useState(null),
     [adminSearch, setAdminSearch] = useState(""),
    [profileMenuOpen, setProfileMenuOpen] = useState(false),
    [mobileSidebarOpen, setMobileSidebarOpen] = useState(false),
    [newsMediaUpload, setNewsMediaUpload] = useState(''),
    [newsMediaError, setNewsMediaError] = useState(''),
    [galleryLibraryOpen, setGalleryLibraryOpen] = useState(false),
    [featuredPickerOpen, setFeaturedPickerOpen] = useState(false),
    [mediaFolderRevision, setMediaFolderRevision] = useState(0),
    [galleryMenuOpen, setGalleryMenuOpen] = useState(null),
    [galleryPreviewIndex, setGalleryPreviewIndex] = useState(null),
    [draggedGalleryIndex, setDraggedGalleryIndex] = useState(null),
     [brokenGalleryImages, setBrokenGalleryImages] = useState({});
  const newsContentRef = useRef(null);
  useEffect(() => {
    const onEscape = event => { if (event.key === 'Escape') { setMobileSidebarOpen(false); setProfileMenuOpen(false); if (accountMenuRef.current?.contains(document.activeElement)) accountButtonRef.current?.focus(); } };
    window.addEventListener('keydown', onEscape);
    return () => { window.removeEventListener('keydown', onEscape); };
  }, []);
  useEffect(() => {
    document.body.classList.toggle("cms-drawer-open", mobileSidebarOpen);
    return () => document.body.classList.remove("cms-drawer-open");
  }, [mobileSidebarOpen]);
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const sidebar = navigationRef.current, content = mainRef.current;
    const trigger = navigationTriggerRef.current;
    content?.setAttribute('inert', '');
    const controls = () => [...sidebar.querySelectorAll('a[href],button:not(:disabled)')].filter(node => node.getClientRects().length);
    controls()[0]?.focus();
    const trap = event => {
      if (event.key !== 'Tab') return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    sidebar.addEventListener('keydown', trap);
    return () => { content?.removeAttribute('inert'); sidebar.removeEventListener('keydown', trap); trigger?.focus({ preventScroll:true }); };
  }, [mobileSidebarOpen]);
  const settingsRequestRef = useRef({ key: '', promise: null });
  const noticeTimer = useRef(null);
  const autosaveTimer = useRef(null);
  const autosaveQueue = useRef(Promise.resolve());
  const draftCreatePromiseRef = useRef(null);
  const autosaveSequence = useRef(0);
  const formRef = useRef(form);
  const editingRef = useRef(editing);
  const skipDraftRestoreRef = useRef(false);
  const draftRestoreAttemptRef = useRef('');
  const lastAutosaveSignatureRef = useRef('');
  formRef.current = form;
  editingRef.current = editing;
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
    if (!routeAuthorized) return;
    if (signal?.aborted) return;
    if (tab === 'news') { setNewsLoading(true); setNewsError(''); }
    const setters = [
      (news) => {
        if (!Array.isArray(news?.items)) throw new Error('News could not be loaded. Try again.')
        setArticles(news.items)
        setNewsPagination({ page: news.page || 1, pages: news.pages || 1, total: news.total || 0 })
        setArticleCounts(news.statusCounts || { published: news.items.filter(item => item.status === 'published').length, draft: news.items.filter(item => item.status === 'draft').length })
      },
      (items) => {
        if (!Array.isArray(items)) throw new Error('The category list could not be read.')
        setCategories(items)
      },
      setOfficials,
      setBarangayRecords,
    ];
    const labels = [
      "News",
      "Categories",
      "Officials",
      "Barangays",
    ];
    const newsParams = new URLSearchParams({ limit: tab === 'news' ? '20' : tab === 'dashboard' ? '5' : '100' });
    if (tab === 'news') {
      newsParams.set('page', String(newsPage));
      for (const [key, value] of Object.entries(newsFilters)) if (value) newsParams.set(key, String(value));
    }
    const tasks = [
      { path: `/api/admin/news?${newsParams}`, tabs: ['dashboard','news','editor'] },
      { path: '/api/categories', tabs: ['dashboard','editor','categories'], startupSensitive: true },
      { path: '/api/officials', tabs: ['officials','barangays'] },
      { path: '/api/barangays', tabs: ['barangays','officials'] },
    ].map((task,index)=>({...task,index})).filter(task=>task.tabs.includes(tab));
    if (tasks.some(task => task.index === 1)) setCategoryLoad({ loading: true, error: '' })
    const results = await Promise.allSettled(tasks.map(task => api(task.path, token, { signal, startupSensitive: task.startupSensitive })));
    if (signal?.aborted) return;
    const errors = [];
    results.forEach((result, taskIndex) => {
      const index = tasks[taskIndex].index;
      if (index === 1) {
        const failed = result.status === 'rejected' || !Array.isArray(result.value)
        setCategoryLoad({ loading: false, error: failed ? 'Categories could not be refreshed.' : '' })
        if (failed && tab === 'categories') return;
      }
      if (result.status === "fulfilled") { try { setters[index](result.value) } catch (error) { errors.push(`${labels[index]}: ${error.message}`); if (index === 0 && tab === 'news') setNewsError('News & events could not be loaded. Try again.') } }
      else errors.push(`${labels[index]}: ${result.reason.message}`);
    });
    if (tab === 'news') {
      const newsTaskIndex = tasks.findIndex(task => task.index === 0);
      if (results[newsTaskIndex]?.status === 'rejected') setNewsError('News & events could not be loaded. Try again.');
      setNewsLoading(false);
    }
    if (errors.length)
      setNotice(`Some dashboard data could not be loaded. ${errors.join(" ")}`);
  };
  useEffect(() => {
    if (authLoading || !routeAuthorized || !["admin", "super_admin"].includes(user?.role)) return;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [authLoading, user?.id, user?.role, tab, routeAuthorized, newsPage, newsFilters, newsReloadRevision]);
  useEffect(() => {
    if (tab !== 'dashboard' || !canViewAccess) return undefined;
    const controller = new AbortController();
    setAccessActivityLoading(true);
    setAccessActivityError('');
    routeRequest('/api/admin/access', { scope: `cms:${user?.id || 'admin'}:access-activity`, signal: controller.signal, force: accessActivityRevision > 0 })
      .then(data => setAccessActivity(Array.isArray(data?.activity) ? data.activity : []))
      .catch(error => { if (error.name !== 'AbortError') setAccessActivityError(error.message || 'Recent access activity could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setAccessActivityLoading(false) });
    return () => controller.abort();
  }, [tab, user?.id, canViewAccess, accessActivityRevision]);
  useEffect(() => {
    if (tab === 'news' && newsPagination.page !== newsPage) setNewsPage(newsPagination.page);
  }, [newsPagination.page, newsPage, tab]);
  const draftStorageKey = (suffix) => `getafe-cms-draft:${user?.id || 'anonymous'}:${suffix}`;
  const draftSignature = (value) => {
    const payload = editorDraftPayload(value);
    delete payload.autosave_version;
    delete payload.status;
    return JSON.stringify(payload);
  };
  const editorFormFromArticle = (article) => ({
    ...article,
    gallery_images: article.gallery_images || [],
    featured_image: article.featured_image_path || article.featured_image || '',
    featured_image_preview: article.featured_image_path && article.featured_image !== article.featured_image_path ? article.featured_image : '',
    published_at: toLocalDateTimeInput(article.published_at),
    event_start_at: toLocalDateTimeInput(article.event_start_at),
    event_end_at: toLocalDateTimeInput(article.event_end_at),
  });
  const persistLocalDraft = (value, id = editingRef.current) => {
    if (!user?.id || !hasDraftContent(value)) return;
    try {
      localStorage.setItem(draftStorageKey(id || 'new'), JSON.stringify({ id, form: editorDraftPayload(value), updatedAt: new Date().toISOString() }));
      localStorage.setItem(draftStorageKey('last'), id || 'new');
    } catch {
      // Local recovery is best-effort; the server draft remains authoritative.
    }
  };
  const createDraftOnce = (snapshot) => {
    if (editingRef.current) return Promise.resolve(null);
    if (draftCreatePromiseRef.current) return draftCreatePromiseRef.current;
    const payload = { ...editorDraftPayload(snapshot), status: 'draft' };
    const promise = api('/api/news/drafts', token, {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(saved => {
      if (saved?.id) {
        editingRef.current = saved.id;
        setEditing(saved.id);
        try { localStorage.setItem(draftStorageKey('last'), saved.id); } catch { /* best effort */ }
      }
      return saved;
    }).finally(() => {
      if (draftCreatePromiseRef.current === promise) draftCreatePromiseRef.current = null;
    });
    draftCreatePromiseRef.current = promise;
    return promise;
  };
  const queueDraftAutosave = (snapshot, sequence) => {
    autosaveQueue.current = autosaveQueue.current
      .catch(() => {})
      .then(async () => {
        const currentId = editingRef.current;
        const payload = { ...editorDraftPayload(snapshot), status: 'draft' };
        const saved = currentId
          ? await api(`/api/news/${currentId}/draft`, token, { method: 'PATCH', body: JSON.stringify(payload) })
          : await createDraftOnce(snapshot);
        if (saved?.id) {
          const savedPath = saved.featured_image_path || saved.featured_image || '';
          setForm((current) => ({
            ...current,
            autosave_version: saved.autosave_version,
            ...(savedPath ? { featured_image: savedPath } : {}),
          }));
          setArticles((current) => current.some((article) => article.id === saved.id)
            ? current.map((article) => article.id === saved.id ? saved : article)
            : [saved, ...current]);
          persistLocalDraft(formRef.current, saved.id);
        }
        lastAutosaveSignatureRef.current = draftSignature(snapshot);
        if (sequence === autosaveSequence.current) setAutosaveState('saved');
      })
      .catch((error) => {
        if (sequence === autosaveSequence.current) {
          if (error.code === 'DRAFT_CONFLICT') setAutosaveState('conflict');
          else setAutosaveState('error');
        }
      });
  };
  useEffect(() => {
    if (tab !== 'editor' || !user?.id) return undefined;
    if (!hasDraftContent(form)) return undefined;
    persistLocalDraft(form);
    const signature = draftSignature(form);
    if (signature === lastAutosaveSignatureRef.current) return undefined;
    clearTimeout(autosaveTimer.current);
    setAutosaveState('unsaved');
    const sequence = ++autosaveSequence.current;
    autosaveTimer.current = setTimeout(() => queueDraftAutosave(formRef.current, sequence), 1100);
    return () => clearTimeout(autosaveTimer.current);
  }, [form, editing, tab, user?.id]);
  useEffect(() => {
    if (tab !== 'editor' || !user?.id || draftRestoreAttemptRef.current === `${user.id}:editor`) return;
    if (skipDraftRestoreRef.current) {
      skipDraftRestoreRef.current = false;
      draftRestoreAttemptRef.current = `${user.id}:editor`;
      return;
    }
    let storedId = '';
    try { storedId = localStorage.getItem(draftStorageKey('last')) || ''; } catch { /* best effort */ }
    if (!storedId) {
      draftRestoreAttemptRef.current = `${user.id}:editor`;
      return;
    }
    if (storedId !== 'new') {
      const article = articles.find((item) => item.id === storedId && item.status === 'draft');
      if (!article) return;
      let recoveredArticle = article;
      try {
        const raw = localStorage.getItem(draftStorageKey(storedId));
        const recovered = raw ? JSON.parse(raw) : null;
        if (recovered?.form && hasDraftContent(recovered.form)) {
          const featuredPath = recovered.form.featured_image || '';
          const urls = new Map((article.gallery_images || []).map(image => [image.storage_path, image.url]));
          recoveredArticle = {
            ...article,
            ...recovered.form,
            featured_image_path: featuredPath,
            featured_image: featuredPath === article.featured_image_path ? article.featured_image : featuredPath,
            gallery_images: (recovered.form.gallery_images || []).map(image => ({ ...image, url: urls.get(image.storage_path) })),
          };
        }
      } catch { /* best effort */ }
      const restoredForm = editorFormFromArticle(recoveredArticle);
      setForm(restoredForm);
      setEditing(article.id);
      lastAutosaveSignatureRef.current = draftSignature(restoredForm);
      setAutosaveState('saved');
    } else {
      try {
        const raw = localStorage.getItem(draftStorageKey('new'));
        const recovered = raw ? JSON.parse(raw) : null;
        if (recovered?.form && hasDraftContent(recovered.form)) {
          setForm({ ...blank, ...recovered.form });
          setEditing(null);
          setAutosaveState('recovered');
        }
      } catch { /* best effort */ }
    }
    draftRestoreAttemptRef.current = `${user.id}:editor`;
  }, [tab, user?.id, articles]);
  useEffect(() => {
    if (authLoading || !routeAuthorized || !["admin", "super_admin"].includes(user?.role) || tab !== "settings") return undefined;
    const category = routeState?.category || 'general';
    const path = ['status', 'history'].includes(category)
      ? '/api/admin/settings'
      : `/api/admin/settings/${encodeURIComponent(category)}`;
    const permissionSignature = Array.isArray(user.permissions) ? user.permissions.join('|') : '';
    const key = `${user.id}:${permissionSignature}:${path}`;
    let promise = settingsRequestRef.current.key === key ? settingsRequestRef.current.promise : null;
    if (!promise) {
      promise = api(path, token);
      settingsRequestRef.current = { key, promise };
      promise.catch(() => {
        if (settingsRequestRef.current.promise === promise) settingsRequestRef.current = { key: '', promise: null };
      });
    }
    let active = true;
    setSettingsLoading(true);
    promise
      .then(body => { if (active) setSettings(body); })
      .catch(error => { if (active && error?.name !== 'AbortError') setNotice(error.message); })
      .finally(() => { if (active) setSettingsLoading(false); });
    return () => { active = false; };
  }, [authLoading, routeState?.category, tab, user?.id, user?.permissions, user?.role]);
  const saveArticle = async (e) => {
    e.preventDefault();
    if (saving || newsMediaUpload) return;
    setSaving(true);
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = null;
    ++autosaveSequence.current;
    try {
      await autosaveQueue.current.catch(() => {});
      const payload = editorDraftPayload(form);
      const currentEditing = editingRef.current;
      let draft = currentEditing ? null : await createDraftOnce(form);
      const articleId = currentEditing || draft?.id;
      const saved = form.status === 'published'
        ? await api(`/api/news/${articleId}`, token, { method: 'PUT', body: JSON.stringify({ ...payload, status: 'published' }) })
        : (currentEditing
          ? await api(`/api/news/${articleId}`, token, { method: 'PUT', body: JSON.stringify({ ...payload, status: 'draft' }) })
          : draft);
      if (saved?.id) {
        setArticles(current => current.map(article =>
          article.id === saved.id
            ? saved
            : saved.is_important ? { ...article, is_important: false } : article
        ));
      }
      setNotice(editing ? "Content updated." : "Content created.");
      try {
        localStorage.removeItem(draftStorageKey(editing || 'new'));
        localStorage.removeItem(draftStorageKey(saved?.id || editing || 'new'));
        if (localStorage.getItem(draftStorageKey('last')) === (saved?.id || editing)) localStorage.removeItem(draftStorageKey('last'));
      } catch { /* best effort */ }
      lastAutosaveSignatureRef.current = '';
      setForm(blank);
      editingRef.current = null;
      setEditing(null);
      navigate(ROUTES.admin.news);
      load();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setSaving(false);
    }
  };
  const askConfirm = (title, message, action, options = {}) =>
    setConfirmDialog({ title, message, action, ...options });
  const openMediaReferenceDialog = (items, { selectedCount = items.length, deletedCount = 0 } = {}) => {
    const protectedById = new Map();
    items.forEach(item => {
      const mediaItem = media.find(candidate => candidate.id === item.id);
      const existing = protectedById.get(item.id) || {
        id: item.id,
        filename: mediaItem?.original_filename || mediaItem?.name || mediaItem?.storage_path?.split('/').at(-1) || 'Untitled image',
        storageFilename: mediaItem?.storage_path?.split('/').at(-1) || '',
        previewUrl: mediaItem?.preview_url || '',
        references: [],
      };
      (item.references || []).forEach(reference => {
        const key = `${reference.content_type || 'other'}:${reference.content_id || reference.title || ''}`;
        const matching = existing.references.find(candidate => `${candidate.content_type || 'other'}:${candidate.content_id || candidate.title || ''}` === key);
        if (matching) matching.roles = [...new Set([...(matching.roles || []), ...(reference.roles || [])])];
        else existing.references.push(reference);
      });
      protectedById.set(item.id, existing);
    });
    const protectedItems = [...protectedById.values()].map(item => ({
      ...item,
      storageFilename: item.storageFilename && item.storageFilename !== item.filename ? item.storageFilename : '',
    }));
    const protectedCount = protectedItems.length;
    askConfirm(
      protectedCount === 1 ? "Media is currently in use" : "Some media is currently in use",
      protectedCount === 1
        ? "This media item is referenced by existing content and cannot be deleted until those references are removed."
        : "Some selected media items are referenced by existing content and cannot be deleted until those references are removed.",
      null,
      {
        kind: 'media-references',
        mediaItems: protectedItems,
        selectedCount,
        deletedCount,
        returnFocus: mediaDeleteTriggerRef.current || (document.activeElement instanceof HTMLElement ? document.activeElement : null),
      },
    );
  };
  const deleteMediaRequest = async (ids, force = false) => {
    const uniqueIds = [...new Set(ids)];
    let response;
    try {
      response = uniqueIds.length === 1
        ? await api(`/api/media/${uniqueIds[0]}`, token, {
            method: "DELETE",
            body: JSON.stringify({ force }),
          })
        : await api("/api/media", token, {
            method: "DELETE",
            body: JSON.stringify({ ids: uniqueIds, force }),
          });
    } catch (error) {
      if (!force && error.code === "MEDIA_REFERENCED") {
        openMediaReferenceDialog([{ id: uniqueIds[0], references: error.references }], { selectedCount: uniqueIds.length });
        return { keepOpen: true };
      }
      throw new Error(error.error || error.message);
    }

    const results = uniqueIds.length === 1
      ? [{ id: uniqueIds[0], success: true, ...response }]
      : response.results || [];
    const deletedIds = results.filter((result) => result.success).map((result) => result.id);
    const blocked = results.filter((result) => !result.success && result.code === "MEDIA_REFERENCED");
    if (deletedIds.length) {
      setMedia((items) => items.filter((item) => !deletedIds.includes(item.id)));
      setSelectedMedia((items) => items.filter((id) => !deletedIds.includes(id)));
      invalidateCachedPrefix('cms:media:');
      setMediaFolderRevision(current => current + 1);
    }
    if (blocked.length && !force) {
      openMediaReferenceDialog(
        blocked,
        { selectedCount: uniqueIds.length, deletedCount: deletedIds.length },
      );
      return { keepOpen: true };
    }

    const failures = results.filter((result) => !result.success);
    if (failures.length) {
      const detail = failures.length === 1
        ? failures[0].error
        : `${failures.length} item${failures.length === 1 ? "" : "s"} could not be deleted.`;
      setNotice(deletedIds.length ? `${deletedIds.length} media deleted. ${detail}` : detail);
    } else {
      setNotice(`${deletedIds.length === 1 ? "Media deleted" : `${deletedIds.length} media deleted`}. The file${deletedIds.length === 1 ? " was" : "s were"} permanently removed from the Media Library and storage.`);
    }
  };
  const removeArticle = async (id) =>
    askConfirm(
      "Delete content item?",
      "This content item will be permanently removed.",
      async () => {
        await api(`/api/news/${id}`, token, { method: "DELETE" });
        load();
      },
    );
  const bulkAction = (action, ids) => {
    if (!ids.length) return;
    const run = async () => {
      await api("/api/news/bulk", token, {
        method: "POST",
        body: JSON.stringify({ ids, action }),
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
        `${ids.length} article${ids.length === 1 ? "" : "s"} will be permanently removed.`,
        run,
      );
    else run().catch((e) => setNotice(e.message));
  };
  const reorderGalleryImage = (index, offset) => setForm(current => {
    const images = [...(current.gallery_images || [])];
    const next = index + offset;
    if (next < 0 || next >= images.length) return current;
    [images[index], images[next]] = [images[next], images[index]];
    return { ...current, gallery_images: images.map((image, position) => ({ ...image, position })) };
  });
  const moveGalleryImageTo = (index, targetIndex) => setForm(current => {
    const images = [...(current.gallery_images || [])];
    if (index < 0 || index >= images.length || targetIndex < 0 || targetIndex >= images.length || index === targetIndex) return current;
    const [image] = images.splice(index, 1);
    images.splice(targetIndex, 0, image);
    return { ...current, gallery_images: images.map((item, position) => ({ ...item, position })) };
  });
  const removeGalleryImage = index => setForm(current => {
    const images = current.gallery_images || [];
    const removed = images[index];
    const removedPath = removed?.storage_path;
    const next = images.filter((_, itemIndex) => itemIndex !== index).map((item, position) => ({ ...item, position }));
    const featuredWasRemoved = removedPath && removedPath === current.featured_image;
    return {
      ...current,
      gallery_images: next,
      ...(featuredWasRemoved ? { featured_image: '', featured_image_preview: '' } : {}),
    };
  });
  const setFeaturedGalleryImage = index => setForm(current => {
    const image = (current.gallery_images || [])[index];
    if (!image?.storage_path) return current;
    return {
      ...current,
      featured_image: image.storage_path,
      featured_image_preview: image.preview || image.url || image.preview_url || '',
    };
  });
  const setFeaturedMedia = item => {
    setForm(current => ({ ...current, featured_image: item.storage_path, featured_image_preview: item.preview_url }));
    setFeaturedPickerOpen(false);
  };
  const addSelectedMediaToGallery = items => {
    setForm(current => {
      const images = current.gallery_images || [];
      const paths = new Set(images.map(image => image.storage_path));
      const additions = items.filter(item => !paths.has(item.storage_path)).map((item, index) => ({
        id: item.id, storage_path: item.storage_path, alt: '', caption: '', position: images.length + index, url: item.preview_url,
      }));
      return { ...current, gallery_images: [...images, ...additions] };
    });
    setGalleryLibraryOpen(false);
  };
  const uploadNewsMedia = async (event, target) => {
    const input = event.currentTarget;
    const files = [...input.files];
    input.value = '';
    if (!files.length || newsMediaUpload || saving) return;
    setNewsMediaUpload(target);
    setNewsMediaError('');
    const failures = [];
    let cooldownMessage = '';
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (!input.isConnected) break;
        let completed = false;
        let attempts = 0;
        while (!completed && attempts < 4 && input.isConnected) {
          attempts += 1;
          try {
            const item = await uploadMediaImage(file, { context: 'news' });
            if (!input.isConnected) break;
            if (target === 'featured') setFeaturedMedia(item);
            else if (target === 'content') {
              if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{4}-[\da-f]{12}$/i.test(item?.id || '')) throw new Error('The uploaded image could not be linked to the article.');
              setForm(current => ({ ...current, content: current.content.trimEnd() + '\n<img data-news-media="' + item.id + '" alt="" />\n' }));
            } else addSelectedMediaToGallery([item]);
            completed = true;
          } catch (error) {
            if (error.code !== 'rate_limited' && error.code !== 'temporarily_blocked') {
              failures.push(file.name + ' — ' + error.message);
              completed = true;
              continue;
            }
            if (attempts >= 4) {
              failures.push(file.name + ' — ' + error.message);
              continue;
            }
            const waitSeconds = Math.min(300, Math.max(1, Number(error.retryAfter) || attempts * 2));
            cooldownMessage = `Redis upload limit reached. Retrying the remaining batch in ${waitSeconds} seconds…`;
            if (input.isConnected) setNewsMediaError(cooldownMessage);
            await new Promise(resolve => window.setTimeout(resolve, waitSeconds * 1000));
          }
        }
      }
      if (input.isConnected && (failures.length || cooldownMessage)) {
        setNewsMediaError([cooldownMessage && 'Some images could not be uploaded after automatic retries.', ...failures].filter(Boolean).join(' '));
      }
    } finally {
      setNewsMediaUpload('');
    }
  };
  const newsUploadControl = (target, label) => can('content.media.manage') && (
    <label className="media-folder-upload">
      <Plus size={16} aria-hidden="true" />{newsMediaUpload === target ? 'Uploading…' : label}
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple={target !== 'featured'}
        disabled={Boolean(newsMediaUpload) || saving} onChange={event => uploadNewsMedia(event, target)} />
    </label>
  );
  const galleryImageUrl = image => image.preview || image.url || image.preview_url || image.storage_path || '';
  const galleryImageKey = (image, index) => image.id || image.storage_path || image.url || `gallery-${index}`;
  const copyMediaUrl = async item => {
    if (!item.preview_url) {
      setNotice('This file has no usable preview URL to copy.');
      return;
    }
    try {
      await navigator.clipboard.writeText(new URL(item.preview_url, window.location.origin).href);
      setNotice('Preview URL copied.');
    } catch {
      setNotice('The preview URL could not be copied on this device.');
    }
  };
  if (authLoading) return null;
  if (!user) return <Navigate to="/auth/login" replace />;
  if (!["admin", "super_admin", "staff", "it_support", "content_manager"].includes(user.role))
    return <Navigate to="/" replace />;
  if (!requestedModuleAccess) return <main className="cms citizen-portal portal-v2 admin-portal"><ModuleNotFoundPage home={location.pathname.startsWith(`${ROUTES.admin.settings}/`) ? ROUTES.admin.setting('general') : undefined} /></main>;
  if (!routeAuthorized) return <main className="cms citizen-portal portal-v2 admin-portal"><ModuleAccessDeniedPage /></main>;
  const published = articleCounts.published;
  const navigationGroups = [
    ["Main", [["dashboard", "Dashboard"], ["news", "News & Events"], ["discover", "Discover Getafe"], ["departments", "Departments & Offices"], ["media", "Media Library"]]],
    ["E-Services", [["service-catalog", "Service Catalog"]]],
    ["Search", [["search", "Search Management"]]],
    ["Analytics", [["website-analytics", "Website Analytics"]]],
    ["Management", [["users", "Users"], ["officials", "Officials"], ["barangays", "Barangays"]]],
    ["Access & security", [["groups", "Groups"], ["permissions", "Permissions"], ["policies", "Policies"], ["audit", "Audit log"]]],
    ["Governance", [["privacy", "Privacy Requests"]]],
    ["System", [["ai", "AI Management"], ["settings", "Settings"], ["integrations", "Integrations"], ["errors", "Error Center"]]],
  ].map(([group, items]) => [group, items.filter(([key]) => hasModulePermission(resolveModule('admin', key), user))]).filter(([, items]) => items.length);

  const selectTab = (key) => {
    setProfileMenuOpen(false);
    navigate(ADMIN_MODULE_PATHS[key] || ROUTES.admin.root);
    setMobileSidebarOpen(false);
  };
  return (
    <main className={`cms citizen-portal portal-v2 admin-portal${tab === "settings" ? " cms-settings" : ""}`}>
      {mobileSidebarOpen && <button className="portal-scrim" aria-label="Close navigation" onClick={() => setMobileSidebarOpen(false)}/>}
      <aside ref={navigationRef} role={mobileSidebarOpen ? 'dialog' : undefined} aria-modal={mobileSidebarOpen || undefined} className={`citizen-sidebar ${mobileSidebarOpen ? 'open' : ''}`} aria-label="Admin navigation" id="cms-navigation">
        <div className="citizen-sidebar-brand"><img src="/assets/getafe-seal.png" alt="Municipality of Getafe seal"/><span>ADMIN PORTAL<small>Municipality of Getafe</small></span></div>
        <nav className="portal-nav">{navigationGroups.map(([group, items]) => <div key={group}><small>{group}</small>{items.map(([key, label]) => { const Icon = navigationIcons[key] || FileText; const active = activeAdminModule === key; return <NavLink to={ADMIN_MODULE_PATHS[key]} end={key === 'dashboard'} className={() => active ? 'portal-nav-item active' : 'portal-nav-item'} aria-current={active ? 'page' : undefined} onClick={() => { setProfileMenuOpen(false); setMobileSidebarOpen(false); }} key={key}><Icon size={17}/>{label}</NavLink>; })}</div>)}<div><small>Staff workspace</small><NavLink to="/app/staff/e-requests" className={({ isActive }) => isActive ? 'portal-nav-item active' : 'portal-nav-item'} onClick={() => { setProfileMenuOpen(false); setMobileSidebarOpen(false); }}><ClipboardList size={17}/>E-service requests</NavLink></div></nav>
      </aside>
      <section ref={mainRef} className="citizen-main">
        <header className="citizen-topbar"><div className="portal-breadcrumb"><button ref={navigationTriggerRef} className="citizen-menu-toggle" onClick={() => setMobileSidebarOpen(true)} aria-label="Open navigation" aria-expanded={mobileSidebarOpen} data-icon-button="ghost"><Menu size={21}/></button></div>
          <div className="citizen-top-actions">
            <div className="portal-service-search-compact admin-toolbar-search"><label htmlFor="admin-search">Search admin tools</label><div className="portal-search-input"><Search size={18} aria-hidden="true"/><input id="admin-search" type="search" placeholder="Search admin tools…" value={adminSearch} onChange={event => setAdminSearch(event.target.value)}/></div>{adminSearch.trim() && <div className="portal-popover">{navigationGroups.flatMap(([, items]) => items).filter(([, label]) => label.toLowerCase().includes(adminSearch.toLowerCase())).map(([key, label]) => <button type="button" key={key} onClick={() => { selectTab(key); setAdminSearch(''); }}>{label}</button>)}{!navigationGroups.flatMap(([, items]) => items).some(([, label]) => label.toLowerCase().includes(adminSearch.toLowerCase())) && <p>No matching tools.</p>}</div>}</div>
            <div className="portal-popover-anchor" ref={accountMenuRef} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setProfileMenuOpen(false); }}><button ref={accountButtonRef} type="button" className="citizen-profile-button" aria-label="Open account menu" aria-expanded={profileMenuOpen} aria-haspopup="menu" aria-controls={profileMenuOpen ? 'admin-account-menu' : undefined} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setProfileMenuOpen(true); requestAnimationFrame(() => accountMenuRef.current?.querySelector('[role="menuitem"]')?.focus()); } }} onClick={() => setProfileMenuOpen(value => !value)}><StableAvatar className="citizen-avatar" src={!avatarBroken ? user.avatar_url : ''} initials={avatarInitials} onFailure={() => setAvatarBroken(true)} /><b>{user.name}</b><ChevronDown size={15}/></button>{profileMenuOpen && <div id="admin-account-menu" className="portal-popover portal-profile-menu" role="menu" aria-label="Account" onKeyDown={event => { const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')]; const index = items.indexOf(document.activeElement); let next; if (event.key === 'ArrowDown') next = (index + 1) % items.length; else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = items.length - 1; if (next !== undefined) { event.preventDefault(); items[next].focus(); } }}><button role="menuitem" onClick={() => { setProfileMenuOpen(false); setAccountOpen(true); }}><UserRound size={15}/>My Account</button><button role="menuitem" onClick={() => { setProfileMenuOpen(false); selectTab('settings'); }}><SettingsIcon size={15}/>Settings</button><button role="menuitem" onClick={async () => { setProfileMenuOpen(false); const result = await logout(); if (result.ok) navigate('/auth/login', { replace: true }); else setNotice(result.error); }}><LogOut size={15}/>Sign out</button></div>}</div>
          </div>
        </header>
        <div className="cms-main citizen-content" id="admin-content">
        {accountOpen && <div className="profile-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAccountOpen(false); }}><section ref={accountDialogRef} className="profile-modal-card admin-account-modal" role="dialog" aria-modal="true" aria-labelledby="admin-account-title" aria-describedby="admin-account-description"><section className="citizen-panel portal-form">
          <header className="admin-account-header">
            <div className="profile-photo"><StableAvatar src={!avatarBroken ? user.avatar_url : ''} initials={avatarInitials} alt={`${user.name || 'Administrator'} profile`} onFailure={() => setAvatarBroken(true)} /></div>
            <div className="admin-account-header-copy">
              <h2 id="admin-account-title">Personal and contact information</h2>
              <p id="admin-account-description">Your administrator account information.</p>
              <button type="button" className="profile-photo-button" onClick={() => avatarInputRef.current?.click()} disabled={avatarBusy} aria-busy={avatarBusy}><Camera size={16}/><span>{avatarBusy ? 'Uploading…' : user.avatar_url && !avatarBroken ? 'Change photo' : 'Upload profile photo'}</span></button>
              <input ref={avatarInputRef} className="admin-account-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={avatarBusy}/>
              <small className="profile-photo-help">JPG, PNG or WebP · up to 5 MB</small>
              {avatarError && <p className="portal-error" role="alert">{avatarError}</p>}
            </div>
            <button type="button" className="profile-form-close" aria-label="Close" onClick={() => setAccountOpen(false)} data-icon-button="ghost"><X size={19} aria-hidden="true"/></button>
          </header>

          <section className="admin-account-section" aria-labelledby="admin-account-information-title">
            <h3 id="admin-account-information-title">Account information</h3>
            <dl className="admin-account-grid">
              <div><dt>Employee ID</dt><dd>{user.eid ? `EID ${user.eid}` : 'Not assigned'}</dd></div>
              <div><dt>Full name</dt><dd>{user.name || 'Not available'}</dd></div>
              <div><dt>Email address</dt><dd>{user.email || 'Not available'}<small>Used for sign-in and account notifications.</small></dd></div>
              <div className="admin-account-grid-wide"><dt>Role</dt><dd>{user.role === 'super_admin' ? 'Super administrator' : 'Administrator'}</dd></div>
            </dl>
          </section>

          <section className="admin-account-section admin-account-security" aria-labelledby="admin-account-security-title">
            <h3 id="admin-account-security-title">Security</h3>
            <div className="admin-security-row">
              <div><h4>Password</h4><p>Keep your administrator account secure by updating your password regularly.</p></div>
              <button ref={changePasswordButtonRef} type="button" className="citizen-secondary" onClick={() => setPasswordOpen(true)}>Change password</button>
            </div>
          </section>
        </section></section></div>}
        {passwordOpen && <PasswordChangeModal onClose={() => setPasswordOpen(false)} returnFocusRef={changePasswordButtonRef} />}
        {['users', 'groups', 'permissions', 'policies', 'audit', 'access'].includes(tab) && <AdminAccessManagement key={tab} currentUser={user} initialTab={tab === 'access' ? 'users' : tab}/>}
        {tab === 'errors' && <AdminErrorLogs canManage={can('system.errors.manage')} />}
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
             data-icon-button="ghost">
              ×
            </button>
          </div>
        )}
        {tab === "public-content" && <AdminPublicContent />}
        {tab === "departments" && <AdminDepartments canManageMedia={can("content.media.manage")} />}
        {tab === "service-catalog" && <AdminEservices />}
        {tab === "search" && <SearchManagement />}
        {tab === "website-analytics" && <WebsiteAnalytics />}
        {tab === "discover" && <AdminDestinations canManageMedia={can("content.media.manage")} />}
        {tab === "dashboard" && (
          <div className="cms-dashboard">
            <header className="cms-dashboard-heading">
              <div><p>{new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p><h1>Admin dashboard</h1></div>
              {hasModulePermission(resolveModule('admin','editor'), user) && <button type="button" className="citizen-primary" onClick={() => {
                skipDraftRestoreRef.current = true; formRef.current = blank; setForm(blank);
                editingRef.current = null; setEditing(null); setAutosaveState(''); selectTab('editor');
              }}><Plus size={17}/> Add content</button>}
            </header>
            <section className="cms-dashboard-stats" aria-label="Content overview">
              {[
                ['Published', Newspaper, published, 'news', 'published'],
                ['Drafts', FileText, articleCounts.draft, 'news', 'draft'],
                ['Categories', Tags, categoryLoad.loading || categoryLoad.error ? '—' : categories.length, 'categories'],
              ].filter(([, , , key]) => hasModulePermission(resolveModule('admin',key), user)).map(([label, Icon, value, key, status]) =>
                <NavLink key={label} to={ADMIN_MODULE_PATHS[key]} onClick={() => {
                  if (status) { setNewsPage(1); setNewsFilters({ status }); }
                }}><Icon size={20} aria-hidden="true"/><span>{label}</span><strong>{value}</strong><ArrowRight size={15} aria-hidden="true"/></NavLink>
              )}
            </section>
            {hasModulePermission(resolveModule('admin','news'), user) && <section className="citizen-panel admin-recent"><div className="citizen-panel-head"><h2>Recent content</h2><NavLink to={ROUTES.admin.news}>View all<ArrowRight size={14}/></NavLink></div>
            <ArticleTable
              articles={articles.slice(0, 5)}
              selected={selectedArticles}
              setSelected={setSelectedArticles}
              onBulkAction={bulkAction}
              edit={(a) => {
              setForm({
                  ...a,
                  gallery_images: a.gallery_images || [],
                  featured_image: a.featured_image_path || a.featured_image,
                  published_at: toLocalDateTimeInput(a.published_at),
                  event_start_at: toLocalDateTimeInput(a.event_start_at),
                  event_end_at: toLocalDateTimeInput(a.event_end_at),
                });
                editingRef.current = a.id;
                editingRef.current = a.id;
                setEditing(a.id);
                navigate(ROUTES.admin.editor);
              }}
              remove={removeArticle}
            />
            </section>}

            <div className="cms-dashboard-lower">
              <section className="cms-dashboard-tools"><h2>Administration</h2>
                <nav aria-label="Dashboard shortcuts">{[
                  ['Media library', Images, 'media'], ['Manage users', Users, 'access'],
                  ['Municipal officials', Users, 'officials'], ['Barangays', MapPin, 'barangays'],
                  ['Privacy requests', ShieldCheck, 'privacy'], ['Settings', SettingsIcon, 'settings'],
                ].filter(([, , key]) => hasModulePermission(resolveModule('admin',key), user)).map(([label, Icon, key]) =>
                  <NavLink key={key} to={ADMIN_MODULE_PATHS[key]}><Icon size={17}/><span>{label}</span><ArrowRight size={14}/></NavLink>
                )}</nav>
              </section>
            {canViewAccess && <section className="citizen-panel admin-activity-panel"><div className="citizen-panel-head"><h2><Clock3 size={18} aria-hidden="true"/> Recent access activity</h2><div className="admin-activity-actions"><button type="button" className="citizen-secondary" onClick={() => setAccessActivityRevision(value => value + 1)} disabled={accessActivityLoading} aria-label="Refresh recent access activity"><RefreshCw size={15} aria-hidden="true"/>Refresh</button><NavLink to={ADMIN_MODULE_PATHS.access}>View access management<ArrowRight size={14}/></NavLink></div></div>{accessActivityLoading ? <p role="status" className="admin-activity-state"><span className="page-loader-spinner" aria-hidden="true"/>Loading recent activity…</p> : accessActivityError ? <div className="admin-activity-state" role="alert"><span>{accessActivityError}</span><button type="button" onClick={() => setAccessActivityRevision(value => value + 1)}>Try again</button></div> : accessActivity.length ? <ol className="admin-activity-list">{accessActivity.slice(0, 5).map(item => <li key={item.id}><span className="admin-activity-icon"><ShieldCheck size={16} aria-hidden="true"/></span><div><strong>{accessActivityLabel(item.action)}</strong><p>{item.actor_label || 'System'} <span>·</span> {item.target_label || item.target_type || 'Access setting'}</p></div><time dateTime={item.created_at}>{accessActivityDate(item.created_at)}</time></li>)}</ol> : <p className="admin-activity-state">No access changes have been recorded yet.</p>}</section>}
            </div>
          </div>
        )}
        {tab === "news" && (
          <>
            <PageHeader title="News & events" actions={<Button onClick={() => { skipDraftRestoreRef.current = true; formRef.current = blank; setForm(blank); editingRef.current = null; setEditing(null); setAutosaveState(''); navigate(ROUTES.admin.editor); }}>Add content</Button>}/>
            {newsLoading && <p role="status">Loading news and events.</p>}
            {newsError && <div role="alert"><p>{newsError}</p><button type="button" onClick={() => setNewsReloadRevision(value => value + 1)}>Try again</button></div>}
            <ArticleTable
              articles={articles}
              filters={newsFilters}
              onFiltersChange={next => { setNewsFilters(next); setNewsPage(1); }}
              selected={selectedArticles}
              setSelected={setSelectedArticles}
              onBulkAction={bulkAction}
              edit={(a) => {
                setForm({
                  ...a,
                  gallery_images: a.gallery_images || [],
                  featured_image: a.featured_image_path || a.featured_image,
                  published_at: toLocalDateTimeInput(a.published_at),
                  event_start_at: toLocalDateTimeInput(a.event_start_at),
                  event_end_at: toLocalDateTimeInput(a.event_end_at),
                });
                setEditing(a.id);
                navigate(ROUTES.admin.editor);
              }}
              remove={removeArticle}
            />
            <nav className="cms-pagination" aria-label="News and events pages">
              <span>Showing {newsPagination.total ? (newsPagination.page - 1) * 20 + 1 : 0}–{Math.min(newsPagination.page * 20, newsPagination.total)} of {newsPagination.total}</span>
              <button type="button" disabled={newsPage <= 1} onClick={() => setNewsPage(page => Math.max(1, page - 1))}>Previous</button>
              <span>Page {newsPagination.page} of {newsPagination.pages}</span>
              <button type="button" disabled={newsPage >= newsPagination.pages} onClick={() => setNewsPage(page => page + 1)}>Next</button>
            </nav>
          </>
        )}
        {tab === "editor" && (
          <form className="cms-editor" onSubmit={saveArticle}>
            <div className="cms-title">
              <h1>{editing ? "Edit content" : "Add content"}</h1>
              {(can('ai.content.generate') || can('ai.content.translate')) && <AiContentStudio form={form} setForm={setForm} contentRef={newsContentRef} canGenerate={can('ai.content.generate')} canTranslate={can('ai.content.translate')} />}
              {autosaveState && <span className={`cms-autosave-status cms-autosave-${autosaveState}`} role="status">
                {autosaveState === 'saving' || autosaveState === 'unsaved' ? 'Saving draft…' : autosaveState === 'retrying' ? 'Not saved — retrying…' : autosaveState === 'saved' ? 'Draft saved' : autosaveState === 'recovered' ? 'Recovered local draft' : autosaveState === 'conflict' ? 'Draft changed elsewhere' : autosaveState === 'error' ? 'Not saved — edit or save again' : 'Draft needs attention'}
              </span>}
            </div>
            <fieldset className="cms-form-section">
              <legend>Basic information</legend>
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
            </fieldset>
            <fieldset className="cms-form-section">
              <legend>Article content</legend>
            <label>
              Full content
              <textarea
                className="content-box"
                ref={newsContentRef}
                required
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
              <small>
                HTML is supported (for example, &lt;p&gt;paragraph&lt;/p&gt;).
              </small>
            </label>
            <div className="cms-news-media-actions">
              {newsUploadControl('content', 'Upload images to article')}
            </div>
            {can('content.media.manage') && <small>Uploads appear at the end of the article. Add a description in each image’s alt attribute.</small>}
            </fieldset>
            <fieldset className="cms-form-section">
              <legend>Publication and schedule</legend>
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
                  value={form.category_id ?? ""}
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
            </fieldset>
            <fieldset className="cms-form-section">
              <legend>Public visibility</legend>
            <fieldset className="cms-display-options"><legend>Display on</legend><p>Choose every public location where this single content item should appear.</p><div>
              <label><input type="checkbox" checked={Boolean(form.show_in_news)} onChange={(e) => setForm({ ...form, show_in_news: e.target.checked })} /> News page</label>
              <label><input type="checkbox" checked={Boolean(form.show_in_upcoming)} onChange={(e) => { const show_in_upcoming = e.target.checked; setForm(current => show_in_upcoming && current.content_type === 'news' ? { ...current, content_type: 'event', show_in_upcoming: true, show_in_events: true } : { ...current, show_in_upcoming }) }} /> Upcoming Events &amp; Meetings</label>
              <label><input type="checkbox" checked={Boolean(form.show_in_events)} onChange={(e) => setForm({ ...form, show_in_events: e.target.checked })} /> Events page (/events)</label>
              <label><input type="checkbox" checked={Boolean(form.show_on_homepage)} onChange={(e) => setForm({ ...form, show_on_homepage: e.target.checked })} /> Homepage</label>
            </div></fieldset>
            {form.show_in_upcoming && <p className="cms-schedule-help" role="status">Upcoming content must be an Event or Meeting with a start date. Select the event type and enter “Starts at” above.</p>}
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
                  Only published articles whose publication date has arrived appear. Selecting this automatically
                  removes the status from any previous important announcement. Uncheck this option to leave none active.
                </small>
              </span>
            </label>
            </fieldset>
            <fieldset className="cms-form-section">
              <legend>Media</legend>
            <div className="cms-news-media-actions">
              <strong>Featured image</strong>
              {newsUploadControl('featured', 'Upload featured image')}
              <button type="button" disabled={Boolean(newsMediaUpload)} onClick={() => setFeaturedPickerOpen(true)}>Choose featured image</button>
            </div>
            {featuredPickerOpen && <MediaFolderPicker title="Choose featured image" onClose={() => setFeaturedPickerOpen(false)} onSelect={([item]) => setFeaturedMedia(item)} />}
            {form.featured_image && (
              <img
                key={form.featured_image_preview || form.featured_image}
                className="cms-preview"
                src={form.featured_image_preview || form.featured_image}
                alt="Selected"
                onError={(event) => { event.currentTarget.style.display = "none" }}
              />
            )}
            <div className="cms-gallery-field">
              <div className="cms-gallery-header">
                <div>
                  <h2>Gallery images</h2>
                  <p>Manage article images, captions, accessibility text, featured image, and display order.</p>
                </div>
                <div className="cms-news-media-actions">
                  {newsUploadControl('gallery', 'Upload gallery images')}
                  <button type="button" disabled={Boolean(newsMediaUpload)} onClick={() => setGalleryLibraryOpen(true)}>Select from Media Library</button>
                </div>
              </div>
              <p className="cms-gallery-storage-note">Images use the existing Media Library and storage service. Removing an image here only detaches it from this article.</p>
              {(form.gallery_images || []).length ? <div className="cms-gallery-grid" aria-label="Gallery images">
                {(form.gallery_images || []).map((image, index) => {
                  const imageKey = galleryImageKey(image, index);
                  const imageUrl = galleryImageUrl(image);
                  const isFeatured = Boolean(image.storage_path && image.storage_path === form.featured_image);
                  const isBroken = brokenGalleryImages[imageKey] || !imageUrl;
                  return <article
                    className={`cms-gallery-card${isFeatured ? ' is-featured' : ''}${draggedGalleryIndex === index ? ' is-dragging' : ''}`}
                    key={imageKey}
                    draggable
                    onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; setDraggedGalleryIndex(index); }}
                    onDragEnd={() => setDraggedGalleryIndex(null)}
                    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
                    onDrop={event => { event.preventDefault(); if (draggedGalleryIndex !== null) moveGalleryImageTo(draggedGalleryIndex, index); setDraggedGalleryIndex(null); }}
                  >
                    <div className="cms-gallery-preview-wrap">
                      <button type="button" className="cms-gallery-preview" aria-label={`View full image ${index + 1}`} onClick={() => !isBroken && setGalleryPreviewIndex(index)} disabled={isBroken}>
                        {isBroken ? <span className="cms-gallery-missing"><ImageOff size={24} aria-hidden="true" />Image unavailable</span> : <img src={imageUrl} alt={image.alt || `Gallery image ${index + 1}`} onError={() => setBrokenGalleryImages(current => ({ ...current, [imageKey]: true }))} />}
                      </button>
                      {isFeatured && <span className="cms-gallery-featured-badge">Featured</span>}
                      <span className="cms-gallery-drag-handle" aria-hidden="true" title="Drag to reorder"><GripVertical size={18} /></span>
                    </div>
                    <div className="cms-gallery-card-body">
                      <div className="cms-gallery-card-heading"><strong>Image {index + 1}</strong><span>{isFeatured ? 'Featured image' : `Position ${index + 1} of ${form.gallery_images.length}`}</span></div>
                      <label>Alt text<input value={image.alt || ''} aria-describedby={`gallery-alt-help-${index}`} onChange={event => setForm(current => ({ ...current, gallery_images: current.gallery_images.map((item, itemIndex) => itemIndex === index ? { ...item, alt: event.target.value } : item) }))} /></label>
                      <small className="cms-gallery-help" id={`gallery-alt-help-${index}`}>Describe the image for people using screen readers.</small>
                      <label>Caption (optional)<textarea value={image.caption || ''} onChange={event => setForm(current => ({ ...current, gallery_images: current.gallery_images.map((item, itemIndex) => itemIndex === index ? { ...item, caption: event.target.value } : item) }))} /></label>
                      <div className="cms-gallery-actions">
                        <button type="button" className={isFeatured ? 'is-featured-action' : ''} disabled={isFeatured || !image.storage_path} onClick={() => setFeaturedGalleryImage(index)}>{isFeatured ? <><Check size={16} aria-hidden="true" /> Featured image</> : 'Set as featured'}</button>
                        <div className="cms-gallery-menu-wrap" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setGalleryMenuOpen(null); }}>
                          <button type="button" className="cms-gallery-more" aria-label={`More actions for Image ${index + 1}`} aria-expanded={galleryMenuOpen === index} aria-haspopup="menu" onClick={() => setGalleryMenuOpen(current => current === index ? null : index)} data-icon-button="ghost"><MoreVertical size={19} aria-hidden="true" /></button>
                          {galleryMenuOpen === index && <div className="cms-gallery-action-menu" role="menu">
                            <button type="button" role="menuitem" disabled={isBroken} onClick={() => { setGalleryPreviewIndex(index); setGalleryMenuOpen(null); }}><ExternalLink size={15} aria-hidden="true" /> View full image</button>
                            <button type="button" role="menuitem" disabled={index === 0} onClick={() => { reorderGalleryImage(index, -1); setGalleryMenuOpen(null); }}><ArrowUp size={15} aria-hidden="true" /> Move up</button>
                            <button type="button" role="menuitem" disabled={index === form.gallery_images.length - 1} onClick={() => { reorderGalleryImage(index, 1); setGalleryMenuOpen(null); }}><ArrowDown size={15} aria-hidden="true" /> Move down</button>
                            <button type="button" role="menuitem" disabled={index === 0} onClick={() => { moveGalleryImageTo(index, 0); setGalleryMenuOpen(null); }}><ChevronsUp size={15} aria-hidden="true" /> Move first</button>
                            <button type="button" role="menuitem" disabled={index === form.gallery_images.length - 1} onClick={() => { moveGalleryImageTo(index, form.gallery_images.length - 1); setGalleryMenuOpen(null); }}><ChevronsDown size={15} aria-hidden="true" /> Move last</button>
                            <span className="cms-gallery-menu-divider" aria-hidden="true" />
                            <button type="button" role="menuitem" className="danger" onClick={() => { removeGalleryImage(index); setGalleryMenuOpen(null); }}>Remove from article</button>
                          </div>}
                        </div>
                      </div>
                    </div>
                  </article>;
                })}
              </div> : <div className="cms-gallery-empty"><Images size={28} aria-hidden="true" /><strong>No gallery images yet</strong><p>Upload images or choose them from the Media Library.</p></div>}
            </div>
            {newsMediaUpload && <p role="status">Uploading {({ featured: 'the featured image', gallery: 'gallery images', content: 'article images' })[newsMediaUpload]}…</p>}
            {newsMediaError && <p className="media-folder-message" role="alert">{newsMediaError}</p>}
            {galleryLibraryOpen && <MediaFolderPicker title="Select gallery images" multiple
              attached={(form.gallery_images || []).map(image => image.storage_path)}
              onClose={() => setGalleryLibraryOpen(false)} onSelect={addSelectedMediaToGallery} />}
            {galleryPreviewIndex !== null && <ImageLightbox images={(form.gallery_images || []).map((image, index) => ({ ...image, url: galleryImageUrl(image), alt: image.alt || `Gallery image ${index + 1}` }))} currentIndex={galleryPreviewIndex} articleTitle={form.title || 'Article gallery'} onClose={() => setGalleryPreviewIndex(null)} onPrevious={() => setGalleryPreviewIndex(current => (current - 1 + (form.gallery_images || []).length) % (form.gallery_images || []).length)} onNext={() => setGalleryPreviewIndex(current => (current + 1) % (form.gallery_images || []).length)} />}
            </fieldset>
            <div className="cms-editor-actions">
              {autosaveState === 'conflict' && <small className="cms-autosave-help">This draft changed in another window. Reload the News list before continuing.</small>}
              <button type="submit" disabled={saving || Boolean(newsMediaUpload)} aria-busy={saving}>
                {saving ? "Saving…" : form.status === "published" ? "Publish changes" : "Save draft"}
              </button>
            </div>
          </form>
        )}
        {tab === "categories" && (
          <Categories token={token} categories={categories} reload={load} categoryLoad={categoryLoad} />
        )}
        {tab === "media" && (
          <section aria-labelledby="media-library-title" className="media-library">
            <div className="cms-title"><h1 id="media-library-title">Media Library</h1></div>
            <MediaFolderBrowser onBrowse={setMedia} revision={mediaFolderRevision} kind="all" onDelete={(ids, trigger) => {
              mediaDeleteTriggerRef.current = trigger;
              askConfirm('Delete selected media?', 'These files will be permanently removed from media storage.', () => deleteMediaRequest(ids), { confirmLabel: 'Delete permanently' });
            }} renderActions={item => <>
              <button type="button" onClick={event => { mediaTriggerRef.current = event.currentTarget; setMediaDetails(item); }}>Details</button>
              {item.preview_url && <a href={item.preview_url} target="_blank" rel="noreferrer">Open preview</a>}
              {item.preview_url && <button type="button" onClick={() => copyMediaUrl(item)}>Copy preview URL</button>}
              <button type="button" onClick={event => {
                mediaDeleteTriggerRef.current = event.currentTarget;
                askConfirm('Delete media?', 'This file will be permanently removed from media storage.', () => deleteMediaRequest([item.id]), { confirmLabel: 'Delete permanently' });
              }}>Delete</button>
            </>} />
            {mediaDetails && <ModalDialog label="Media details" returnFocusRef={mediaTriggerRef} onClose={() => setMediaDetails(null)}>
              <section className="app-modal"><h2>{mediaDetails.original_filename}</h2>
                <p>{formatMediaType(mediaDetails.content_type)} {formatFileSize(mediaDetails.file_size)}</p>
                <p>{mediaDetails.storage_path}</p>
                {mediaDetails.preview_url && <a href={mediaDetails.preview_url} target="_blank" rel="noreferrer" download={mediaDetails.original_filename}>Download file</a>}
              </section>
            </ModalDialog>}
          </section>
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
            category={routeState?.category || 'general'}
            settings={settings}
            settingsLoading={settingsLoading}
            setSettings={setSettings}
            onSaved={setNotice}
          />
        )}
        {tab === 'integrations' && <AdminIntegrations permissions={user.permissions || []} />}
        {tab === "ai" && <AdminAiManagement canManage={can('ai.management.update')} canConfigureSecret={can('settings.secrets.edit')} />}
        {tab === "privacy" && <AdminPrivacyRequests onNotice={setNotice} />}
        {confirmDialog?.kind === 'media-references' && (
          <MediaReferencesDialog
            dialog={confirmDialog}
            onClose={() => { setConfirmBusy(false); setConfirmDialog(null); }}
            onOpenReference={(reference) => {
              setConfirmDialog(null);
              if (reference.content_type === 'news') {
                const article = articles.find(item => item.id === reference.content_id);
                if (article) {
                  skipDraftRestoreRef.current = true;
                  formRef.current = editorFormFromArticle(article);
                  setForm(formRef.current);
                  editingRef.current = article.id;
                  setEditing(article.id);
                  setAutosaveState('');
                  selectTab('editor');
                }
              } else if (reference.content_type === 'destination') {
                selectTab('discover');
              }
            }}
          />
        )}
        {confirmDialog && confirmDialog.kind !== 'media-references' && (
          <ModalDialog backdropClass="app-modal-backdrop" themeClass="cms admin-portal" labelledBy="delete-dialog-title" describedBy="delete-dialog-description" busy={confirmBusy} onClose={() => setConfirmDialog(null)}>
            <div className="app-modal">
              <h2 id="delete-dialog-title">{confirmDialog.title}</h2>
              <p id="delete-dialog-description">{confirmDialog.message}</p>
              {confirmDialog.references?.length > 0 && (
                <ul className="media-reference-list">
                  {confirmDialog.references.map((reference) => <li key={reference}>{reference}</li>)}
                </ul>
              )}
              <div className="app-modal-actions">
                <button type="button" disabled={confirmBusy} onClick={() => { setConfirmBusy(false); setConfirmDialog(null); }}>
                  Cancel
                </button>
                <button
                  className="modal-delete"
                  type="button"
                  disabled={confirmBusy}
                  onClick={async () => {
                    if (confirmBusy) return;
                    const action = confirmDialog.action;
                    setConfirmBusy(true);
                    try {
                      const result = await action();
                      if (!result?.keepOpen) setConfirmDialog(null);
                    } catch (e) {
                      setConfirmDialog(null);
                      setNotice(e.message);
                    } finally {
                      setConfirmBusy(false);
                    }
                  }}
                >
                  {confirmBusy ? "Deleting…" : (confirmDialog.confirmLabel || "Delete")}
                </button>
              </div>
            </div>
          </ModalDialog>
        )}
        </div>
      </section>
    </main>
  );
}
function MediaReferencesDialog({ dialog, onClose, onOpenReference }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const restoreFocusRef = useRef(true);
  const [expandedMedia, setExpandedMedia] = useState(() =>
    new Set((dialog.mediaItems || []).length <= 2 ? dialog.mediaItems.map(item => item.id) : dialog.mediaItems.slice(0, 1).map(item => item.id))
  );
  const protectedCount = dialog.mediaItems?.length || 0;
  const roleCount = item => item.references.reduce((total, reference) => total + Math.max(reference.roles?.length || 0, 1), 0);
  const contentTypeLabel = {
    news: 'News',
    destination: 'Discover Getafe',
    barangay: 'Barangay',
    official: 'Government officials',
    page: 'CMS page',
    other: 'Other content',
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (restoreFocusRef.current) dialog.returnFocus?.focus?.();
    };
  }, [dialog]);

  const close = () => onClose();
  const openReference = reference => {
    restoreFocusRef.current = false;
    onOpenReference(reference);
  };
  const trapFocus = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const summary = dialog.deletedCount
    ? `${dialog.selectedCount} selected · ${dialog.deletedCount} deleted · ${protectedCount} protected`
    : `${protectedCount === 1 ? '1 media item is' : `${protectedCount} media items are`} protected because ${protectedCount === 1 ? 'it is' : 'they are'} currently in use.`;

  return <div className="app-modal-backdrop media-reference-backdrop">
    <section
      ref={dialogRef}
      className="app-modal media-reference-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-reference-dialog-title"
      aria-describedby="media-reference-dialog-description"
      onKeyDown={trapFocus}
    >
      <header className="media-reference-dialog-header">
        <div>
          <h2 id="media-reference-dialog-title">{dialog.title}</h2>
          <p id="media-reference-dialog-description">{dialog.message}</p>
        </div>
        <button ref={closeButtonRef} type="button" className="media-reference-dialog-close" aria-label="Close" onClick={close} data-icon-button="ghost"><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="media-reference-dialog-body">
        <p className="media-reference-summary" role="status">{summary}</p>
        <div className="media-reference-groups">
          {dialog.mediaItems.map(item => {
            const expanded = expandedMedia.has(item.id);
            const uses = roleCount(item);
            return <section className="media-reference-group" key={item.id}>
              <button
                type="button"
                className="media-reference-group-toggle"
                aria-expanded={expanded}
                aria-controls={`media-reference-group-${item.id}`}
                onClick={() => setExpandedMedia(current => {
                  const next = new Set(current);
                  if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                  return next;
                })}
              >
                <span className="media-reference-thumbnail" aria-hidden="true">{item.previewUrl ? <img src={item.previewUrl} alt="" /> : <ImageOff size={17} />}</span>
                <span className="media-reference-group-copy"><strong title={item.filename}>{item.filename}</strong>{item.storageFilename && <small title={item.storageFilename}>{item.storageFilename}</small>}<em>Used in {uses} {uses === 1 ? 'place' : 'places'}</em></span>
                <ChevronDown className={expanded ? 'is-expanded' : ''} size={18} aria-hidden="true" />
              </button>
              {expanded && <div className="media-reference-items" id={`media-reference-group-${item.id}`}>
                {item.references.map((reference, referenceIndex) => {
                  const canOpen = ['news', 'destination'].includes(reference.content_type) && reference.content_id;
                  return <article className="media-reference-item" key={`${item.id}-${reference.content_type}-${reference.content_id || reference.title}-${referenceIndex}`}>
                    <small>{contentTypeLabel[reference.content_type] || contentTypeLabel.other}</small>
                    {canOpen
                      ? <button type="button" className="media-reference-content-link" onClick={() => openReference(reference)}>{reference.title}<ExternalLink size={14} aria-hidden="true" /></button>
                      : <strong>{reference.title}</strong>}
                    <span>{(reference.roles || ['Media reference']).join(' · ')}</span>
                  </article>;
                })}
              </div>}
            </section>;
          })}
        </div>
      </div>
      <footer className="media-reference-dialog-footer"><button type="button" onClick={close}>Close</button></footer>
    </section>
  </div>;
}

function downloadContent(articles, format, locations) {
  const records = articles.map(article => ({
    ID: article.id,
    Title: article.title || '',
    Slug: article.slug || '',
    Type: article.content_type || 'news',
    Status: article.status,
    Published: article.published_at || '',
    'Last updated': article.updated_at || '',
    'Event start': article.event_start_at || '',
    'Event end': article.event_end_at || '',
    'Display locations': locations(article),
    Important: Boolean(article.is_important),
    Excerpt: article.excerpt || '',
  }));
  let blob;
  if (format === 'json') {
    blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
  } else {
    const csvCell = value => {
      const text = String(value ?? '');
      const safe = /^\s*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    const lines = [Object.keys(records[0]), ...records.map(Object.values)];
    blob = new Blob(['\uFEFF', lines.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'getafe-selected-content.' + format;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ArticleTable({
  articles,
  edit,
  remove,
  selected,
  setSelected,
  onBulkAction,
  filters,
  onFiltersChange,
}) {
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const locations = (article) => [article.show_in_news && 'News', article.show_in_upcoming && 'Upcoming', article.show_in_events && 'Events', article.show_on_homepage && 'Homepage'].filter(Boolean).join(', ') || 'Hidden';
  const updateFilter = (key, value) => {
    const setter = onFiltersChange || (() => {});
    setter({ ...(filters || {}), [key]: value });
  };
  const displayDate = (value) => value ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
  const filteredArticles = articles.filter((article) => {
    const schedule = article.event_start_at ? new Date(article.event_end_at || article.event_start_at) : null;
    if (typeFilter && article.content_type !== typeFilter) return false;
    if (statusFilter && article.status !== statusFilter) return false;
    if (timeFilter === 'upcoming' && (!schedule || schedule < new Date())) return false;
    if (timeFilter === 'past' && (!schedule || schedule >= new Date())) return false;
    const locationField = { news: 'show_in_news', upcoming: 'show_in_upcoming', events: 'show_in_events', homepage: 'show_on_homepage' }[locationFilter] || locationFilter;
    if (locationFilter && !article[locationField]) return false;
    if (dateFilter && String(article.published_at || '').slice(0, 10) !== dateFilter) return false;
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
  const selectedRows = filteredArticles.filter(article => selected.includes(article.id));
  const selectedIds = selectedRows.map(article => article.id);
  const [exportFormat, setExportFormat] = useState('csv');
  const toggleAll = () => setSelected(allSelected ? [] : visibleIds);
  const changeSelection = (choice) => {
    if (choice === 'invert') setSelected(visibleIds.filter(id => !selected.includes(id)));
    else if (choice === 'all') setSelected(visibleIds);
    else setSelected(filteredArticles.filter(article => article.status === choice).map(article => article.id));
  };
  return (
    <div className="cms-table cms-content-table" role="region" aria-label="News and events list" tabIndex={0}>
      <div className="cms-content-filters" aria-label="Filter content"><select aria-label="Filter by content type" value={filters?.type ?? typeFilter} onChange={(e) => { setTypeFilter(e.target.value); updateFilter('type', e.target.value); }}><option value="">All types</option><option value="news">News</option><option value="event">Events</option><option value="meeting">Meetings</option></select><select aria-label="Filter by status" value={filters?.status ?? statusFilter} onChange={(e) => { setStatusFilter(e.target.value); updateFilter('status', e.target.value); }}><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option></select><select aria-label="Filter by schedule" value={filters?.temporal ?? timeFilter} onChange={(e) => { setTimeFilter(e.target.value); updateFilter('temporal', e.target.value); }}><option value="">Any date</option><option value="upcoming">Upcoming</option><option value="past">Past</option></select><select aria-label="Filter by display location" value={filters?.display ?? locationFilter} onChange={(e) => { setLocationFilter(e.target.value); updateFilter('display', e.target.value); }}><option value="">All locations</option><option value="news">News page</option><option value="upcoming">Upcoming</option><option value="events">Events page</option><option value="homepage">Homepage</option></select><input aria-label="Filter by published date" type="date" value={filters?.day ?? dateFilter} onChange={(e) => { setDateFilter(e.target.value); updateFilter('day', e.target.value); }} /></div>
      {selectedRows.length > 0 && <div className="bulk-toolbar visible content-bulk-toolbar" role="group" aria-label="Selected content actions">
        <strong role="status">{selectedRows.length} of {visibleIds.length} shown selected</strong>
        <div className="content-bulk-actions">
          <select aria-label="Export format" value={exportFormat} onChange={event => setExportFormat(event.target.value)}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
          <button onClick={() => downloadContent(selectedRows, exportFormat, locations)}><Download size={16} aria-hidden="true" /> Export selected</button>
          <button className="bulk-primary" onClick={() => onBulkAction('published', selectedIds)}>Publish</button>
          <button className="bulk-secondary" onClick={() => onBulkAction('draft', selectedIds)}>Move to draft</button>
          <button className="danger" onClick={() => onBulkAction('delete', selectedIds)}>Delete</button>
        </div>
      </div>}
      <div role="table" aria-label="News and events"><div className="cms-table-head" role="row">
        <span role="columnheader">
          <input
            type="checkbox"
            aria-label="Select all shown articles"
            ref={node => { if (node) node.indeterminate = selectedRows.length > 0 && !allSelected; }}
            checked={allSelected}
            onChange={toggleAll}
          />
        </span>
        <span role="columnheader">Title</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Published</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Display locations</span>
        <span role="columnheader">Last updated</span>
        <span role="columnheader">Actions</span>
      </div>
      {!filteredArticles.length && <EmptyState title={articles.length ? "No content matches these filters" : "No content published yet"} description={articles.length ? "Adjust the filters to see other content." : "Use Add content to create news, an event or a meeting."}/>}
      {filteredArticles.map((a) => (
        <div className="cms-table-row" role="row" key={a.id}>
          <span role="cell">
            <input
              type="checkbox"
              aria-label={`Select ${a.title}`}
              checked={selected.includes(a.id)}
              onChange={() => toggle(a.id)}
            />
          </span>
          <strong role="cell">{a.title || 'Untitled draft'}{a.is_important && <span className="cms-important-badge">Important</span>}</strong>
          <span role="cell" className="content-type" data-label="Type">{a.content_type || 'news'}</span>
          <span role="cell" data-label="Published">{displayDate(a.published_at)}</span>
          <span role="cell" data-label="Status" className={`status ${a.status}`}>{a.status}</span>
          <span role="cell" data-label="Display locations" className="content-locations">{locations(a)}</span>
          <span role="cell" data-label="Last updated">{displayDate(a.updated_at)}</span>
          <span role="cell" className="row-actions">
            <button className="row-action-edit" type="button" aria-label={`Edit ${a.title || 'Untitled draft'}`} onClick={() => edit(a)}>Edit</button>
            <button className="row-action-delete" type="button" aria-label={`Delete ${a.title || 'Untitled draft'}`} onClick={() => remove(a.id)}>Delete</button>
          </span>
        </div>
      ))}</div>
    </div>
  );
}
function BarangaysEditor({ token, value, onSaved }) {
  const [form, setForm] = useState(value || []);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  const [researchDataText, setResearchDataText] = useState('')
  const [externalImages, setExternalImages] = useState([])
  const saveRef = useRef(false);
  const selectedOriginal = useRef(null);
  useEffect(() => {
    if (Array.isArray(value)) setForm(value);
  }, [value]);
  const openEditor = (index) => {
    selectedOriginal.current = form[index];
    const researchData = form[index]?.researchData || {}
    setResearchDataText(JSON.stringify(researchData, null, 2));
    setExternalImages(Array.isArray(researchData.images) ? researchData.images : [])
    setError("");
    setSelectedIndex(index);
  };
  const cancelEditor = () => {
    const original = selectedOriginal.current;
    if (selectedIndex !== null && original) {
      setForm((current) =>
        current.map((item, index) =>
          index === selectedIndex ? original : item,
        ),
      );
    }
    selectedOriginal.current = null;
    setSelectedIndex(null);
    setError("");
  };
  const saveEditorChanges = (event) => {
    if (!event.currentTarget.form?.reportValidity()) return;
    if (selectedIndex !== null) {
      try {
        const parsed = researchDataText.trim() ? JSON.parse(researchDataText) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        const images = externalImages.filter(image => String(image.url || '').trim())
        if (images.some(image => !String(image.alt || '').trim() || !String(image.sourceLabel || '').trim() || !String(image.sourceUrl || '').trim())) {
          setError('Each photo needs alt text, a source name, and a source page URL.');
          return;
        }
        parsed.images = images
        setForm(current => current.map((item, index) => index === selectedIndex ? { ...item, researchData: parsed } : item));
      } catch {
        setError('Sourced profile data must be valid JSON with an object at the top level.');
        return;
      }
    }
    selectedOriginal.current = null;
    setSelectedIndex(null);
    setError("");
  };
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
      const checksumSha256 = await checksumFile(file);
      const response = await apiFetch("/api/storage/upload-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
          checksumSha256,
          context: "media",
        }),
      });
      const uploadData = await response.json();
      if (!response.ok)
        throw new Error(uploadData?.error || "Could not prepare image upload.");
      if (uploadData.reused && uploadData.media) {
        update(selectedIndex, "cover_image", uploadData.media.storage_path || "");
        update(selectedIndex, "cover_image_path", uploadData.media.storage_path || "");
        update(selectedIndex, "cover_image_preview", uploadData.media.preview_url || "");
        return;
      }
      await putFile(uploadData.uploadUrl, file, () => {}).promise;
      const complete = await apiFetch("/api/media/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: uploadData.storagePath,
          originalFilename: file.name,
          contentType: file.type,
          fileSize: file.size,
          checksumSha256,
          name: file.name,
        }),
      });
      const uploaded = await complete.json();
      if (!complete.ok)
        throw new Error(uploaded?.error || "Could not finish image upload.");
      update(
        selectedIndex,
        "cover_image",
        uploaded.storage_path || "",
      );
      update(selectedIndex, "cover_image_path", uploaded.storage_path || "");
      update(selectedIndex, "cover_image_preview", uploaded.preview_url || "");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };
  const save = async (event) => {
    event.preventDefault();
    if (saveRef.current || uploading) return;
    const ownerForm = event.currentTarget.form || event.currentTarget;
    if (!ownerForm.reportValidity()) return;
    saveRef.current = true; setSaving(true); setSaved(false);
    try {
      const payload = form.map((item) => ({
        ...item,
        cover_image: item.cover_image ? (item.cover_image_path || item.cover_image) : "",
      }));
      const result = await api("/api/barangays", token, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      onSaved(result);
      setError(""); setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally { saveRef.current = false; setSaving(false); }
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
          value={fields.more_information || ""}
          onChange={(e) => update(selectedIndex, "more_information", e.target.value)}
          placeholder="Add headings, history, demographics, location, and other public information. HTML is supported."
        />
        <small>
          This content appears on the barangay's dedicated public profile page.
        </small>
      </label>
      <label className="barangay-details-field">
        Sourced profile data (JSON)
        <textarea
          rows="12"
          value={researchDataText}
          onChange={(e) => setResearchDataText(e.target.value)}
          spellCheck="false"
          placeholder={'{\n  "population2024": 0,\n  "classification": "Rural",\n  "psgc": "",\n  "coordinateSource": "PSA",\n  "sources": [{ "label": "PSA population release", "url": "https://psa.gov.ph/..." }],\n  "images": [{ "url": "https://example.org/barangay-photo.jpg", "alt": "Description of the photo", "caption": "Photo caption", "sourceLabel": "Photo source", "sourceUrl": "https://example.org/source-page" }],\n  "philAtlas": { "coordinates": { "lat": 0, "lng": 0 }, "elevationMeters": 0, "populationHistory": [], "ageGroups2015": [], "adjacentBarangays": [] }\n}'}
        />
        <small>Stored with this barangay record and returned through the public barangay API. Add externally hosted image links with alt text and photo credits in the images array.</small>
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
        <button disabled={saving || uploading}>{saving ? "Saving…" : "Save barangays"}</button>
      </div>
      <div className="barangay-directory-tools">
        <label className="barangay-search-label">Search barangays…<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search barangays…" /></label>
        <span className="barangay-count">{form.length} {form.length === 1 ? "barangay" : "barangays"}</span>
      </div>
      {form.filter(item => item.name?.toLowerCase().includes(search.trim().toLowerCase())).length ? <div className="barangay-selector">
        {form.map((item, index) => ({ item, index })).filter(({item}) => item.name?.toLowerCase().includes(search.trim().toLowerCase())).map(({item,index}) => (
          <button
            type="button"
            key={item.id || index}
            onClick={() => openEditor(index)}
            aria-label={`Edit ${item.name}${item.captain ? `, Punong Barangay ${item.captain}` : ', no captain assigned'}`}
          >
            <span className="barangay-selector-name">{item.name}</span>
            <small className="barangay-selector-captain">{item.captain || "No captain assigned"}</small>
            <b>›</b>
          </button>
        ))}
      </div> : <p className="barangay-empty-state" role="status">No barangays match “{search}”.</p>}
      {error && <p className="cms-notice" role="alert">{error}</p>}{saved && <p role="status">Changes saved.</p>}
      {selectedIndex !== null && (
        <ModalDialog portal={false} backdropClass="app-modal-backdrop" labelledBy="barangay-editor-title" busy={uploading || saving} onClose={cancelEditor}>
          <div className="app-modal barangay-edit-modal">
            <div className="barangay-modal-heading">
              <div>
                <p className="news-category">EDIT BARANGAY</p>
                <h2 id="barangay-editor-title">{fields.name}</h2>
              </div>
              <button
                type="button"
                onClick={cancelEditor}
                disabled={saving || uploading}
                aria-label="Close"
               data-icon-button="ghost">
                ×
              </button>
            </div>
            <div className="barangay-image-field">
              Barangay Cover Image
              <small>
                {uploading
                  ? "Uploading image…"
                  : "JPG, PNG, or WEBP up to 5 MB. This image appears at the top of the public barangay page."}
              </small>
              {fields.cover_image_preview || fields.cover_image ? (
                <img
                  className="barangay-image-preview"
                  src={fields.cover_image_preview || fields.cover_image}
                  alt={fields.cover_image_alt || `${fields.name} cover preview`}
                />
              ) : null}
              <div className="barangay-image-actions">
                <label className="button-like">{fields.cover_image ? "Replace" : "Upload / Select Image"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadHeroImage} disabled={uploading} /></label>
                {fields.cover_image && <button type="button" onClick={() => { update(selectedIndex, "cover_image", ""); update(selectedIndex, "cover_image_path", ""); update(selectedIndex, "cover_image_preview", ""); update(selectedIndex, "cover_image_alt", ""); }}>Remove</button>}
              </div>
              <label>
                Alt text
                <input value={fields.cover_image_alt || ""} onChange={(event) => update(selectedIndex, "cover_image_alt", event.target.value)} placeholder={`Cover image of Barangay ${fields.name || ""}`} maxLength={255} />
              </label>
            </div>
            <section className="barangay-external-gallery-editor" aria-label="External barangay photo gallery">
              <div><strong>Overview photo slides</strong><small>Add externally hosted photos. Each photo and its credit are saved with this barangay record.</small></div>
              {(externalImages || []).map((image, imageIndex) => <fieldset key={`external-image-${imageIndex}`}><legend>Photo {imageIndex + 1}</legend><label>Image URL<input type="url" value={image.url || ''} onChange={event => setExternalImages(current => current.map((item, index) => index === imageIndex ? { ...item, url: event.target.value } : item))} placeholder="https://example.org/photo.jpg" /></label><label>Alt text<input value={image.alt || ''} maxLength={255} onChange={event => setExternalImages(current => current.map((item, index) => index === imageIndex ? { ...item, alt: event.target.value } : item))} placeholder="Describe the photo" /></label><label>Photo credit<input value={image.sourceLabel || ''} maxLength={160} onChange={event => setExternalImages(current => current.map((item, index) => index === imageIndex ? { ...item, sourceLabel: event.target.value } : item))} placeholder="Photographer or website" /></label><label>Credit/source page URL<input type="url" value={image.sourceUrl || ''} onChange={event => setExternalImages(current => current.map((item, index) => index === imageIndex ? { ...item, sourceUrl: event.target.value } : item))} placeholder="https://example.org/photo-page" /></label><label>Caption (optional)<input value={image.caption || ''} maxLength={500} onChange={event => setExternalImages(current => current.map((item, index) => index === imageIndex ? { ...item, caption: event.target.value } : item))} placeholder="Short photo caption" /></label><button type="button" onClick={() => setExternalImages(current => current.filter((_, index) => index !== imageIndex))}>Remove photo</button></fieldset>)}
              <button type="button" onClick={() => setExternalImages(current => [...current, { url: '', alt: '', caption: '', sourceLabel: '', sourceUrl: '' }])}>Add photo slide</button>
            </section>
            {editFields}
            <p className="cms-muted">Apply these edits, then choose Save barangays to publish them.</p>
            <div className="app-modal-actions">
              <button type="button" disabled={saving || uploading} onClick={cancelEditor}>
                Cancel
              </button>
              <button type="button" disabled={uploading} onClick={saveEditorChanges}>
                Apply changes
              </button>
            </div>
          </div>
        </ModalDialog>
      )}
    </form>
  );
}

function OfficialsSelectorEditor({ token, value, onSaved }) {
  const fallback = {
    mayor: { name: "", role: "Municipal Mayor" },
    viceMayor: { name: "", role: "Municipal Vice-Mayor" },
    sbMembers: [],
    abcPresident: { name: "", role: "ABC President" },
    punongBarangays: [],
    deptHeads: [],
  };
  const directoryItems = Array.isArray(value?.directory?.items) ? value.directory.items : [];
  const directoryPeople = (predicate) => directoryItems.filter(predicate).map(item => ({
    name: item.name,
    role: item.role || item.position?.name || '',
    biography: item.biography || '',
    photo: item.photo || '',
    assignment_id: item.id,
    person_id: item.person_id,
    official_slug: item.slug,
    position_slug: item.position?.slug,
    jurisdiction_id: item.jurisdiction?.id || null,
    termStart: item.term?.start || '',
    termEnd: item.term?.end || '',
    serviceStart: item.term?.service?.start || '',
    serviceEnd: item.term?.service?.end || '',
    assumptionType: item.term?.assumption_type || 'unknown',
    electionYear: item.election?.year || null,
    verificationStatus: item.verification?.status || 'unlinked',
    election: item.election || null,
  }));
  const buildForm = source => {

    const fromDirectory = predicate => directoryPeople(predicate);
    return {
      ...fallback,
      ...(source || {}),
      sbMembers: Array.isArray(source?.sbMembers) && source.sbMembers.length
        ? source.sbMembers
        : fromDirectory(item => item.jurisdiction?.type === 'municipal' && item.position?.slug === 'sangguniang-bayan-member'),
      punongBarangays: Array.isArray(source?.punongBarangays) && source.punongBarangays.length
        ? source.punongBarangays
        : fromDirectory(item => item.jurisdiction?.type === 'barangay' && item.position?.slug === 'punong-barangay'),
      deptHeads: Array.isArray(source?.deptHeads) && source.deptHeads.length ? source.deptHeads : fallback.deptHeads,
    };
  };
  const [form, setForm] = useState(() => ({
    ...fallback,
    ...(value || {}),
    ...buildForm(value),
  }));
  useEffect(() => {
    if (value) setForm(buildForm(value));
  }, [value]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  const saveRef = useRef(false);
  const [quality, setQuality] = useState(null);
  const [matches, setMatches] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState("");
  const [matchBusy, setMatchBusy] = useState(false);
  const [matchMessage, setMatchMessage] = useState("");
  const [historyStart, setHistoryStart] = useState("");
  const [historyEnd, setHistoryEnd] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api('/api/admin/officials/data-quality', token).then(result => { if (active) setQuality(result); }).catch(() => { if (active) setQuality(null); });
    return () => { active = false; };
  }, [token]);
  const roleOptions = [...new Set(directoryItems.map(item => item.role || item.position?.name).filter(Boolean))];
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
      const checksumSha256 = await checksumFile(file);
      const response = await apiFetch("/api/storage/upload-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
          checksumSha256,
          context: "media",
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Could not prepare image upload.");
      if (data.reused && data.media) {
        update("photo", data.media.storage_path || data.media.preview_url);
        return;
      }
      await putFile(data.uploadUrl, file, () => {}).promise;
      const complete = await apiFetch("/api/media/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: data.storagePath,
          originalFilename: file.name,
          contentType: file.type,
          fileSize: file.size,
          checksumSha256,
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
    if (saveRef.current || uploading) return;
    const ownerForm = event.currentTarget.form || event.currentTarget;
    if (!ownerForm.reportValidity()) return;
    saveRef.current = true; setSaving(true); setSaved(false);
    try {
      const result = await api("/api/officials", token, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      onSaved(result);
      setError(""); setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally { saveRef.current = false; setSaving(false); }
  };
  const findElectionRecord = async () => {
    if (!current?.person) return;
    if (!current.person.electionYear) return setMatchMessage('Enter the election year before searching.');
    try {
      setMatchBusy(true); setMatchMessage(''); setSelectedMatch('');
      let person = current.person;
      if (!person.assignment_id) {
        setMatchMessage('Saving term details…');
        const saved = await api('/api/officials', token, { method: 'PUT', body: JSON.stringify(form) });
        setForm(saved);
        onSaved(saved);
        person = current.index === null ? saved[current.key] : saved[current.key]?.[current.index];
        if (!person?.assignment_id) throw new Error('The official could not be saved. Please try again.');
      }
      const result = await api(`/api/admin/official-assignments/${encodeURIComponent(person.assignment_id)}/matches?year=${encodeURIComponent(person.electionYear)}`, token);
      const clearWinnerMatches = (result.matches || []).filter(item => item.won && ['exact', 'strong'].includes(item.local_match_confidence));
      if (clearWinnerMatches.length === 1) {
        const winner = clearWinnerMatches[0];
        await api(`/api/admin/official-assignments/${encodeURIComponent(person.assignment_id)}/connect`, token, {
          method: 'POST',
          body: JSON.stringify({ person_id: winner.person_id, contest_id: winner.contest.id, year: winner.contest.year }),
        });
        update('verificationStatus', 'verified');
        update('election', { year: winner.contest.year, result: 'winner', party: winner.party, votes: winner.votes });
        setMatches(null);
        setMatchMessage('BetterGov election record automatically connected and verified.');
        api('/api/admin/officials/data-quality', token).then(setQuality).catch(() => {});
        return;
      }
      setMatches(result);
      setMatchMessage('');
      if (!result.matches?.length) setMatchMessage('No Getafe, Bohol candidates were found for this contest.');
    } catch (matchError) { setMatchMessage(matchError.message); }
    finally { setMatchBusy(false); }
  };
  const connectSelectedRecord = async () => {
    const record = matches?.matches?.find(item => `${item.person_id}:${item.contest.id}` === selectedMatch);
    if (!record || !current?.person?.assignment_id) return;
    try {
      setMatchBusy(true); setMatchMessage('');
      await api(`/api/admin/official-assignments/${encodeURIComponent(current.person.assignment_id)}/connect`, token, { method: 'POST', body: JSON.stringify({ person_id: record.person_id, contest_id: record.contest.id, year: record.contest.year }) });
      update('verificationStatus', 'verified');
      update('election', { year: record.contest.year, result: 'winner', party: record.party, votes: record.votes });
      setMatchMessage('BetterGov election record connected and verified.');
      setMatches(null);
      api('/api/admin/officials/data-quality', token).then(setQuality).catch(() => {});
    } catch (matchError) { setMatchMessage(matchError.message); }
    finally { setMatchBusy(false); }
  };
  const rejectSelectedRecord = async () => {
    const record = matches?.matches?.find(item => `${item.person_id}:${item.contest.id}` === selectedMatch);
    if (!record || !current?.person?.assignment_id) return;
    try {
      setMatchBusy(true); setMatchMessage('');
      await api(`/api/admin/official-assignments/${encodeURIComponent(current.person.assignment_id)}/reject`, token, { method: 'POST', body: JSON.stringify({ person_id: record.person_id, contest_id: record.contest.id, year: record.contest.year }) });
      update('verificationStatus', 'rejected');
      setMatchMessage('The possible match was rejected. No election data was published.');
      setMatches(null);
    } catch (matchError) { setMatchMessage(matchError.message); }
    finally { setMatchBusy(false); }
  };
  const refreshElectionRecord = async () => {
    if (!current?.person?.assignment_id) return;
    try {
      setMatchBusy(true); setMatchMessage('');
      const result = await api(`/api/admin/official-assignments/${encodeURIComponent(current.person.assignment_id)}/refresh`, token, { method: 'POST', body: '{}' });
      setMatchMessage(result.review_required ? 'Election data changed and has been flagged for review. The verified record was not replaced.' : 'Election data refreshed.');
    } catch (matchError) { setMatchMessage(matchError.message); }
    finally { setMatchBusy(false); }
  };
  const disconnectElectionRecord = async () => {
    if (!current?.person?.assignment_id) return;
    try {
      setMatchBusy(true); setMatchMessage('');
      await api(`/api/admin/official-assignments/${encodeURIComponent(current.person.assignment_id)}/disconnect`, token, { method: 'POST', body: '{}' });
      update('verificationStatus', 'unlinked'); update('election', null);
      setMatchMessage('BetterGov election record disconnected. Local profile and term details were kept.');
      api('/api/admin/officials/data-quality', token).then(setQuality).catch(() => {});
    } catch (matchError) { setMatchMessage(matchError.message); }
    finally { setMatchBusy(false); }
  };
  const createHistoricalTerm = async () => {
    if (!current?.person?.person_id || !current.person.position_slug) return setMatchMessage('Save this official first, then add a verified historical assignment.');
    try {
      setHistoryBusy(true); setMatchMessage('');
      await api('/api/admin/official-assignments', token, { method: 'POST', body: JSON.stringify({ personId: current.person.person_id, positionSlug: current.person.position_slug, jurisdictionType: current.person.position_slug === 'punong-barangay' ? 'barangay' : 'municipal', jurisdictionId: current.person.jurisdiction_id, termStart: historyStart, termEnd: historyEnd, assumptionType: current.person.assumptionType || 'unknown' }) });
      setHistoryStart(''); setHistoryEnd(''); setMatchMessage('Historical assignment created and retained in the public record.');
      api('/api/admin/officials/data-quality', token).then(setQuality).catch(() => {});
    } catch (historyError) { setMatchMessage(historyError.message); }
    finally { setHistoryBusy(false); }
  };
  return (
    <form className="cms-editor officials-editor" onSubmit={save}>
      <div className="cms-title">
        <div>
          <h1>Municipal Officials</h1>
          <p>Manage public profiles, verified terms of office, and reviewed election records.</p>
        </div>
      </div>
      {quality?.available && <section className="official-data-quality" aria-label="Officials data quality"><div><strong>{quality.municipal_officials}</strong><span>Municipal officials</span></div><div><strong>{quality.current}</strong><span>Current</span></div><div><strong>{quality.missing_term_dates}</strong><span>Missing term dates</span></div><div><strong>{quality.bettergov_connected}</strong><span>BetterGov connected</span></div><div><strong>{quality.unverified_matches + quality.review_required}</strong><span>Needs review</span></div><div><strong>{quality.historical_records}</strong><span>Historical records</span></div></section>}
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
      {error && <p className="cms-notice" role="alert">{error}</p>}{saved && <p role="status">Changes saved.</p>}
      {current && (
        <ModalDialog portal={false} backdropClass="app-modal-backdrop" labelledBy="official-editor-title" busy={saving || uploading || matchBusy || historyBusy} onClose={() => setSelected(null)}>
          <div className="app-modal official-edit-modal">
            <div className="barangay-modal-heading">
              <div>
                <p className="news-category">EDIT OFFICIAL</p>
                <h2 id="official-editor-title">{current.person.name || "Unnamed official"}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                disabled={saving || uploading || matchBusy || historyBusy}
                aria-label="Close editor"
               data-icon-button="ghost">
                <X size={20} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}{saved && <Alert tone="success">Changes saved.</Alert>}<div className="official-modal-fields">
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
              <fieldset className="official-term-fields">
                <legend>Term of office</legend>
                <div className="official-form-row"><label>Term start<input type="date" value={current.person.termStart || ''} onChange={e => update('termStart', e.target.value)} /></label><label>Term end<input type="date" value={current.person.termEnd || ''} onChange={e => update('termEnd', e.target.value)} /></label></div>
                <div className="official-form-row"><label>Actual service start <small>Only if different from the term</small><input type="date" value={current.person.serviceStart || ''} onChange={e => update('serviceStart', e.target.value)} /></label><label>Actual service end <small>Leave blank while serving</small><input type="date" value={current.person.serviceEnd || ''} onChange={e => update('serviceEnd', e.target.value)} /></label></div>
                <label>Assumed office through<select value={current.person.assumptionType || 'unknown'} onChange={e => update('assumptionType', e.target.value)}><option value="unknown">Not specified</option><option value="elected">Elected</option><option value="appointed">Appointed</option><option value="succession">Succession</option><option value="acting">Acting</option><option value="ex_officio">Ex officio</option></select></label>
              </fieldset>
              <fieldset className="official-term-fields">
                <legend>Election data</legend>
                <div className="official-form-row"><label>Election year<input type="number" min="1900" max="2200" value={current.person.electionYear || ''} onChange={e => update('electionYear', e.target.value === '' ? null : Number(e.target.value))} /></label><label>Election type<input value={current.person.electionType || ''} onChange={e => update('electionType', e.target.value)} placeholder="Regular local election" /></label></div>
                {current.person.election?.result === 'winner' ? <p className="official-link-status">BetterGov ✓ Connected · administrator verified</p> : <p className="official-link-status">No BetterGov record connected.</p>}
                <div className="official-election-actions"><button type="button" onClick={findElectionRecord} disabled={matchBusy}>{matchBusy ? 'Working…' : 'Find election record'}</button>{current.person.election?.result === 'winner' && <><button type="button" onClick={refreshElectionRecord} disabled={matchBusy}>Refresh data</button><button type="button" onClick={disconnectElectionRecord} disabled={matchBusy}>Disconnect</button></>}</div>
                {matches?.matches?.length > 0 && <div className="official-match-list"><strong>Possible matches</strong>{matches.matches.map(record => <label key={`${record.person_id}:${record.contest.id}`} className={record.won ? '' : 'not-winner'}><input type="radio" name="bettergov-match" value={`${record.person_id}:${record.contest.id}`} checked={selectedMatch === `${record.person_id}:${record.contest.id}`} onChange={e => setSelectedMatch(e.target.value)} /><span><b>{record.display_name}</b><small>{record.contest.position} · {record.contest.city}, {record.contest.province} · {record.contest.year} · {record.won ? 'Winner' : 'Did not win — cannot connect'}</small></span></label>)}<div className="official-election-actions"><button type="button" onClick={connectSelectedRecord} disabled={!selectedMatch || !matches.matches.find(item => `${item.person_id}:${item.contest.id}` === selectedMatch)?.won || matchBusy}>Connect selected winner</button><button type="button" onClick={rejectSelectedRecord} disabled={!selectedMatch || matchBusy}>Reject selected match</button></div></div>}
                {matchMessage && <p className="cms-notice">{matchMessage}</p>}
              </fieldset>
              <fieldset className="official-term-fields">
                <legend>Add a previous term</legend>
                <p className="official-link-status">Create a completed, verified historical assignment for this same person. It does not replace the current profile.</p>
                <div className="official-form-row"><label>Term start<input type="date" value={historyStart} onChange={event => setHistoryStart(event.target.value)} /></label><label>Term end<input type="date" value={historyEnd} onChange={event => setHistoryEnd(event.target.value)} /></label></div>
                <button type="button" onClick={createHistoricalTerm} disabled={historyBusy || !historyStart || !historyEnd}>{historyBusy ? 'Creating…' : 'Add previous term'}</button>
              </fieldset>
            </div>
            <div className="app-modal-actions">
              <button type="button" disabled={saving || uploading || matchBusy || historyBusy} onClick={save}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </ModalDialog>
      )}
    </form>
  );
}

function Categories({ token, categories, reload, categoryLoad }) {
  const [name, setName] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState(null);
  const inFlight = useRef(false);
  const add = async event => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try { await api('/api/categories', token, { method: 'POST', body: JSON.stringify({ name }) }); setName(''); reload(); setNotice('Category added.'); }
    catch (error) { setError(error.message); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (inFlight.current || !selected) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try { await api(`/api/categories/${selected.id}`, token, { method: 'DELETE' }); reload(); setSelected(null); setNotice('Category deleted.'); }
    catch (error) { setError(error.message); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <>
    <PageHeader title="Categories"/>
    {categoryLoad.loading && <p role="status">Loading categories…</p>}
    {categoryLoad.error && <div className="ui-page-actions">
      <p role="alert">{categoryLoad.error}{categories.length > 0 ? ' Showing the last loaded list.' : ''}</p>
      <Button variant="outline" onClick={() => reload()}>Retry categories</Button>
    </div>}
    {error && !selected && <ErrorState message={error}/>}{notice && <Alert tone="success">{notice}</Alert>}
    <form className="category-form" onSubmit={add}><Field label="Category name" required><input value={name} onChange={event => setName(event.target.value)} maxLength={255}/></Field><Button type="submit" busy={busy}>{busy ? 'Adding…' : 'Add category'}</Button></form>
    <div className="category-list">{categories.map(category => <div key={category.id}><span>{category.name}</span><Button variant="ghost" disabled={busy} onClick={() => { setError(''); setSelected(category) }}>Delete</Button></div>)}</div>
    {selected && <ModalDialog size="small" label="Delete category" busy={busy} onClose={() => { setError(''); setSelected(null) }}><section className="portal-action-modal"><h2>Delete category</h2><p>Delete “{selected.name}”? This action cannot be undone.</p>{error && <ErrorState message={error}/>}<div className="ui-page-actions"><Button variant="outline" disabled={busy} onClick={() => { setError(''); setSelected(null) }}>Cancel</Button><Button variant="danger" busy={busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete category'}</Button></div></section></ModalDialog>}
  </>;
}
