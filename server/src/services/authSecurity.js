import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { stateKey, stateTransaction, putState, readState } from './authState.js';
import { sendEmail } from './email.js';
import { verificationCodeEmail } from '../email/templates/verificationCode.js';
import { sendSms } from './sms.js';
import { enqueueEmail } from './redisInfrastructure.js';
import { isRedisReady } from '../infrastructure/redis/redisClient.js';
const challengePepper = () => process.env.AUTH_SESSION_SECRET || process.env.CMS_SESSION_SECRET || process.env.SESSION_SECRET || 'change-this-local-development-session-secret';
export const verificationCodeDigest = (id, code) => crypto.createHmac('sha256', challengePepper()).update(`${id}:${code}`).digest('hex');
const verificationCodeLifetimeMs = 10 * 60 * 1000;
const verificationChallengeLifetimeMs = 30 * 60 * 1000;
const verificationResendCooldownMs = 30 * 1000;
const verificationResendLimit = 5;
const verificationResendWindowMs = 15 * 60 * 1000;
const challengeIdPattern = /^[a-f0-9]{48}$/;
const generateVerificationCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

const verificationMessage = (code, purpose) => verificationCodeEmail({
  code,
  expiresInMinutes: Math.ceil(verificationCodeLifetimeMs / 60000),
  purpose,
  portalName: config.get('general.name') || 'Municipality of Getafe',
  siteUrl: config.get('general.url'),
  logoUrl: config.get('general.logo'),
});

const deliverVerificationEmail = async (email, message) => {
  const queuedMessage = { to: email, subject: message.subject, text: message.text, html: message.html, priority: 'high' };
  try {
    return await enqueueEmail(queuedMessage, { priority: 'high' });
  } catch (error) {
    // Production auth traffic is rejected when Redis is unavailable. Keep a
    // direct-delivery fallback for local development, where the existing auth
    // state fallback is intentionally supported.
    if (isRedisReady() || process.env.NODE_ENV === 'production') throw error;
    return sendEmail(email, message.subject, message.text, undefined, undefined, [], message.html);
  }
};
export async function loginThrottle(identities, failed) {
  const { ip, account, combination } = typeof identities === 'string'
    ? { ip: identities, account: identities, combination: identities }
    : identities;
  let retryAfter = 0;
  // Successful authentication may clear account-specific failures, but must
  // not erase the shared client/IP bucket used to detect distributed abuse.
  const buckets = failed === false
    ? [['account', account], ['combination', combination]]
    : [['ip', ip], ['account', account], ['combination', combination]];
  for (const [scope, identity] of buckets) {
    if (!identity) continue;
    const limit = config.get('authentication.failedLoginLimit') * (scope === 'ip' ? 5 : 1);
    const result = await stateTransaction(stateKey(`login-attempts-${scope}`, identity), async current => {
    const value = current || { count: 0, until: 0 };
    if (value.until > Date.now()) return { value, expires: value.until, result: { allowed: false, retryAfter: Math.max(1, Math.ceil((value.until - Date.now()) / 1000)) } };
    if (failed === false) return { value: null, result: true };
    if (failed === true) value.count++;
    if (value.count >= limit) value.until = Date.now() + config.get('authentication.lockoutMinutes') * 60000;
    const expires = value.until || Date.now() + config.get('authentication.lockoutMinutes') * 60000;
    return { value, expires, result: { allowed: true, retryAfter: value.until ? Math.max(1, Math.ceil((value.until - Date.now()) / 1000)) : 0 } };
    });
    if (result === true) continue;
    if (!result.allowed) retryAfter = Math.max(retryAfter, result.retryAfter);
  }
  return { allowed: retryAfter === 0, retryAfter };
}
export async function passwordResetEmailThrottle(email) {
  const now = Date.now();
  const waitMs = 5 * 60 * 1000;
  const identity = crypto.createHmac('sha256', challengePepper()).update(String(email).trim().toLowerCase()).digest('hex');
  return stateTransaction(stateKey('password-reset-email', identity), async current => {
    const nextAllowedAt = current?.nextAllowedAt || 0;
    if (nextAllowedAt > now) return { value: current, expires: nextAllowedAt, result: { allowed: false, retryAfter: Math.ceil((nextAllowedAt - now) / 1000) } };
    const value = { nextAllowedAt: now + waitMs };
    return { value, expires: value.nextAllowedAt, result: { allowed: true, retryAfter: waitMs / 1000 } };
  });
}

