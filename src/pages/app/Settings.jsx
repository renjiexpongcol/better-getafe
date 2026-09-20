import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import {
  Bell,
  ChevronRight,
  CircleHelp,
  Database,
  Download,
  ExternalLink,
  Globe2,
  LockKeyhole,
  Palette,
  ShieldCheck,
  Smartphone,
  UserRound,
  X,
} from "lucide-react";
import AppPage from "./AppPage";
import { useAuth } from "../../context/AuthContext";
import { useCitizen } from "../../context/CitizenContext";
import { citizenApi, dateLabel } from "../../services/citizenData";
import { Link } from "react-router-dom";

const scopes = [
  ["account_data", "Delete eligible personal/account data"],
  ["uploaded_files", "Delete uploaded files no longer subject to retention"],
  ["close_account", "Close or deactivate my citizen account"],
  ["all_eligible", "Request deletion of all eligible data"],
];
const scopeLabel = (value) =>
  scopes.find(([key]) => key === value)?.[1] || value;

export function AccountSettingsContent({ onClose }) {
  const { user } = useAuth(),
    { data } = useCitizen(),
    [open, setOpen] = useState(false),
    [showPrivacyRequests, setShowPrivacyRequests] = useState(false),
    [category, setCategory] = useState("Account");
  const chooseCategory = (label) => setCategory(label);
  return (
    <div className="settings-layout">
      <aside className="settings-categories" aria-label="Settings categories">
        {[
          [UserRound, "Account", "Profile and personal info"],
          [ShieldCheck, "Security", "Password and access"],
          [Bell, "Notifications", "Alerts and preferences"],
          [ShieldCheck, "Privacy & Data", "Manage your data"],
          [Palette, "Appearance", "Theme and display"],
          [Globe2, "Language & Region", "Language and time zone"],
          [CircleHelp, "Help & Support", "Get help or contact us"],
        ].map(([Icon, label, description]) => (
          <button
            type="button"
            className={category === label ? "active" : ""}
            aria-current={category === label ? "page" : undefined}
            onClick={() => chooseCategory(label)}
            key={label}
          >
            <Icon size={21} />
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </button>
        ))}
      </aside>
      <div className="settings-panel">
        <header className="settings-panel-heading">
          <h2>{category} Settings</h2>
          <p>Manage your {category.toLowerCase()} preferences and options.</p>
        </header>
        <section
          id="settings-profile"
          className="settings-card profile-settings-card"
        >
          <div className="settings-card-heading">
            <span className="settings-card-icon">
              <UserRound size={21} />
            </span>
            <div>
              <h3>Profile Information</h3>
              <p>Keep your personal information up to date.</p>
            </div>
            <Link to="/app/profile" className="settings-edit-link">
              Edit
            </Link>
          </div>
          <div className="settings-profile-summary">
            <span className="settings-avatar">
              {(user?.name || "Citizen")
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div>
              <strong>{user?.name || "Citizen"}</strong>
              <p>{user?.email}</p>
              <span className="settings-status">Active</span>
            </div>
          </div>
        </section>
        <section id="settings-access" className="settings-card">
          <div className="settings-card-heading">
            <span className="settings-card-icon">
              <LockKeyhole size={21} />
            </span>
            <div>
              <h3>Account Access</h3>
              <p>Manage your login, security and support options.</p>
            </div>
          </div>
          <SettingsRow
            icon={LockKeyhole}
            title="Change your password"
            description="Keep your account secure with a strong password."
            action=""
            href="/app?sysparm_object_id=help"
          />
          <SettingsRow
            icon={ShieldCheck}
            title="Two-factor authentication"
            description="Add an extra layer of security to your account."
            action="Not enabled"
            href="/app?sysparm_object_id=help"
          />
          <SettingsRow
            icon={CircleHelp}
            title="Account access and support"
            description="Get help recovering access or changing your account information."
            action=""
            href="/app?sysparm_object_id=help"
          />
        </section>
        <section id="settings-privacy" className="settings-card">
          <button
            type="button"
            className="settings-row-button"
            onClick={() => setOpen(true)}
          >
            <ShieldCheck size={18} />
            <span>
              <strong>Request data deletion</strong>
              <small>Submit a request to delete your personal data.</small>
            </span>
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="privacy-view-requests-button"
            onClick={() => setShowPrivacyRequests((value) => !value)}
            aria-expanded={showPrivacyRequests}
          >
            {showPrivacyRequests
              ? "Hide privacy deletion requests"
              : "View privacy deletion requests"}
            <ChevronRight size={17} />
          </button>
          {showPrivacyRequests && (
            <PrivacyRequests items={data?.privacyRequests || []} />
          )}
        </section>
        {category === "Notifications" && <NotificationSettings />}
        {open && <PrivacyWorkflow onClose={() => setOpen(false)} />}
        <div className="settings-modal-footer">
          <span>
            <button
              type="button"
              className="portal-action-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="button" className="citizen-primary" onClick={onClose}>
              Save Changes
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function NotificationSettings() {
  const { data, reload } = useCitizen()
  const [emailEnabled, setEmailEnabled] = useState(false), [smsEnabled, setSmsEnabled] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('')
  useEffect(() => { setEmailEnabled(Boolean(data?.profile?.email_notifications)); setSmsEnabled(Boolean(data?.profile?.sms_notifications)) }, [data?.profile?.email_notifications, data?.profile?.sms_notifications])
  const update = async (channel, value) => {
    const next = { emailNotifications: channel === 'email' ? value : emailEnabled, smsNotifications: channel === 'sms' ? value : smsEnabled }
    setError(''); setSaving(true)
    try { await citizenApi('/notification-preferences', { method: 'PUT', body: JSON.stringify(next) }); await reload() } catch (cause) { setError(cause.message) } finally { setSaving(false) }
  }
  return <section className="settings-notification-content">
    <div className="settings-notification-group"><p className="settings-notification-label">Essential notifications</p><div className="settings-notification-row"><div><strong>In-app notifications</strong><small>Receive important updates directly in your citizen portal.</small></div><span className="settings-always-on">Always on</span></div></div>
    <div className="settings-notification-group"><p className="settings-notification-label">Optional channels</p><label className="settings-notification-row settings-notification-toggle"><div><strong>Email notifications</strong><small>Receive important updates by email.</small></div><input type="checkbox" checked={emailEnabled} disabled={saving} onChange={event => update('email', event.target.checked)}/><span aria-hidden="true"/></label><label className="settings-notification-row settings-notification-toggle"><div><strong>SMS notifications</strong><small>Receive time-sensitive updates by SMS.</small></div><input type="checkbox" checked={smsEnabled} disabled={saving} onChange={event => update('sms', event.target.checked)}/><span aria-hidden="true"/></label>{error && <p className="portal-error" role="alert">{error}</p>}</div>
  </section>
}

export default function Settings() {
  return (
    <AppPage title="Account settings">
      <section className="citizen-settings-page">
        <AccountSettingsContent onClose={() => {}} />
      </section>
    </AppPage>
  );
}

function SettingsRow({ icon: Icon, title, description, action, href }) {
  const { user } = useAuth();
  const [mfaOpen, setMfaOpen] = useState(false),
    [passwordOpen, setPasswordOpen] = useState(false);
  const isMfa = title === "Two-factor authentication";
  return (
    <>
      <Link
        to={title === "Change your password" ? undefined : isMfa ? "#" : href}
        className="citizen-settings-row settings-row-link"
        onClick={(event) => {
          if (title === "Change your password" || isMfa) event.preventDefault();
          if (title === "Change your password") setPasswordOpen(true);
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
}

function MfaSetupModal({ onClose }) {
  const { user, validateSession } = useAuth();
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
      await validateSession(true);
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
                      await validateSession(true);
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

function PasswordChangeModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "GetafeCitizenPortal",
        },
        body: JSON.stringify({ currentPassword, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Password could not be changed.");
      setMessage("Your password has been changed.");
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
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
        aria-labelledby="password-change-title"
      >
        <button
          type="button"
          className="profile-form-close"
          aria-label="Close password change dialog"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <div className="mfa-modal-content">
          <LockKeyhole size={34} aria-hidden="true" />
          <h2 id="password-change-title">Change your password</h2>
          <p>Choose a new password to keep your account secure.</p>
          <form onSubmit={submit}>
            <label>
              Current password
              <input
                required
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label>
              New password
              <input
                required
                minLength="8"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              Confirm new password
              <input
                required
                minLength="8"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
            {error && (
              <p className="portal-error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="reset-message" role="status">
                {message}
              </p>
            )}
            <button className="citizen-primary" disabled={busy}>
              {busy ? "Saving…" : "Change password"}
            </button>
          </form>
          <button type="button" className="renewal-cancel" onClick={onClose}>
            Cancel
          </button>
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
