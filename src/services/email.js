import { config } from '../config/index.js';
let transport;
export async function buildEmail(values) {
  if (!values['email.enabled']) return null;
  if (!values['email.smtpHost'] || !values['email.senderEmail']) throw new Error('SMTP host and sender email are required.');
  if (process.env.NODE_ENV === 'production' && values['email.security'] === 'none') throw new Error('SMTP TLS is required in production.');
  const { default: nodemailer } = await import('nodemailer');
  const candidate = nodemailer.createTransport({ host: values['email.smtpHost'], port: values['email.smtpPort'], secure: values['email.security'] === 'tls', requireTLS: values['email.security'] === 'starttls', ignoreTLS: values['email.security'] === 'none', auth: values['email.username'] ? { user: values['email.username'], pass: values['email.password'] } : undefined, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, logger: false, debug: false });
  try { await candidate.verify(); return candidate; }
  catch { candidate.close(); throw new Error('SMTP connection failed. Check host, TLS settings and credentials.'); }
}
export function activateEmail(value) { const previous = transport; transport = value; previous?.close(); }
export async function sendEmail(to, subject, text, candidate = transport, values = config.values, attachments = [], html = undefined) {
  if (!candidate) throw new Error('Email is not configured.');
  return candidate.sendMail({ from: { name: values['email.senderName'], address: values['email.senderEmail'] }, to, replyTo: values['email.replyTo'] || undefined, subject, text, html, attachments });
}
