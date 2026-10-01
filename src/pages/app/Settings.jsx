import { createPortal } from "react-dom";
import { Component, forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Bell, ChevronRight, CircleHelp, Download, ExternalLink, Globe2, LockKeyhole, Palette, ShieldCheck, Smartphone, UserRound, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useCitizen } from "../../context/CitizenContext";
import { citizenApi, dateLabel, notificationPreferencesApi, notificationPreferencesError } from "../../services/citizenData";
import { Link, Navigate } from "react-router-dom";
import { ROUTES } from "../../routeRegistry";

import { useResidentPreferences } from "../../context/ResidentPreferencesContext";
import { formatResidentDateTime } from "../../services/residentPreferences";
import {
  DEFAULT_SETTINGS_CATEGORY,
  getSettingsCategory,
  normalizeSettingsCategory,
  SETTINGS_CATEGORIES,
} from "./settingsNavigation";

const scopes = [
  ["account_data", "Delete eligible personal/account data"],
  ["uploaded_files", "Delete uploaded files no longer subject to retention"],
  ["close_account", "Close or deactivate my citizen account"],
  ["all_eligible", "Request deletion of all eligible data"],
];
const scopeLabel = (value) =>
  scopes.find(([key]) => key === value)?.[1] || value;
const sessionDateLabel = (value, fallback = "Recently") => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : formatResidentDateTime(date, {
    date: {},
    time: { hour: "numeric", minute: "2-digit" },
  });
};

const SETTINGS_CATEGORY_ICONS = {
  account: UserRound,
  security: ShieldCheck,
  notifications: Bell,
  privacy: ShieldCheck,
  appearance: Palette,
  language: Globe2,
};

