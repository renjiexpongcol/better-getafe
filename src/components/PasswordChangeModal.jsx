import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { usePublicConfig } from "../context/PublicConfig";
import { getPasswordPolicyChecks } from "../passwordPolicy";

function PasswordField({ id, label, value, onChange, autoComplete, visible, onToggle, error, feedback, describedBy }) {
  return (
    <div className="password-change-field">
      <label htmlFor={id}>{label}</label>
      <span className="password-input-with-toggle">
        <input
          id={id}
          required
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          maxLength="1024"
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-visibility-toggle"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          onClick={onToggle}
        >
          {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
      </span>
      {error && <p id={`${id}-error`} className="password-field-error" role="alert">{error}</p>}
      {feedback && <p className={`password-field-feedback ${feedback.tone || ""}`} role="status">{feedback.content}</p>}
    </div>
  );
}

export default function PasswordChangeModal({ onClose, returnFocusRef, endpoint = "/api/account/password", requestMethod = "PATCH", passwordField = "newPassword", embedded = false }) {
  const publicConfig = usePublicConfig();
  const minimumLength = Number(publicConfig["authentication.passwordMinLength"] || 12);
  const dialogRef = useRef(null);
  const closeTimerRef = useRef(null);
  const busyRef = useRef(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState({ current: false, new: false, confirm: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ current: "", new: "", confirm: "" });
  const [success, setSuccess] = useState(false);
  const checks = getPasswordPolicyChecks(newPassword, minimumLength);
  const passwordMeetsPolicy = checks.length && checks.mixed && checks.symbol && checks.common && checks.size;
  const canSubmit = Boolean(currentPassword && passwordMeetsPolicy && confirmPassword && newPassword === confirmPassword);
  busyRef.current = busy;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = () => dialogRef.current?.closest('[role="dialog"]') || dialogRef.current;
    const firstInput = dialog()?.querySelector("input");
    firstInput?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...(dialog()?.querySelectorAll("button, input") || [])]
        .filter((item) => !item.disabled && item.offsetParent !== null);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(closeTimerRef.current);
      returnFocusRef?.current?.focus();
    };
  }, [onClose, returnFocusRef]);

  const updateField = (field, value) => {
    setFieldErrors((state) => ({ ...state, [field]: "" }));
    setError("");
    if (field === "current") setCurrentPassword(value);
    if (field === "new") {
      setNewPassword(value);
      setFieldErrors((state) => ({ ...state, new: "", confirm: "" }));
    }
    if (field === "confirm") setConfirmPassword(value);
  };

  const validateFields = () => {
    const nextErrors = { current: "", new: "", confirm: "" };
    if (!currentPassword) nextErrors.current = "Enter your current password.";
    if (!newPassword) nextErrors.new = "Enter a new password.";
    else if (!passwordMeetsPolicy) nextErrors.new = "Use a password that meets all requirements.";
    else if (newPassword === currentPassword) nextErrors.new = "Your new password must be different from your current password.";
    if (!confirmPassword) nextErrors.confirm = "Confirm your new password.";
    else if (newPassword !== confirmPassword) nextErrors.confirm = "Passwords do not match.";
    setFieldErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busyRef.current || success) return;
    setError("");
    if (!validateFields()) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: requestMethod,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "GetafeCitizenPortal",
        },
        body: JSON.stringify({ currentPassword, [passwordField]: newPassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 429) throw new Error("Too many attempts. Please wait and try again.");
        if (response.status >= 500) throw new Error("Unable to change your password. Please try again.");
        if (response.status === 401 && body.error !== "Current password is incorrect.") {
          throw new Error("Your session has expired. Please sign in again.");
        }
        if (response.status === 401 && body.error === "Current password is incorrect.") {
          setFieldErrors((state) => ({ ...state, current: body.error }));
          return;
        }
        if (response.status === 422 && /different|stronger|requirements|uppercase|special|1,024/i.test(body.error || "")) {
          setFieldErrors((state) => ({ ...state, new: body.error || "Your new password does not meet the password requirements." }));
          return;
        }
        throw new Error(body.error || "Unable to change your password. Please try again.");
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      closeTimerRef.current = window.setTimeout(onClose, 900);
    } catch (cause) {
      setError(cause instanceof TypeError ? "Unable to change your password. Please check your connection and try again." : cause.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const content = (
    <div ref={dialogRef} className="password-change-content">
      <h2 id="password-change-title">Change password</h2>
      <p id="password-change-description">Update the password for your account.</p>
      <form onSubmit={submit} noValidate>
        <PasswordField
          id="current-password"
          label="Current password"
          value={currentPassword}
          onChange={(value) => updateField("current", value)}
          autoComplete="current-password"
          visible={visible.current}
          error={fieldErrors.current}
          describedBy={fieldErrors.current ? "current-password-error" : undefined}
          onToggle={() => setVisible((state) => ({ ...state, current: !state.current }))}
        />
        <PasswordField
          id="new-password"
          label="New password"
          value={newPassword}
          onChange={(value) => updateField("new", value)}
          autoComplete="new-password"
          visible={visible.new}
          error={fieldErrors.new}
          describedBy={`password-requirements-title${fieldErrors.new ? " new-password-error" : ""}`}
          onToggle={() => setVisible((state) => ({ ...state, new: !state.new }))}
        />
        <PasswordField
          id="confirm-new-password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={(value) => updateField("confirm", value)}
          autoComplete="new-password"
          visible={visible.confirm}
          error={fieldErrors.confirm}
          feedback={confirmPassword && !fieldErrors.confirm ? {
            tone: confirmPassword === newPassword ? "match" : "mismatch",
            content: confirmPassword === newPassword ? <><Check size={14} aria-hidden="true" /> Passwords match</> : "Passwords do not match.",
          } : null}
          describedBy={fieldErrors.confirm ? "confirm-new-password-error" : undefined}
          onToggle={() => setVisible((state) => ({ ...state, confirm: !state.confirm }))}
        />
        <section className="password-requirements" aria-labelledby="password-requirements-title">
          <h3 id="password-requirements-title">Password requirements</h3>
          <div className="password-requirement-list" role="list" aria-live="polite">
            {[
              [checks.length, `${minimumLength}+ characters`],
              [checks.upperLower, "Uppercase & lowercase"],
              [checks.number, "At least one number"],
              [checks.symbol, "Special character"],
              [checks.common, "Not a common password"],
              [checks.size, "Maximum 1,024 characters"],
            ].map(([met, label]) => (
              <div className={met ? "met" : ""} role="listitem" key={label}>
                <span className="password-requirement-status" aria-hidden="true">
                  {met ? <Check size={14} strokeWidth={2.5} /> : "○"}
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
        {error && <p className="portal-error password-change-form-error" role="alert">{error}</p>}
        {success && <p className="portal-success" role="status"><strong>Password changed</strong><span>Your password has been updated successfully.</span></p>}
        <div className="password-change-actions">
          <button type="button" className="citizen-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="citizen-primary" disabled={busy || success || !canSubmit}>
            {busy ? "Changing password…" : "Change password"}
          </button>
        </div>
      </form>
    </div>
  )

  if (embedded) return content
  return createPortal(
    <div
      className="profile-modal-backdrop mfa-modal-backdrop password-change-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busyRef.current) onClose();
      }}
    >
      <section
        className="profile-modal-card mfa-setup-modal password-change-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-change-title"
        aria-describedby="password-change-description"
        tabIndex="-1"
      >
        <button
          type="button"
          className="profile-form-close"
          aria-label="Close change password dialog"
          onClick={onClose}
          disabled={busy}
        >
          <X size={19} aria-hidden="true" />
        </button>
        {content}
      </section>
    </div>,
    document.body,
  )
}
