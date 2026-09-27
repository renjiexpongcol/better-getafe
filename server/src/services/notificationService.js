import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { readState, stateKey } from './authState.js';
import { enqueueEmail } from './redisInfrastructure.js';
import { getPostgresRuntime } from '../repositories/postgresRuntime.js';
import { getPortalUserById } from '../repositories/portalUserRepository.js';
import { id, now } from './identifiers.js';
import { notificationTemplate } from '../email/templates/notification.js';

export const notificationCategories = Object.freeze({
  request: 'request_updates',
  appointment: 'appointment_updates',
  document: 'document_updates',
  payment: 'payment_updates',
  announcement: 'municipal_announcements',
  event: 'event_updates',
  account: 'account_updates',
});

const supportedTypes = new Set([
  'request.created', 'request.received', 'request.status_changed', 'request.approved', 'request.rejected', 'request.completed',
  'appointment.requested', 'appointment.confirmed', 'appointment.rescheduled', 'appointment.cancelled', 'appointment.reminder',
  'document.received', 'document.processing', 'document.ready', 'document.rejected',
  'payment.completed', 'payment.failed', 'payment.refunded', 'payment.requires_attention',
  'announcement.important', 'event.updated', 'event.cancelled', 'account.update',
]);

const categoryFor = type => notificationCategories[String(type || '').split('.')[0]] || null;
const isValidEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
const timestamp = () => now();

function booleanValue(value, fallback) {
  return value === undefined ? fallback : value === true || value === 1 || value === 'true';
}

function preferenceView(row, email, emailVerified) {
  const result = {
    emailEnabled: booleanValue(row?.email_enabled, true),
    emailVerified: Boolean(emailVerified),
    email: email || null,
    requestUpdates: booleanValue(row?.request_updates, true),
    appointmentUpdates: booleanValue(row?.appointment_updates, true),
    documentUpdates: booleanValue(row?.document_updates, true),
    paymentUpdates: booleanValue(row?.payment_updates, true),
    serviceUpdates: booleanValue(row?.service_updates, true),
    municipalAnnouncements: booleanValue(row?.municipal_announcements, true),
    eventUpdates: booleanValue(row?.event_updates, false),
    accountUpdates: booleanValue(row?.account_updates, true),
  };
  return { ...result, categories: {
    requests: result.requestUpdates,
    appointments: result.appointmentUpdates,
    documents: result.documentUpdates,
    payments: result.paymentUpdates,
    services: result.serviceUpdates,
    municipalAnnouncements: result.municipalAnnouncements,
    events: result.eventUpdates,
    account: result.accountUpdates,
  } };
}

async function emailVerificationState(userId) {
  try {
    const user = await getPortalUserById(userId);
    if (user?.email_verified_at) return true;
  } catch { /* Continue with the existing verification stores. */ }
  try {
    if (await readState(stateKey('verified', userId))) return true;
  } catch { /* A missing verification state is intentionally treated as unverified. */ }
  try {
    const db = await getPostgresRuntime('portal');
    const profile = await db.prepare('SELECT identity_verified FROM google_profiles WHERE user_id = ?').get(userId);
    return profile?.identity_verified === true || profile?.identity_verified === 1;
  } catch { return false; }
}

export async function getNotificationPreferences(userId) {
  const db = await getPostgresRuntime('portal');
  const user = await getPortalUserById(userId);
  let row = await db.prepare('SELECT * FROM user_notification_preferences WHERE user_id = ?').get(userId);
  const profile = await db.prepare('SELECT email_notifications, sms_notifications FROM resident_profiles WHERE user_id = ?').get(userId);
  if (!row) {
    const legacy = await db.prepare('SELECT email_notifications FROM resident_profiles WHERE user_id = ?').get(userId);
    const enabled = legacy?.email_notifications === undefined ? true : booleanValue(legacy.email_notifications, true);
    const created = timestamp();
    await db.prepare('INSERT INTO user_notification_preferences (user_id,email_enabled,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO NOTHING').run(userId, enabled, created, created);
    row = await db.prepare('SELECT * FROM user_notification_preferences WHERE user_id = ?').get(userId);
  }
  return { ...preferenceView(row, user?.email, await emailVerificationState(userId)), smsNotifications: booleanValue(profile?.sms_notifications, false) };
}