export function AccountSettingsContent({ onEditProfile, onChangePassword, changePasswordRef, activeCategory = DEFAULT_SETTINGS_CATEGORY, onCategoryChange }) {
  const { user } = useAuth(),
    { data } = useCitizen(),
    { beginEditing, loading: preferencesLoading, loaded: preferencesLoaded, reload: reloadPreferences, t, error: preferenceError } = useResidentPreferences(),
    [open, setOpen] = useState(false),
    [showPrivacyRequests, setShowPrivacyRequests] = useState(false);
  const category = normalizeSettingsCategory(activeCategory);
  const categoryConfig = getSettingsCategory(category);
  const settingsPanelRef = useRef(null);
  const categoryButtonRefs = useRef({});
  useEffect(() => { if (preferencesLoaded) beginEditing() }, [beginEditing, preferencesLoaded]);
  useEffect(() => {
    const scrollContainer = settingsPanelRef.current?.closest('.profile-modal-body');
    if (scrollContainer) scrollContainer.scrollTop = 0;
  }, [category]);
  const chooseCategory = nextCategory => onCategoryChange?.(normalizeSettingsCategory(nextCategory));
  const handleCategoryKeyDown = (event, currentCategory) => {
    const index = SETTINGS_CATEGORIES.findIndex(item => item.id === currentCategory);
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? SETTINGS_CATEGORIES.length - 1
        : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + SETTINGS_CATEGORIES.length) % SETTINGS_CATEGORIES.length;
    const nextCategory = SETTINGS_CATEGORIES[nextIndex].id;
    chooseCategory(nextCategory);
    window.requestAnimationFrame(() => categoryButtonRefs.current[nextCategory]?.focus());
  };
  return (
    <div className="settings-layout">
      <div className="settings-mobile-navigation">
        <label htmlFor="settings-category-select">Settings section</label>
        <select id="settings-category-select" value={category} onChange={event => chooseCategory(event.target.value)}>
          {SETTINGS_CATEGORIES.map(({ id, labelKey, fallback }) => <option value={id} key={id}>{t(`settings.${labelKey}`, fallback)}</option>)}
        </select>
      </div>
      <nav className="settings-categories" aria-label={t("settings.categories", "Settings categories")} role="tablist">
        {SETTINGS_CATEGORIES.map(({ id, labelKey, fallback }) => {
          const Icon = SETTINGS_CATEGORY_ICONS[id];
          const active = category === id;
          return (
            <button
              type="button"
              className={active ? "active" : ""}
              id={`settings-tab-${id}`}
              role="tab"
              aria-selected={active}
              aria-controls={`settings-panel-${id}`}
              tabIndex={active ? 0 : -1}
              ref={element => { categoryButtonRefs.current[id] = element }}
              onKeyDown={event => handleCategoryKeyDown(event, id)}
              onClick={() => chooseCategory(id)}
              key={id}
            >
              <Icon size={21} />
              <span>
                <strong>{t(`settings.${labelKey}`, fallback)}</strong>
              </span>
            </button>
          );
        })}
      </nav>
      <div ref={settingsPanelRef} className="settings-panel" id={`settings-panel-${category}`} role="tabpanel" aria-labelledby={`settings-tab-${category}`} tabIndex="0">
        <SettingsPanelErrorBoundary resetKey={category} t={t}>
          {category !== "account" && <header className="settings-panel-heading">
              <h2>{t(`settings.${categoryConfig.headingKey}`, `${categoryConfig.fallback} Settings`)}</h2>
              <p>{t(`settings.${categoryConfig.introKey}`, `Manage your ${categoryConfig.fallback.toLowerCase()} preferences and options.`)}</p>
              {preferencesLoading && <p className="settings-preference-status" role="status">{t("settings.loadingPreferences", "Loading your preferences…")}</p>}
            </header>}
          {category === "account" && preferencesLoading && <p className="settings-preference-status" role="status">{t("settings.loadingPreferences", "Loading your preferences…")}</p>}
          {category === "account" && <section id="settings-profile" className="settings-card profile-settings-card">
            <div className="settings-card-heading">
              <span className="settings-card-icon"><UserRound size={21} /></span>
              <div>
                <h3>Account information</h3>
                <p>Information about your Municipality of Getafe portal account.</p>
              </div>
              {onEditProfile && <button type="button" className="settings-edit-link" onClick={onEditProfile}>Edit profile</button>}
            </div>
            <AccountInformation user={user} data={data} />
          </section>}
          {category === "security" && <section id="settings-access" className="settings-card">
            <div className="settings-card-heading">
              <span className="settings-card-icon"><LockKeyhole size={21} /></span>
              <div>
                <h3>Account Access</h3>
                <p>Manage your login, security and support options.</p>
              </div>
            </div>
            <SettingsRow ref={changePasswordRef} icon={LockKeyhole} title="Change your password" description="Keep your account secure with a strong password." action="" href="/app/help" onPasswordChange={onChangePassword} />
            <SettingsRow icon={ShieldCheck} title="Two-factor authentication" description="Add an extra layer of security to your account." action="Not enabled" href="/app/help" />
            <SettingsRow icon={CircleHelp} title="Account access and support" description="Get help recovering access or changing your account information." action="" href="/app/help" />
            <ActiveSessions />
          </section>}
          {category === "privacy" && <section id="settings-privacy" className="settings-card">
            <button type="button" className="settings-row-button" onClick={() => setOpen(true)}>
              <ShieldCheck size={18} />
              <span><strong>Request data deletion</strong><small>Submit a request to delete your personal data.</small></span>
              <ChevronRight size={18} />
            </button>
            <button type="button" className="privacy-view-requests-button" onClick={() => setShowPrivacyRequests(value => !value)} aria-expanded={showPrivacyRequests}>
              {showPrivacyRequests ? "Hide privacy deletion requests" : "View privacy deletion requests"}<ChevronRight size={17} />
            </button>
            {showPrivacyRequests && <PrivacyRequests items={data?.privacyRequests || []} />}
          </section>}
          {category === "notifications" && <NotificationSettings />}
          {category === "appearance" && <AppearanceSettings />}
          {category === "language" && <LanguageRegionSettings />}
          {preferenceError && <div className="portal-error settings-preference-error" role="alert"><span>{preferenceError}</span><button type="button" className="settings-inline-action" onClick={reloadPreferences}>{t("settings.tryAgain", "Try again")}</button></div>}
          {open && category === "privacy" && <PrivacyWorkflow onClose={() => setOpen(false)} />}
        </SettingsPanelErrorBoundary>
      </div>
    </div>
  );
}

class SettingsPanelErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { t } = this.props;
    return <div className="settings-panel-error" role="alert">
      <strong>{t("settings.panelErrorTitle", "This settings section could not be displayed.")}</strong>
      <p>{t("settings.panelErrorDescription", "Your account is still open. Try this section again or choose another category.")}</p>
      <button type="button" className="settings-inline-action" onClick={() => this.setState({ error: null })}>{t("settings.tryAgain", "Try again")}</button>
    </div>;
  }
}

export function AccountSettingsFooter({ onClose }) {
  const { dirty, loaded, saving, saveEditing, t } = useResidentPreferences();
  const [saveMessage, setSaveMessage] = useState("");
  useEffect(() => { if (dirty) setSaveMessage(""); }, [dirty]);
  const save = async () => {
    setSaveMessage("");
    try { await saveEditing(); setSaveMessage(t("settings.saved", "Changes saved.")) } catch { /* The settings panel keeps the draft and shows the provider error. */ }
  };
  return (
    <footer className="settings-modal-footer">
      <span className="settings-save-confirmation" role="status" aria-live="polite">{saveMessage}</span>
      <span>
        <button type="button" className="portal-action-secondary" onClick={onClose} disabled={saving}>
          {t("settings.cancel", "Cancel")}
        </button>
        <button type="button" className="citizen-primary" onClick={save} disabled={saving || !loaded || !dirty}>
          {saving ? t("settings.saving", "Saving…") : t("settings.save", "Save Changes")}
        </button>
      </span>
    </footer>
  );
}

