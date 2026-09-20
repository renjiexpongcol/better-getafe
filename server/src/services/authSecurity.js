import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { stateKey, stateTransaction, putState } from './authState.js';
import { sendEmail } from './email.js';
import { sendSms } from './sms.js';
export async function loginThrottle(email, failed) {
  return stateTransaction(stateKey('attempts', email), async current => {
    const value = current || { count: 0, until: 0 };
    if (value.until > Date.now()) return { value, expires: value.until, result: false };
    if (failed === false) return { value: null, result: true };
    if (failed === true) value.count++;
    if (value.count >= config.get('authentication.failedLoginLimit')) value.until = Date.now() + config.get('authentication.lockoutMinutes') * 60000;
    return { value, expires: Date.now() + config.get('authentication.lockoutMinutes') * 60000, result: true };
  });
}
export async function passwordResetEmailThrottle(email) {
  const now = Date.now();
  const waitMs = 5 * 60 * 1000;
  return stateTransaction(stateKey('password-reset-email', email), async current => {
    const nextAllowedAt = current?.nextAllowedAt || 0;
    if (nextAllowedAt > now) return { value: current, expires: nextAllowedAt, result: { allowed: false, retryAfter: Math.ceil((nextAllowedAt - now) / 1000) } };
    const value = { nextAllowedAt: now + waitMs };
    return { value, expires: value.nextAllowedAt, result: { allowed: true, retryAfter: waitMs / 1000 } };
  });
}

export async function actionThrottle(kind, identity, limit, windowMs) {
  return stateTransaction(stateKey(kind, identity), async current => {
    const value = current || { count: 0 }
    if (value.count >= limit) return { value, expires: Date.now() + windowMs, result: false }
    value.count += 1
    return { value, expires: Date.now() + windowMs, result: true }
  })
}
export async function issueCode(email, purpose, payload) {
  const id = crypto.randomBytes(24).toString('hex'), code = crypto.randomInt(100000, 1000000).toString();
  const digest = crypto.createHash('sha256').update(`${id}:${code}`).digest('hex');
  await sendEmail(email, `${config.get('general.name')} verification code`, `Your code is ${code}. It expires in 10 minutes.`);
  await putState(stateKey('challenge', id), { digest, purpose, payload, attempts: 0 }, 600000);
  return id;
}
export async function issueSmsCode(mobile, purpose, payload) {
  const id = crypto.randomBytes(24).toString('hex'), code = crypto.randomInt(100000, 1000000).toString();
  const digest = crypto.createHash('sha256').update(`${id}:${code}`).digest('hex');
  await sendSms(mobile, `${config.get('general.name')} verification code: ${code}. It expires in 10 minutes.`);
  await putState(stateKey('challenge', id), { digest, purpose, payload, attempts: 0 }, 600000);
  return id;
}
export async function verifyCode(id, code, purpose) {
  return stateTransaction(stateKey('challenge', id), async value => {
    if (!value || value.purpose !== purpose) return { value: null, result: null };
    const digest = crypto.createHash('sha256').update(`${id}:${code}`).digest('hex');
    if (digest === value.digest) return { value: null, result: value.payload };
    value.attempts++;
    return { value: value.attempts >= 5 ? null : value, expires: Date.now() + 600000, result: null };
  });
}
