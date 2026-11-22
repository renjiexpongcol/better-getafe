import { config } from '../config/index.js';
import { contactAcknowledgementTemplate } from '../email/templates/contactAcknowledgement.js';
import { dependencyReason } from './startupDiagnostics.js';
let transport;
const smtpFailure = error => ({
  code: String(error?.code || error?.name || 'SMTP_CONNECTION_ERROR').slice(0, 48),
  cause_code: String(error?.cause?.code || error?.originalError?.code || error?.errno || '').slice(0, 48) || null,
  command: String(error?.command || '').slice(0, 24) || null,
  reason: dependencyReason(error),
});
export async function buildEmail(values, { allowUnavailable = false } = {}) {
  if (!values['email.enabled']) return null;
  if (!values['email.smtpHost'] || !values['email.senderEmail']) throw new Error('SMTP host and sender email are required.');
  if (process.env.NODE_ENV === 'production' && values['email.security'] === 'none') throw new Error('SMTP TLS is required in production.');
  const { default: nodemailer } = await import('nodemailer');
  const candidate = nodemailer.createTransport({ host: values['email.smtpHost'], port: values['email.smtpPort'], secure: values['email.security'] === 'tls', requireTLS: values['email.security'] === 'starttls', ignoreTLS: values['email.security'] === 'none', auth: values['email.username'] ? { user: values['email.username'], pass: values['email.password'] } : undefined, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, logger: false, debug: false });
  try { await candidate.verify(); return candidate; }
  catch (error) {
    if (allowUnavailable) {
      console.error(JSON.stringify({ event: 'smtp_startup_degraded', pid: process.pid, ...smtpFailure(error) }));
      candidate.degraded = true;
      candidate.failureReason = dependencyReason(error);
      return candidate;
    }
    candidate.close(); throw new Error('SMTP connection failed. Check host, TLS settings and credentials.', { cause: error });
  }
}
export function activateEmail(value) { const previous = transport; transport = value; previous?.close(); }
export function emailHealth() { return { status: !transport ? 'disabled' : transport.degraded ? 'degraded' : 'healthy', reason: transport?.degraded ? transport.failureReason : undefined }; }
let nextVerification = 0, verifying, verificationFailures = 0, lastVerificationLogAt = 0;
export function retryEmailVerification() {
  if (!transport?.degraded || verifying || Date.now() < nextVerification) return;
  const candidate = transport;
  nextVerification = Date.now() + 60000;
  verifying = candidate.verify().then(() => {
    candidate.degraded = false;
    verificationFailures = 0;
    console.info(JSON.stringify({ event: 'smtp_recovered', pid: process.pid }));
  })
    .catch(error => {
      candidate.failureReason = dependencyReason(error);
      verificationFailures++;
      if (Date.now() - lastVerificationLogAt >= 300000) {
        console.warn(JSON.stringify({ event: 'smtp_retry_failed', pid: process.pid, retry_count: verificationFailures, next_retry_ms: 60000, ...smtpFailure(error) }));
        lastVerificationLogAt = Date.now();
      }
    })
    .finally(() => { verifying = undefined; });
}
export async function sendEmail(to, subject, text, candidate = transport, values = config.values, attachments = [], html = undefined) {
  if (!candidate) throw Object.assign(new Error('Email is not configured.'), { code: 'DEPENDENCY_UNAVAILABLE', status: 503 });
  const result = await candidate.sendMail({ from: { name: 'Getafe Citizen Portal', address: values['email.senderEmail'] }, to, replyTo: values['email.replyTo'] || undefined, subject, text, html, attachments });
  candidate.degraded = false;
  return result;
}

export async function sendContactAcknowledgement({ to, recipientName, referenceNumber, category, subject, submittedAt }) {
  const values = config.values;
  const template = contactAcknowledgementTemplate({
    recipientName,
    referenceNumber,
    category,
    subject,
    submittedAt,
    portalName: values['general.name'] || 'Municipality of Getafe',
    logoUrl: values['general.logo'] || undefined,
  });
  return sendEmail(to, `We received your message – ${values['general.name'] || 'Municipality of Getafe'}`, template.text, transport, values, [], template.html);
}
