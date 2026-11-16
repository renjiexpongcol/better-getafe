import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { createContactMessage, updateContactAcknowledgement } from '../repositories/contactMessagesRepository.js';
import { stateKey, stateTransaction } from './authState.js';
import { resolveClient } from './trafficProtection.js';
import { sendContactAcknowledgement, sendEmail } from './email.js';
import { verifyRecaptchaToken } from './recaptchaVerification.js';

const windows = { short: 10 * 60 * 1000, daily: 24 * 60 * 60 * 1000 };
function rateLimit(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`)
  return value
}
const limits = { short: rateLimit('CONTACT_RATE_LIMIT_10M', 5), daily: rateLimit('CONTACT_RATE_LIMIT_24H', 20) };

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function consumeContactRate(scope, client) {
  const key = stateKey(`contact-rate-${scope}`, client);
  return stateTransaction(key, async (current) => {
    const now = Date.now();
    const timestamps = Array.isArray(current) ? current.filter((stamp) => Number.isFinite(stamp) && stamp > now - windows.daily) : [];
    const shortCount = timestamps.filter((stamp) => stamp > now - windows.short).length;
    const dailyCount = timestamps.length;
    if (shortCount >= limits.short || dailyCount >= limits.daily) {
      const oldest = shortCount >= limits.short ? timestamps.find((stamp) => stamp > now - windows.short) : timestamps[0];
      return { value: timestamps, expires: (timestamps[0] || now) + windows.daily, result: { allowed: false, retryAfter: Math.max(1, Math.ceil((oldest + (shortCount >= limits.short ? windows.short : windows.daily) - now) / 1000)) } };
    }
    const next = [...timestamps, now];
    return { value: next, expires: now + windows.daily, result: { allowed: true } };
  });
}

async function verifyCaptcha(token) {
  if (config.get('security.contactCaptcha') !== true) return true;
  return verifyRecaptchaToken(token, 'contact');
}

function referenceNumber() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const token = [...crypto.randomBytes(6)].map(byte => alphabet[byte % alphabet.length]).join('');
  return `GETAFE-CON-${new Date().getFullYear()}-${token}`;
}

export function installContactRoutes(app) {
  app.post('/api/contact/data-correction', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const name = text(body.name), email = text(body.email).toLowerCase()
    const barangay = text(body.barangay), field = text(body.field)
    const currentValue = text(body.currentValue).slice(0, 500)
    const correctedValue = text(body.correctedValue).slice(0, 500)
    const details = text(body.details).slice(0, 2000)
    const fields = new Set(['Postal code', 'Population', 'Punong Barangay', 'Other barangay information'])
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !barangay || barangay.length > 100 || !fields.has(field) || !correctedValue) {
      return res.status(400).json({ error: 'Complete your name, valid email, barangay, and the corrected information.' })
    }
    const client = resolveClient(req).value
    const ipRate = await consumeContactRate('data-correction-ip', client)
    if (!ipRate.allowed) { res.set('Retry-After', String(ipRate.retryAfter)); return res.status(429).json({ error: 'Too many reports. Please try again later.' }) }
    const rate = await consumeContactRate('data-correction-email', crypto.createHash('sha256').update(email).digest('hex'))
    if (!rate.allowed) { res.set('Retry-After', String(rate.retryAfter)); return res.status(429).json({ error: 'Too many reports. Please try again later.' }) }
    if (!(await verifyCaptcha(text(body.captchaToken)))) return res.status(400).json({ error: 'Please complete the verification and try again.' })
    const reference = referenceNumber(), submittedAt = new Date()
    const subject = `Barangay data correction · ${barangay}`
    const message = `Data correction report\nBarangay: ${barangay}\nField: ${field}\nCurrent value: ${currentValue || '(not shown)'}\nSuggested value: ${correctedValue}\nDetails: ${details || '(none provided)'}\nPage: ${String(body.pageUrl || '').slice(0, 1000)}\nReference: ${reference}`
    try { await createContactMessage({ referenceNumber: reference, name, email, category: 'Website data correction', subject, message }) }
    catch (error) { console.error('Unable to store barangay data correction:', error.safeMessage || error.message); return res.status(503).json({ error: 'We couldn’t store your report right now. Please try again.' }) }
    const recipient = process.env.CONTACT_NOTIFICATION_EMAIL || config.get('general.supportEmail')
    if (recipient && config.get('email.enabled') === true) void sendEmail(recipient, `Website data correction · ${reference}`, `Name: ${name}\nEmail: ${email}\n${message}`).catch(error => console.error('Data correction notification failed:', error.message))
    return res.status(201).json({ message: 'Your report has been received for review.', referenceNumber: reference })
  })

  app.post('/api/contact', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (text(body.website)) {
      console.warn(JSON.stringify({ event: 'contact.honeypot_triggered', ip: resolveClient(req).value }));
      return res.status(400).json({ error: 'Invalid submission.' });
    }

    const name = text(body.name);
    const email = text(body.email).toLowerCase();
    const category = text(body.category);
    const subject = text(body.subject);
    const message = text(body.message);
    const errors = {};
    if (!name) errors.name = 'Name is required.';
    else if (name.length > 100) errors.name = 'Name must be 100 characters or fewer.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'A valid email is required.';
    else if (email.length > 254) errors.email = 'E-mail must be 254 characters or fewer.';
    if (!String(config.get('contact.categories') || '').split('\n').map(value => value.trim()).filter(Boolean).includes(category)) errors.category = 'Select a valid category.';
    if (!subject) errors.subject = 'Subject is required.';
    else if (subject.length > 200) errors.subject = 'Subject must be 200 characters or fewer.';
    if (!message) errors.message = 'Message is required.';
    else if (message.length > 5000) errors.message = 'Message must be 5,000 characters or fewer.';
    if (Object.keys(errors).length) {
      console.warn(JSON.stringify({ event: 'contact.validation_failed', fields: Object.keys(errors), ip: resolveClient(req).value }));
      return res.status(400).json({ error: 'Please correct the highlighted fields.', fields: errors });
    }

    const client = resolveClient(req).value;
    const ipRate = await consumeContactRate('ip', client);
    if (!ipRate.allowed) {
      console.warn(JSON.stringify({ event: 'contact.rate_limited', ip: client }));
      res.set('Retry-After', String(ipRate.retryAfter));
      return res.status(429).json({ error: 'Too many messages. Please try again later.' });
    }
    const rate = await consumeContactRate('email', crypto.createHash('sha256').update(email).digest('hex'));
    if (!rate.allowed) {
      console.warn(JSON.stringify({ event: 'contact.rate_limited', ip: client }));
      res.set('Retry-After', String(rate.retryAfter));
      return res.status(429).json({ error: 'Too many messages. Please try again later.' });
    }
    if (!(await verifyCaptcha(text(body.captchaToken)))) {
      console.warn(JSON.stringify({ event: 'contact.bot_verification_failed', ip: resolveClient(req).value }));
      return res.status(400).json({ error: 'Please complete the verification and try again.' });
    }

    const reference = referenceNumber();
    const submittedAt = new Date();
    try {
      await createContactMessage({ referenceNumber: reference, name, email, category, subject, message });
    } catch (error) {
      console.error('Unable to store contact message:', error.safeMessage || error.message);
      return res.status(503).json({ error: 'We couldn\'t send your message right now. Please try again.' });
    }

    console.info(`[contact] submission accepted ref=${reference}`);
    const emailEnabled = config.get('email.enabled') === true;
    let acknowledgementStatus = 'disabled';
    if (emailEnabled) {
      try {
        await sendContactAcknowledgement({ to: email, recipientName: name, referenceNumber: reference, category, subject, submittedAt: submittedAt.toLocaleString(config.get('general.locale') || 'en-PH', { timeZone: config.get('general.timezone') || 'Asia/Manila', dateStyle: 'long', timeStyle: 'short' }) });
        acknowledgementStatus = 'sent';
        console.info(`[email] contact acknowledgement sent ref=${reference}`);
        try { await updateContactAcknowledgement(reference, 'sent', new Date()); } catch (error) { console.error(`[contact] acknowledgement status update failed ref=${reference}`); }
      } catch (error) {
        acknowledgementStatus = 'failed';
        console.error(`[email] contact acknowledgement failed ref=${reference}`);
        try { await updateContactAcknowledgement(reference, 'failed'); } catch (metadataError) { console.error(`[contact] acknowledgement status update failed ref=${reference}`); }
      }
    } else {
      try { await updateContactAcknowledgement(reference, 'disabled'); } catch (error) { console.error(`[contact] acknowledgement status update failed ref=${reference}`); }
      console.info(`[email] contact acknowledgement skipped ref=${reference} reason=smtp_disabled`);
    }

    const recipient = process.env.CONTACT_NOTIFICATION_EMAIL || config.get('general.supportEmail');
    if (recipient && emailEnabled) {
      void sendEmail(recipient, `New contact message · ${reference}`, `Reference: ${reference}\nName: ${name}\nE-mail: ${email}\nCategory: ${category}\nSubject: ${subject}\nMessage:\n${message}\nSubmitted: ${submittedAt.toISOString()}`).catch((error) => console.error('Contact notification failed:', error.message));
    }
    return res.status(201).json({ message: 'Your message has been received.', referenceNumber: reference, acknowledgementStatus });
  });
}