export async function actionThrottle(kind, identity, limit, windowMs) {
  return stateTransaction(stateKey(kind, identity), async current => {
    const value = current || { count: 0, expiresAt: Date.now() + windowMs }
    const expiresAt = value.expiresAt || Date.now() + windowMs;
    if (value.count >= limit) return { value, expires: expiresAt, result: { allowed: false, retryAfter: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)) } }
    value.count += 1
    return { value, expires: expiresAt, result: { allowed: true, retryAfter: 0 } }
  })
}
export async function issueCode(email, purpose, payload) {
  const id = crypto.randomBytes(24).toString('hex'), code = generateVerificationCode();
  const digest = verificationCodeDigest(id, code);
  const message = verificationMessage(code, purpose);
  const now = Date.now();
  const expiresAt = now + verificationCodeLifetimeMs;
  const pendingExpiresAt = now + verificationChallengeLifetimeMs;
  const nextResendAt = now + verificationResendCooldownMs;
  await putState(stateKey('challenge', id), {
    digest,
    purpose,
    payload,
    attempts: 0,
    expiresAt,
    pendingExpiresAt,
    nextResendAt,
    resendCount: 0,
    resendWindowStartedAt: now,
  }, verificationChallengeLifetimeMs);
  try {
    await deliverVerificationEmail(email, message);
  } catch (error) {
    await stateTransaction(stateKey('challenge', id), async () => ({ value: null }));
    throw error;
  }
  return id;
}
export async function issueSmsCode(mobile, purpose, payload) {
  const id = crypto.randomBytes(24).toString('hex'), code = generateVerificationCode();
  const digest = verificationCodeDigest(id, code);
  const expiresAt = Date.now() + 600000;
  await putState(stateKey('challenge', id), { digest, purpose, payload, attempts: 0, expiresAt }, 600000);
  try {
    await sendSms(mobile, `${config.get('general.name')} verification code: ${code}. It expires in 10 minutes.`);
  } catch (error) {
    await stateTransaction(stateKey('challenge', id), async () => ({ value: null }));
    throw error;
  }
  return id;
}

const resendError = (reason, retryAfter = 0) => ({ ok: false, reason, retryAfter: Math.max(0, Math.ceil(Number(retryAfter) || 0)) });

/**
 * Reserve, queue, and atomically replace a login verification code. The
 * reservation prevents concurrent browser clicks or workers from queueing
 * duplicate messages while keeping the previous code usable if queueing fails.
 */