function PreferenceRow({ label, description, children }) {
  return <div className="settings-preference-row"><div><strong>{label}</strong><small>{description}</small></div><div className="settings-preference-control">{children}</div></div>
}

function PreferenceChoice({ value, current, label, onChange }) {
  return <button type="button" className={`settings-choice${current === value ? " active" : ""}`} aria-pressed={current === value} onClick={() => onChange(value)}>{label}</button>
}

function AppearanceSettings() {
  const { effective, updateDraft, resetDraft, t } = useResidentPreferences();
  const appearance = effective.appearance;
  return <section className="settings-category-placeholder settings-preferences" aria-label={t("settings.appearance", "Appearance")}>
    <p className="settings-live-preview">{t("settings.livePreview")}</p>
    <PreferenceRow label={t("settings.theme")} description={t("settings.themeDescription")}>
      <div className="settings-choice-group" role="group" aria-label={t("settings.theme")}>
        {[['light', t('settings.light')], ['dark', t('settings.dark')], ['system', t('settings.system')]].map(([value, label]) => <PreferenceChoice key={value} value={value} current={appearance.theme} label={label} onChange={theme => updateDraft({ appearance: { theme } })} />)}
      </div>
    </PreferenceRow>
    <PreferenceRow label={t("settings.contrast")} description={t("settings.contrastDescription")}>
      <div className="settings-choice-group" role="group" aria-label={t("settings.contrast")}>
        {[['standard', t('settings.standard')], ['high', t('settings.high')]].map(([value, label]) => <PreferenceChoice key={value} value={value} current={appearance.contrast} label={label} onChange={contrast => updateDraft({ appearance: { contrast } })} />)}
      </div>
    </PreferenceRow>
    <PreferenceRow label={t("settings.textSize")} description={t("settings.textSizeDescription")}>
      <div className="settings-choice-group" role="group" aria-label={t("settings.textSize")}>
        {[['small', t('settings.small')], ['default', t('settings.default')], ['large', t('settings.large')]].map(([value, label]) => <PreferenceChoice key={value} value={value} current={appearance.textScale} label={label} onChange={textScale => updateDraft({ appearance: { textScale } })} />)}
      </div>
    </PreferenceRow>
    <PreferenceRow label={t("settings.reduceMotion")} description={t("settings.reduceMotionDescription")}>
      <label className="settings-switch"><input type="checkbox" checked={Boolean(appearance.reduceMotion)} onChange={event => updateDraft({ appearance: { reduceMotion: event.target.checked } })}/><span aria-hidden="true"/></label>
    </PreferenceRow>
    <div className="settings-preference-actions"><button type="button" className="settings-inline-action" onClick={resetDraft}>{t("settings.reset", "Reset defaults")}</button></div>
  </section>
}

function LanguageRegionSettings() {
  const { effective, updateDraft, t } = useResidentPreferences();
  const locale = effective.locale;
  return <section className="settings-category-placeholder settings-preferences" aria-label={t("settings.languageRegion", "Language & Region")}>
    <p className="settings-live-preview">{t("settings.livePreview")}</p>
    <PreferenceRow label={t("settings.language")} description={t("settings.languageDescription")}>
      <select value={locale.language} onChange={event => updateDraft({ locale: { language: event.target.value } })}>
        <option value="en">{t("settings.english")}</option><option value="ceb">{t("settings.cebuano")}</option>
      </select>
    </PreferenceRow>
    <PreferenceRow label={t("settings.region")} description={t("settings.regionDescription")}>
      <select value={locale.region} onChange={event => updateDraft({ locale: { region: event.target.value } })} aria-label={t("settings.region")}><option value="PH">{t("settings.philippines")}</option></select>
    </PreferenceRow>
    <PreferenceRow label={t("settings.timezone")} description={t("settings.timezoneDescription")}>
      <output className="settings-readonly-value">{locale.timezone}</output>
    </PreferenceRow>
    <PreferenceRow label={t("settings.dateFormat")} description={t("settings.dateFormatDescription")}>
      <select value={locale.dateFormat} onChange={event => updateDraft({ locale: { dateFormat: event.target.value } })}>
        <option value="long">September 27, 2026</option><option value="medium">Sep 27, 2026</option><option value="dayMonth">27 September 2026</option><option value="numeric">09/27/2026</option>
      </select>
    </PreferenceRow>
    <PreferenceRow label={t("settings.timeFormat")} description={t("settings.timeFormatDescription")}>
      <div className="settings-choice-group" role="group" aria-label={t("settings.timeFormat")}>
        {[['12h', t('settings.twelveHour')], ['24h', t('settings.twentyFourHour')]].map(([value, label]) => <PreferenceChoice key={value} value={value} current={locale.timeFormat} label={label} onChange={timeFormat => updateDraft({ locale: { timeFormat } })} />)}
      </div>
    </PreferenceRow>
    <PreferenceRow label={t("settings.weekStart")} description={t("settings.weekStartDescription")}>
      <div className="settings-choice-group" role="group" aria-label={t("settings.weekStart")}>
        {[['sunday', t('settings.sunday')], ['monday', t('settings.monday')]].map(([value, label]) => <PreferenceChoice key={value} value={value} current={locale.weekStart} label={label} onChange={weekStart => updateDraft({ locale: { weekStart } })} />)}
      </div>
    </PreferenceRow>
  </section>
}