export async function saveNotificationPreferences(userId, input = {}) {
  const db = await getPostgresRuntime('portal');
  const current = await db.prepare('SELECT * FROM user_notification_preferences WHERE user_id = ?').get(userId);
  const legacy = current ? null : await db.prepare('SELECT email_notifications FROM resident_profiles WHERE user_id = ?').get(userId);
  const currentView = preferenceView(current || { email_enabled: legacy?.email_notifications ?? true }, null, false);
  const aliases = {
    emailEnabled: 'email_enabled', requestUpdates: 'request_updates', appointmentUpdates: 'appointment_updates',
    documentUpdates: 'document_updates', paymentUpdates: 'payment_updates', serviceUpdates: 'service_updates',
    municipalAnnouncements: 'municipal_announcements', eventUpdates: 'event_updates', accountUpdates: 'account_updates',
  };
  const values = Object.fromEntries(Object.entries(aliases).map(([camel, column]) => [column, input[camel] === undefined ? currentView[camel] : input[camel] === true]));
  const created = current?.created_at || timestamp();
  const updated = timestamp();
  await db.prepare(`INSERT INTO user_notification_preferences
    (user_id,email_enabled,request_updates,appointment_updates,document_updates,payment_updates,service_updates,municipal_announcements,event_updates,account_updates,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET email_enabled=excluded.email_enabled,request_updates=excluded.request_updates,appointment_updates=excluded.appointment_updates,document_updates=excluded.document_updates,payment_updates=excluded.payment_updates,service_updates=excluded.service_updates,municipal_announcements=excluded.municipal_announcements,event_updates=excluded.event_updates,account_updates=excluded.account_updates,updated_at=excluded.updated_at`).run(
    userId, values.email_enabled, values.request_updates, values.appointment_updates, values.document_updates, values.payment_updates, values.service_updates, values.municipal_announcements, values.event_updates, values.account_updates, created, updated,
  );
  // Keep the existing profile projection in sync for older consumers of the
  // dashboard API while the normalized preference record is authoritative.
  await db.prepare('UPDATE resident_profiles SET email_notifications = ?, updated_at = ? WHERE user_id = ?').run(values.email_enabled, updated, userId).catch(() => {});
  return getNotificationPreferences(userId);
}

export function notificationEventKey(type, data = {}, eventId = '') {
  const identity = eventId || data.eventId || data.applicationId || data.documentId || data.appointmentId || data.paymentId || crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 24);
  return `${String(type)}:${String(identity).slice(0, 180)}`;
}

export async function createInAppNotification({ db, userId, type, title, message, applicationId = null, documentId = null, eventKey = null, userVisible = true }) {
  if (!userVisible) return { id: null, eventKey };
  if (!supportedTypes.has(type)) throw new Error(`Unsupported notification type: ${type}`);
  const key = eventKey || notificationEventKey(type, { applicationId, documentId, message });
  const notificationId = id();
  await db.prepare(`INSERT INTO notifications (id,user_id,title,message,application_id,document_id,type,event_key,created_at)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`).run(notificationId, userId, title, message, applicationId, documentId, type, key, timestamp());
  const existing = await db.prepare('SELECT id FROM notifications WHERE user_id = ? AND event_key = ?').get(userId, key);
  return { id: existing?.id || notificationId, eventKey: key };
}

async function recordDelivery({ db, userId, type, eventKey, status, reason = null, notificationId = null }) {
  const deliveryId = id();
  const result = await db.prepare(`INSERT INTO notification_deliveries
    (id,notification_id,user_id,channel,type,deduplication_key,status,reason,queued_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (channel,deduplication_key) DO NOTHING`).run(
    deliveryId, notificationId, userId, 'email', type, eventKey, status, reason, status === 'queued' ? timestamp() : null, timestamp(),
  );
  const delivery = await db.prepare('SELECT * FROM notification_deliveries WHERE channel = ? AND deduplication_key = ?').get('email', eventKey);
  return delivery ? { ...delivery, inserted: result.changes === 1 } : delivery;
}