export async function resendCode(id, purpose, email, { accountIdentity } = {}) {
  if (!challengeIdPattern.test(String(id))) return resendError('expired');
  const key = stateKey('challenge', id);
  const current = await readState(key);
  const now = Date.now();
  if (!current || current.purpose !== purpose || Number(current.pendingExpiresAt || current.expiresAt || 0) <= now) return resendError('expired');
  if (Number(current.resendPending?.until || 0) > now) return resendError('cooldown', Math.ceil((current.resendPending.until - now) / 1000));
  if (Number(current.nextResendAt || 0) > now) return resendError('cooldown', Math.ceil((current.nextResendAt - now) / 1000));

  const windowStartedAt = Number(current.resendWindowStartedAt || now);
  const withinWindow = windowStartedAt + verificationResendWindowMs > now;
  const resendCount = withinWindow ? Number(current.resendCount || 0) : 0;
  if (resendCount >= verificationResendLimit) return resendError('limit', Math.ceil((windowStartedAt + verificationResendWindowMs - now) / 1000));

  if (accountIdentity) {
    const accountThrottle = await actionThrottle('otp-resend-account', accountIdentity, verificationResendLimit, verificationResendWindowMs);
    if (!accountThrottle.allowed) return resendError('limit', accountThrottle.retryAfter);
  }

  const reservation = await stateTransaction(key, async value => {
    const currentValue = value;
    const currentNow = Date.now();
    if (!currentValue || currentValue.purpose !== purpose || Number(currentValue.pendingExpiresAt || currentValue.expiresAt || 0) <= currentNow) {
      return { value: null, result: resendError('expired') };
    }
    if (Number(currentValue.resendPending?.until || 0) > currentNow) return { value: currentValue, expires: currentValue.pendingExpiresAt || currentNow + verificationChallengeLifetimeMs, result: resendError('cooldown', Math.ceil((currentValue.resendPending.until - currentNow) / 1000)) };
    if (Number(currentValue.nextResendAt || 0) > currentNow) return { value: currentValue, expires: currentValue.pendingExpiresAt || currentNow + verificationChallengeLifetimeMs, result: resendError('cooldown', Math.ceil((currentValue.nextResendAt - currentNow) / 1000)) };
    const windowStart = Number(currentValue.resendWindowStartedAt || currentNow);
    const activeWindow = windowStart + verificationResendWindowMs > currentNow;
    const count = activeWindow ? Number(currentValue.resendCount || 0) : 0;
    if (count >= verificationResendLimit) return { value: currentValue, expires: currentValue.pendingExpiresAt || currentNow + verificationChallengeLifetimeMs, result: resendError('limit', Math.ceil((windowStart + verificationResendWindowMs - currentNow) / 1000)) };

    const replacementId = crypto.randomBytes(16).toString('hex');
    const replacementCode = generateVerificationCode();
    const replacementDigest = verificationCodeDigest(id, replacementCode);
    const nextResendAt = currentNow + verificationResendCooldownMs;
    const pendingExpiresAt = Number(currentValue.pendingExpiresAt || currentNow + verificationChallengeLifetimeMs);
    return {
      value: {
        ...currentValue,
        nextResendAt,
        resendCount: count + 1,
        resendWindowStartedAt: activeWindow ? windowStart : currentNow,
        resendPending: { id: replacementId, digest: replacementDigest, until: nextResendAt },
      },
      expires: pendingExpiresAt,
      result: { ok: true, status: 'reserved', replacementId, replacementCode, replacementDigest, nextResendAt, pendingExpiresAt },
    };
  });

  if (!reservation?.ok || reservation.status !== 'reserved') return reservation || resendError('unavailable');
  const message = verificationMessage(reservation.replacementCode, purpose);
  try {
    await deliverVerificationEmail(email, message);
  } catch {
    await stateTransaction(key, async value => {
      if (!value || value.resendPending?.id !== reservation.replacementId) return { value, expires: value?.pendingExpiresAt || Date.now() + verificationChallengeLifetimeMs, result: resendError('delivery_failed') };
      const restored = { ...value, nextResendAt: Date.now(), resendPending: null };
      return { value: restored, expires: restored.pendingExpiresAt || Date.now() + verificationChallengeLifetimeMs, result: resendError('delivery_failed') };
    }).catch(() => {});
    return resendError('delivery_failed');
  }

  return stateTransaction(key, async value => {
    if (!value || value.resendPending?.id !== reservation.replacementId) return { value, expires: value?.pendingExpiresAt || Date.now() + verificationChallengeLifetimeMs, result: resendError('unavailable') };
    const replaced = {
      ...value,
      digest: reservation.replacementDigest,
      attempts: 0,
      expiresAt: Date.now() + verificationCodeLifetimeMs,
      resendPending: null,
    };
    return { value: replaced, expires: replaced.pendingExpiresAt || Date.now() + verificationChallengeLifetimeMs, result: { ok: true, nextResendAt: replaced.nextResendAt, retryAfter: Math.ceil((replaced.nextResendAt - Date.now()) / 1000) } };
  });
}

export async function verifyCode(id, code, purpose) {
  if (!/^[a-f0-9]{48}$/.test(String(id)) || !/^\d{6}$/.test(String(code))) return null;
  return stateTransaction(stateKey('challenge', id), async value => {
    const now = Date.now();
    if (!value) return { value: null, result: null };
    if (value.expiresAt && value.expiresAt <= now) {
      // Keep the pending login attempt alive after the code expires so the
      // user can request a replacement without restarting sign-in.
      if (value.purpose === 'login' && Number(value.pendingExpiresAt || 0) > now) return { value, expires: value.pendingExpiresAt, result: null };
      return { value: null, result: null };
    }
    const expiresAt = value.expiresAt || Date.now() + 600000;
    // A challenge submitted to the wrong action must not become usable for
    // that action, and must not invalidate the legitimate purpose's challenge.
    if (value.purpose !== purpose) return { value, expires: expiresAt, result: null };
    const digest = verificationCodeDigest(id, code);
    const actual = Buffer.from(digest, 'hex');
    const expected = Buffer.from(value.digest || '', 'hex');
    if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) return { value: null, result: value.payload };
    value.attempts++;
    if (value.attempts >= 5 && value.purpose === 'login' && Number(value.pendingExpiresAt || 0) > now) {
      return { value: { ...value, digest: '', expiresAt: now, attempts: value.attempts }, expires: value.pendingExpiresAt, result: null };
    }
    return { value: value.attempts >= 5 ? null : value, expires: expiresAt, result: null };
  });
}