function AccountInformation({ user, data }) {
  const accountName = data?.profile?.full_name || user?.name || "Citizen";
  const accountType = user?.role === "resident" ? "Resident account" : user?.role || "Account";
  const accountStatus = user ? "Active" : "Unavailable";
  return (
    <dl className="settings-account-information">
      <div><dt>Account type</dt><dd>{accountType}</dd></div>
      <div><dt>Account status</dt><dd><span className="settings-account-status"><span aria-hidden="true">●</span>{accountStatus}</span></dd></div>
      <div><dt>Account name</dt><dd>{accountName}</dd></div>
      <div><dt>Email address</dt><dd><span>{user?.email || "Not available"}</span>{data?.profile?.email_verified && <small>Verified</small>}</dd></div>
    </dl>
  );
}

function ActiveSessions() {
  const [sessions, setSessions] = useState([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const headers = { 'X-Requested-With': 'GetafeCitizenPortal', 'Content-Type': 'application/json' }
  const load = async () => {
    try {
      const response = await fetch('/api/auth/sessions', { credentials: 'include', headers })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not load active sessions.')
      setSessions(body.sessions || [])
    } catch (cause) { setError(cause.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const revoke = async (path, body) => {
    setBusy(true); setError('')
    try {
      const response = await fetch(path, { method: 'DELETE', credentials: 'include', headers, body: body ? JSON.stringify(body) : undefined })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not revoke sessions.')
      await load()
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  const hasOtherSessions = sessions.some(session => !session.current)
  return <div className="settings-notification-group">
    <p className="settings-notification-label">Active sessions</p>
    <small className="settings-session-description">Review devices signed in to your account. Idle sessions expire automatically.</small>
    {loading ? <p>Loading sessions…</p> : <div className="settings-session-list" aria-label="Active sessions">
      {sessions.map(session => <div className={`settings-session-row${session.current ? ' is-current' : ''}`} key={session.id}>
        <div className="settings-session-details">
          <strong>{session.current ? 'This device' : 'Signed-in device'}</strong>
          {session.current && <span className="settings-session-current">Current session</span>}
          <small>Last active: {sessionDateLabel(session.lastActivityAt)}</small>
          <small>Expires: {sessionDateLabel(session.expiresAt, 'Not available')}</small>
        </div>
        {!session.current && <button className="settings-inline-action settings-session-signout" type="button" disabled={busy} onClick={() => revoke(`/api/auth/sessions/${encodeURIComponent(session.id)}`)}>Sign out</button>}
      </div>)}
    </div>}
    {hasOtherSessions && <button className="settings-inline-action settings-signout-other" type="button" disabled={busy} onClick={() => revoke('/api/auth/sessions', { keepCurrent: true })}>Sign out other sessions</button>}
    {error && <p className="portal-error" role="alert">{error}</p>}
  </div>
}

function NotificationSettings() {
  const { user } = useAuth()
  const [preferences, setPreferences] = useState(null), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [saveState, setSaveState] = useState(''), [error, setError] = useState('')
  const [verificationChallenge, setVerificationChallenge] = useState(''), [verificationCode, setVerificationCode] = useState(''), [verificationBusy, setVerificationBusy] = useState(false)
  const loadPreferences = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setPreferences(await notificationPreferencesApi.get()) }
    catch (cause) { setPreferences(null); setError(notificationPreferencesError(cause)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { loadPreferences() }, [loadPreferences])
  const update = async (key, value) => {
    if (!preferences) return
    const previous = preferences
    setPreferences({ ...preferences, [key]: value }); setError(''); setSaveState('Saving…'); setSaving(true)
    try { setPreferences(await notificationPreferencesApi.update({ [key]: value })); setSaveState('Saved') }
    catch (cause) { setPreferences(previous); setError(notificationPreferencesError(cause, 'update')); setSaveState('') }
    finally { setSaving(false) }
  }
  const requestVerification = async () => {
    setVerificationBusy(true); setError('')
    try { const result = await citizenApi('/email-verification/request', { method: 'POST' }); setVerificationChallenge(result.challengeId) } catch { setError('We couldn\'t send a verification code right now. Try again.') } finally { setVerificationBusy(false) }
  }
  const confirmVerification = async event => {
    event.preventDefault(); setVerificationBusy(true); setError('')
    try { const result = await citizenApi('/email-verification/confirm', { method: 'POST', body: JSON.stringify({ challengeId: verificationChallenge, code: verificationCode }) }); setPreferences(result); setVerificationChallenge(''); setVerificationCode('') } catch { setError('We couldn\'t verify your email address. Try again.') } finally { setVerificationBusy(false) }
  }
  const categories = [['requestUpdates', 'Requests & applications', 'Status changes and updates to your service requests.'], ['appointmentUpdates', 'Appointments', 'Confirmations, reminders, cancellations and changes.'], ['documentUpdates', 'Documents', 'Updates when requested documents change status.'], ['paymentUpdates', 'Payments', 'Payment confirmations and important payment updates.'], ['municipalAnnouncements', 'Municipal announcements', 'Important notices and public advisories.'], ['eventUpdates', 'Events & meetings', 'Relevant municipal event and meeting updates.']]
  if (loading) return <section className="settings-notification-content" aria-busy="true"><div className="settings-notification-skeleton" aria-label="Loading notification preferences"><span/><span/><span/></div></section>
  if (!preferences) return <section className="settings-notification-content"><div className="settings-notification-error" role="alert"><p>{error || "We couldn't load your notification settings."}</p><button type="button" className="settings-inline-action" onClick={loadPreferences}>Try again</button></div></section>
  return <section className="settings-notification-content">
    <div className="settings-notification-group"><p className="settings-notification-label">Essential notifications</p><div className="settings-notification-row"><div><strong>In-app notifications</strong><small>Receive important updates directly in your citizen portal.</small></div><span className="settings-always-on">Always on</span></div></div>
    <div className="settings-notification-group"><p className="settings-notification-label">Email notifications</p><label className="settings-notification-row settings-notification-toggle"><div><strong>Email notifications</strong><small>Receive important updates by email at {preferences.email || user?.email || 'your verified email address'}.</small></div><input type="checkbox" checked={Boolean(preferences.emailEnabled)} disabled={saving} onChange={event => update('emailEnabled', event.target.checked)}/><span aria-hidden="true"/></label>
      {!preferences.emailVerified && <div className="settings-email-verification"><p>Email notifications</p><span>Verify your email address to receive email notifications.</span><button type="button" className="settings-inline-action" disabled={verificationBusy} onClick={requestVerification}>Verify email</button>{verificationChallenge && <form onSubmit={confirmVerification}><input aria-label="Email verification code" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={verificationCode} onChange={event => setVerificationCode(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code"/><button type="submit" className="settings-inline-action" disabled={verificationBusy || verificationCode.length !== 6}>Confirm</button></form>}</div>}
      <p className="settings-notification-label settings-sub-label">Email me about</p>{categories.map(([key, label, description]) => <label className={`settings-notification-row settings-notification-toggle settings-category-row${preferences.emailEnabled ? '' : ' is-disabled'}`} key={key}><div><strong>{label}</strong><small>{description}</small></div><input type="checkbox" checked={Boolean(preferences[key])} disabled={saving || !preferences.emailEnabled} onChange={event => update(key, event.target.checked)}/><span aria-hidden="true"/></label>)}
      {saveState && <p className="settings-save-state" role="status">{saveState}</p>}{error && <p className="portal-error" role="alert">{error}</p>}</div>
  </section>
}

export default function Settings() {
  return <Navigate to={ROUTES.app.root} replace state={{ openSettingsModal: true, settingsCategory: DEFAULT_SETTINGS_CATEGORY }} />
}

const SettingsRow = forwardRef(function SettingsRow({ icon: Icon, title, description, action, href, onPasswordChange }, ref) {
  const { user } = useAuth();
  const [mfaOpen, setMfaOpen] = useState(false);
  const isMfa = title === "Two-factor authentication";
  return (
    <>
      <Link
        ref={ref}
        to={title === "Change your password" ? undefined : isMfa ? "#" : href}
        className="citizen-settings-row settings-row-link"
        onClick={(event) => {
          if (title === "Change your password" || isMfa) event.preventDefault();
          if (title === "Change your password") {
            if (onPasswordChange) return onPasswordChange();
            setPasswordOpen(true);
          }
          if (isMfa) setMfaOpen(true);
        }}
      >
        <span className="citizen-settings-row-icon">
          {isMfa ? (
            <img
              className="mfa-authentication-icon"
              src="/assets/icons/auth-pack/authentication.png"
              alt=""
              aria-hidden="true"
            />
          ) : (
            <Icon size={18} />
          )}
        </span>
        <span className="citizen-settings-row-copy">
          <h3>{title}</h3>
          <p>{description}</p>
        </span>
        <span className="citizen-settings-action">
          {isMfa ? (user?.mfaEnabled ? "Enabled" : "Not enabled") : action}
          <ChevronRight size={16} />
        </span>
      </Link>
      {isMfa &&
        mfaOpen &&
        createPortal(
          <MfaSetupModal onClose={() => setMfaOpen(false)} />,
          document.body,
        )}
    </>
  );
})

function MfaSetupModal({ onClose }) {
  const { user, refreshUser } = useAuth();
  const [setup, setSetup] = useState(null),
    [disableOpen, setDisableOpen] = useState(false),
    [code, setCode] = useState(""),
    [recoveryCodes, setRecoveryCodes] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const begin = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/setup", {
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "GetafeCitizenPortal" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Could not start MFA setup.");
      setSetup(body);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  const activate = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/activate", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "GetafeCitizenPortal",
        },
        body: JSON.stringify({ enrollmentId: setup.enrollmentId, code }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Could not activate MFA.");
      setRecoveryCodes(body.recoveryCodes);
      await refreshUser();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  const close = () => onClose();
  const appRecommendations = (
    <aside
      className="mfa-app-recommendations"
      aria-label="Recommended authenticator apps"
    >
      <div>
        <Smartphone size={19} />
        <span>
          <strong>Need an authenticator app?</strong>
          <small>
            Use a trusted app on your phone, then return here to scan the QR
            code.
          </small>
        </span>
      </div>
      <div className="mfa-app-links">
        <a
          href="https://www.google.com/mobile/authenticator/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download size={15} /> Google Authenticator <ExternalLink size={13} />
        </a>
        <a
          href="https://www.microsoft.com/en-us/security/authenticator/mobile-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download size={15} /> Microsoft Authenticator{" "}
          <ExternalLink size={13} />
        </a>
      </div>
      <p>
        Download only from the Apple App Store or Google Play. Any
        standards-compatible authenticator app will work.
      </p>
    </aside>
  );
  return (
    <div
      className="profile-modal-backdrop mfa-modal-backdrop"
      role="presentation"
    >
      <section
        className={`profile-modal-card mfa-setup-modal ${setup ? "mfa-setup-flow" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-title"
      >
        <button
          type="button"
          className="profile-form-close"
          aria-label="Close MFA setup"
          onClick={close}
        >
          <X size={19} />
        </button>
        <div className="mfa-modal-content">
          {!setup && (
            <>
              <img
                className="mfa-authentication-icon"
                src="/assets/icons/auth-pack/authentication.png"
                alt=""
                aria-hidden="true"
              />
              <h2 id="mfa-title">Two-factor authentication</h2>
            </>
          )}
          {user?.mfaEnabled && !recoveryCodes ? (
            <>
              <p>
                MFA is enabled for this account. You’ll be asked for an
                authenticator or recovery code when you sign in.
              </p>
              <>
                <button
                  className="citizen-primary"
                  type="button"
                  onClick={() => setDisableOpen(true)}
                >
                  Disable MFA
                </button>
                {disableOpen && (
                  <DisableMfaModal
                    onClose={() => setDisableOpen(false)}
                    onDisabled={async () => {
                      await refreshUser();
                      onClose();
                    }}
                  />
                )}
              </>
            </>
          ) : recoveryCodes ? (
            <>
              <p>
                <strong>MFA is now active.</strong> Save these recovery codes
                now. Each code works once, and they will not be displayed again.
              </p>
              <div className="mfa-recovery-codes">
                {recoveryCodes.map((item) => (
                  <code key={item}>{item}</code>
                ))}
              </div>
              <button
                type="button"
                className="portal-action-secondary"
                onClick={() =>
                  navigator.clipboard?.writeText(recoveryCodes.join("\n"))
                }
              >
                Copy codes
              </button>
              <button
                type="button"
                className="portal-action-secondary"
                onClick={() => {
                  const blob = new Blob([recoveryCodes.join("\n") + "\n"], {
                    type: "text/plain;charset=utf-8",
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "getafe-recovery-codes.txt";
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download .txt
              </button>
              <button type="button" className="citizen-primary" onClick={close}>
                I saved my codes
              </button>
            </>
          ) : !setup ? (
            <>
              <p>
                Use an authenticator app to add a second verification step to
                your account.
              </p>
              {appRecommendations}
              <button
                type="button"
                className="citizen-primary"
                disabled={busy}
                onClick={begin}
              >
                {busy ? "Preparing…" : "Set up authenticator"}
              </button>
            </>
          ) : (
            <form onSubmit={activate}>
              <header className="mfa-flow-heading">
                <h2 id="mfa-title">Enable Authenticator App</h2>
                <p>Make your account safer in 3 easy steps:</p>
              </header>
              <div className="mfa-flow-step">
                <span className="mfa-flow-step-icon"><Smartphone size={47} strokeWidth={1.5} /></span>
                <div>
                  <strong>Download an authenticator app</strong>
                  <p>
                    Download and install <a href="https://www.authy.com/download" target="_blank" rel="noopener noreferrer">Authy</a> or <a href="https://www.google.com/mobile/authenticator/" target="_blank" rel="noopener noreferrer">Google Authenticator</a> for your phone or tablet.
                  </p>
                </div>
              </div>
              <div className="mfa-flow-step mfa-flow-qr-step">
                <span className="mfa-flow-step-icon">
                  <img className="mfa-qr" src={setup.qrCode} alt="Authenticator setup QR code" />
                </span>
                <div>
                  <strong>Scan the QR code</strong>
                  <p>Open the authentication app and scan the image to the left using your phone's camera.</p>
                  <div className="mfa-flow-manual">
                    <strong>2FA Key (Manual entry)</strong>
                    <code className="mfa-secret">{setup.secret}</code>
                  </div>
                </div>
              </div>
              <div className="mfa-flow-step mfa-flow-code-step">
                <span className="mfa-flow-step-icon"><ShieldCheck size={47} strokeWidth={1.5} /></span>
                <div className="mfa-flow-code-content">
                  <strong>Log in with your code</strong>
                  <p>Enter the 6-digit verification code generated.</p>
                  <div className="mfa-flow-code-actions">
                    <input
                      required
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength="6"
                      autoComplete="one-time-code"
                      aria-label="6-digit verification code"
                      placeholder="000 000"
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    />
                    <button className="citizen-primary" disabled={busy || code.length !== 6}>
                      {busy ? "Activating…" : "Activate"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}
          {error && (
            <p className="portal-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function DisableMfaModal({ onClose, onDisabled }) {
  const [challengeId, setChallengeId] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const requestCode = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/disable/request", {
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "GetafeCitizenPortal" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Could not send the confirmation code.");
      setChallengeId(body.challengeId);
      setSent(true);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/disable/confirm", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "GetafeCitizenPortal",
        },
        body: JSON.stringify({ challengeId, code }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "The confirmation code is invalid.");
      await onDisabled();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="profile-modal-backdrop mfa-modal-backdrop"
      role="presentation"
    >
      <section
        className="profile-modal-card mfa-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="disable-mfa-title"
      >
        <button
          type="button"
          className="profile-form-close"
          aria-label="Close disable MFA dialog"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <div className="mfa-modal-content">
          <ShieldCheck size={34} aria-hidden="true" />
          <h2 id="disable-mfa-title">Disable two-factor authentication?</h2>
          <p>
            {sent
              ? "Enter the six-digit code sent to your email address to confirm disabling MFA."
              : "For your security, we will send a confirmation code to your registered email address."}
          </p>
          {!sent ? (
            <button
              type="button"
              className="citizen-primary"
              disabled={busy}
              onClick={requestCode}
            >
              {busy ? "Sending code…" : "Send email code"}
            </button>
          ) : (
            <form onSubmit={confirm}>
              <label>
                Email confirmation code
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength="6"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Enter six-digit code"
                />
              </label>
              <button
                className="citizen-primary"
                disabled={busy || code.length !== 6}
              >
                {busy ? "Disabling MFA…" : "Confirm and disable MFA"}
              </button>
            </form>
          )}
          {error && (
            <p className="portal-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="renewal-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

function PrivacyWorkflow({ onClose }) {
  const { reload } = useCitizen(),
    [step, setStep] = useState(1),
    [scope, setScope] = useState(""),
    [password, setPassword] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const verifyPassword = async () => {
    setBusy(true);
    setError("");
    try {
      await citizenApi("/privacy-requests/verify-password", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setStep(4);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await citizenApi("/privacy-requests", {
        method: "POST",
        body: JSON.stringify({ scope, password }),
      });
      setSuccess(
        `Request ${result.reference_number} submitted. We will notify you when it is reviewed.`,
      );
      await reload();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="profile-modal-backdrop privacy-modal-backdrop"
      role="presentation"
    >
      <section
        className="profile-modal-card privacy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
      >
        <button
          type="button"
          className="profile-form-close"
          aria-label="Close privacy request"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        {success ? (
          <div className="privacy-complete">
            <ShieldCheck size={34} />
            <h2 id="privacy-title">Request submitted</h2>
            <p>{success}</p>
            <button type="button" className="citizen-primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="portal-form" onSubmit={submit}>
            <p className="privacy-step">Step {step} of 4</p>
            {step === 1 && (
              <>
                <h2 id="privacy-title">About data deletion requests</h2>
                <p>
                  Some personal account information may be eligible for
                  deletion. Applications, permits, certificates, payment
                  records, official correspondence, audit logs, and other
                  government records may need to be retained.
                </p>
                <p>
                  Deleting eligible account data does not erase official records
                  and may affect access to online services or account history.
                </p>
                <p>
                  Read our{" "}
                  <Link to="/legal/privacy" target="_blank">
                    Privacy Policy
                  </Link>{" "}
                  before continuing.
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <h2 id="privacy-title">Choose your request scope</h2>
                <p>
                  Select what you want us to review. Official records that must
                  remain part of the municipality’s records cannot be
                  selectively deleted.
                </p>
                <div className="privacy-scope-list">
                  {scopes.map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="radio"
                        name="scope"
                        value={key}
                        checked={scope === key}
                        onChange={(event) => setScope(event.target.value)}
                        required
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <h2 id="privacy-title">Verify your identity</h2>
                <p>
                  Confirm your current account password before we accept this
                  privacy request. We do not ask for unnecessary sensitive
                  information.
                </p>
                <label>
                  Password confirmation
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
              </>
            )}
            {step === 4 && (
              <>
                <h2 id="privacy-title">Review and confirm your request</h2>
                <div className="privacy-summary">
                  <span>Request</span>
                  <strong>Personal data deletion</strong>
                  <span>Requested scope</span>
                  <strong>{scopeLabel(scope)}</strong>
                </div>
                <label className="privacy-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    required
                  />
                  I confirm that I have reviewed this request and understand
                  that eligible personal data may be permanently deleted. I
                  also understand that government records may be retained when
                  required by law, regulation, or official records-management
                  requirements.
                </label>
              </>
            )}
            {error && (
              <p className="portal-error" role="alert">
                {error}
              </p>
            )}
            <div className="portal-form-actions">
              {step > 1 && (
                <button
                  type="button"
                  className="portal-action-secondary"
                  onClick={() => setStep((value) => value - 1)}
                >
                  Back
                </button>
              )}
              {step < 4 ? (
                <button
                  type="button"
                  className="citizen-primary"
                disabled={(step === 2 && !scope) || (step === 3 && (busy || !password))}
                onClick={() => (step === 3 ? verifyPassword() : setStep((value) => value + 1))}
              >
                {busy && step === 3 ? 'Verifying…' : 'Continue'}
                </button>
              ) : (
                <button
                  className="citizen-primary"
                  disabled={busy || !confirmed}
                >
                  {busy ? "Submitting…" : "Submit request"}
                </button>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function PrivacyRequests({ items }) {
  return (
    <section className="citizen-panel privacy-requests-panel">
      <div className="citizen-panel-head">
        <div>
          <h2>Privacy Requests</h2>
          <p>Track requests submitted for review.</p>
        </div>
        <LockKeyhole size={21} />
      </div>
      {items.length ? (
        <div
          className="privacy-request-table"
          role="table"
          aria-label="Privacy requests"
        >
          <div
            className="privacy-request-row privacy-request-heading"
            role="row"
          >
            <span>Request ID</span>
            <span>Request Type</span>
            <span>Submitted</span>
            <span>Status</span>
            <span>Last Updated</span>
          </div>
          {items.map((item) => (
            <div className="privacy-request-row" role="row" key={item.id}>
              <span>{item.id.slice(0, 8).toUpperCase()}</span>
              <span>{item.request_type}</span>
              <span>{dateLabel(item.created_at)}</span>
              <span className="portal-status blue">
                {item.status.replaceAll("_", " ")}
              </span>
              <span>{dateLabel(item.updated_at)}</span>
              {item.review_note && <p>{item.review_note}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="portal-muted">No privacy requests have been submitted.</p>
      )}
    </section>
  );
}