export async function queueOptionalNotification({ userId, type, data = {}, eventId = '', applicationId = null, documentId = null, notificationId = null }) {
  if (!supportedTypes.has(type)) throw new Error(`Unsupported notification type: ${type}`);
  const db = await getPostgresRuntime('portal');
  const eventKey = notificationEventKey(type, data, eventId);
  const preferences = await getNotificationPreferences(userId);
  const recipient = await getPortalUserById(userId);
  const category = categoryFor(type);
  const enabled = category ? preferences[category === 'request' ? 'requestUpdates' : category === 'appointment' ? 'appointmentUpdates' : category === 'document' ? 'documentUpdates' : category === 'payment' ? 'paymentUpdates' : category === 'announcement' ? 'municipalAnnouncements' : category === 'event' ? 'eventUpdates' : 'accountUpdates'] : false;
  const eligible = Boolean(config.get('notifications.enabled') && config.get('notifications.emailEnabled') && preferences.emailEnabled && enabled && preferences.emailVerified && isValidEmail(preferences.email));
  if (!eligible) {
    const reason = !preferences.emailVerified ? 'email_unverified' : !preferences.emailEnabled || !enabled ? 'user_preference' : 'system_disabled';
    return { status: 'suppressed', delivery: await recordDelivery({ db, userId, type, eventKey, status: 'suppressed', reason, notificationId }) };
  }
  const template = notificationTemplate({ type, data: { ...data, name: data.name || recipient?.name }, portalName: config.get('general.name') || 'Municipality of Getafe', portalUrl: config.get('general.url') || '' });
  const delivery = await recordDelivery({ db, userId, type, eventKey, status: 'queued', notificationId });
  if (!delivery?.inserted || delivery.status !== 'queued' || delivery.sent_at) return { status: delivery?.status || 'queued', delivery };
  try {
    await enqueueEmail({
      to: preferences.email,
      subject: template.subject,
      text: template.text,
      html: template.html,
      deliveryId: delivery.id,
      notificationType: type,
      priority: type.startsWith('announcement.') || type.startsWith('event.') ? 'low' : 'normal',
    }, { priority: type.startsWith('announcement.') || type.startsWith('event.') ? 'low' : 'normal' });
    return { status: 'queued', delivery };
  } catch (error) {
    await markNotificationDeliveryFailed(delivery.id, error);
    throw error;
  }
}

export async function markNotificationDeliverySent(deliveryId) {
  if (!deliveryId) return;
  const db = await getPostgresRuntime('portal');
  await db.prepare("UPDATE notification_deliveries SET status = 'sent', sent_at = ?, failure_code = NULL WHERE id = ? AND status <> 'sent'").run(timestamp(), deliveryId);
}

export async function markNotificationDeliveryFailed(deliveryId, error) {
  if (!deliveryId) return;
  const db = await getPostgresRuntime('portal');
  await db.prepare("UPDATE notification_deliveries SET status = 'failed', failed_at = ?, failure_code = ? WHERE id = ? AND status <> 'sent'").run(timestamp(), String(error?.code || error?.name || 'delivery_failed').slice(0, 128), deliveryId);
}

// Queue jobs can outlive a preference change. Re-check the account and the
// optional channel immediately before delivery so a queued message cannot
// bypass a later opt-out or a revoked email address.
export async function validateQueuedNotification(deliveryId) {
  if (!deliveryId) return true;
  const db = await getPostgresRuntime('portal');
  const delivery = await db.prepare('SELECT user_id, type, deduplication_key, status FROM notification_deliveries WHERE id = ?').get(deliveryId);
  if (!delivery || delivery.status !== 'queued') return false;
  let preferences;
  try { preferences = await getNotificationPreferences(delivery.user_id); } catch { throw new Error('Notification recipient could not be loaded.'); }
  const category = categoryFor(delivery.type);
  const enabledKey = category === 'request' ? 'requestUpdates' : category === 'appointment' ? 'appointmentUpdates' : category === 'document' ? 'documentUpdates' : category === 'payment' ? 'paymentUpdates' : category === 'announcement' ? 'municipalAnnouncements' : category === 'event' ? 'eventUpdates' : 'accountUpdates';
  if (!preferences.email || !preferences.emailVerified || !preferences.emailEnabled || !preferences[enabledKey]) {
    await db.prepare("UPDATE notification_deliveries SET status = 'suppressed', reason = 'user_preference', failed_at = NULL WHERE id = ? AND status = 'queued'").run(deliveryId);
    return false;
  }
  return true;
}

export const isOptionalNotificationType = type => supportedTypes.has(type);
