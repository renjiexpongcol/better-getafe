import crypto from 'node:crypto';
import { newsletterWelcomeEmail } from '../email/templates/newsletterWelcome.js';

const validToken = token => /^[A-Za-z0-9_-]{40,60}$/.test(token);

export function newsletterPublicOrigin({ publicSiteUrl, configuredUrl, production = false }) {
  for (const candidate of [publicSiteUrl, configuredUrl]) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    try {
      const parsed = new URL(candidate.trim());
      const hostname = parsed.hostname.toLowerCase();
      const loopback = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '0.0.0.0' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || loopback) continue;
      if (production && parsed.protocol !== 'https:') continue;
      return parsed.origin;
    } catch { /* Try the next configured origin. */ }
  }
  return null;
}

export function createNewsletterHandlers({ getPortalPool, sendWelcome, getPublicOrigin, getPortalName, getLogoUrl, createId = crypto.randomUUID }) {
  const subscribe = async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }

    let connection;
    try {
      const pool = await getPortalPool();
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [previousRows] = await connection.execute(
        'SELECT id, confirmed_at, unsubscribed_at, unsubscribe_token_hash FROM newsletter_subscriptions WHERE email = ? FOR UPDATE',
        [email],
      );
      const previous = previousRows[0] || null;
      const unsubscribeToken = crypto.randomBytes(32).toString('base64url');
      const unsubscribeHash = crypto.createHash('sha256').update(unsubscribeToken).digest('hex');
      const [savedRows] = await connection.execute(
        `INSERT INTO newsletter_subscriptions (id, email, created_at, confirmed_at, unsubscribe_token_hash)
         VALUES (?, ?, NOW(), NOW(), ?)
         ON CONFLICT (email) DO UPDATE SET
           confirmed_at = COALESCE(newsletter_subscriptions.confirmed_at, NOW()),
           unsubscribe_token_hash = CASE
             WHEN newsletter_subscriptions.unsubscribed_at IS NOT NULL OR newsletter_subscriptions.unsubscribe_token_hash IS NULL THEN EXCLUDED.unsubscribe_token_hash
             ELSE newsletter_subscriptions.unsubscribe_token_hash
           END,
           unsubscribed_at = NULL
         RETURNING id, (xmax = 0) AS inserted`,
        [createId(), email, unsubscribeHash],
      );
      const saved = savedRows[0];
      if (!saved) throw new Error('Newsletter subscription was not saved.');

      const shouldSendWelcome = saved.inserted === true || Boolean(previous && (
        previous.unsubscribed_at || !previous.confirmed_at || !previous.unsubscribe_token_hash
      ));
      if (shouldSendWelcome) {
        const publicOrigin = getPublicOrigin();
        if (!publicOrigin) throw new Error('Newsletter public website origin is not configured.');
        const unsubscribeUrl = new URL(`/newsletter/unsubscribe/${unsubscribeToken}`, `${publicOrigin}/`).toString();
        const message = newsletterWelcomeEmail({ unsubscribeUrl, portalName: getPortalName(), logoUrl: getLogoUrl() });
        await sendWelcome({ to: email, ...message });
      }

      await connection.commit();
      return res.status(200).json({ ok: true });
    } catch (error) {
      await connection?.rollback().catch(() => {});
      console.error('Newsletter subscription could not be saved:', error.message);
      return res.status(503).json({ error: 'We could not process your newsletter request right now. Please try again.' });
    } finally {
      connection?.release();
    }
  };

  const confirm = async (req, res) => {
    const token = String(req.params.token || '');
    if (!validToken(token)) return res.status(400).type('text').send('This confirmation link is invalid.');
    try {
      const pool = await getPortalPool();
      const [rows] = await pool.execute(
        'UPDATE newsletter_subscriptions SET confirmed_at = COALESCE(confirmed_at, NOW()) WHERE confirmation_token_hash = ? AND confirmation_expires_at > NOW() AND unsubscribed_at IS NULL RETURNING id',
        [crypto.createHash('sha256').update(token).digest('hex')],
      );
      return rows.length ? res.type('text').send('Your Getafe newsletter subscription is confirmed.') : res.status(410).type('text').send('This confirmation link is invalid or expired. Please subscribe again.');
    } catch (error) {
      console.error('Newsletter confirmation failed:', error.message);
      return res.status(503).type('text').send('We could not confirm your subscription right now. Please try again later.');
    }
  };

  const unsubscribe = async (req, res) => {
    const token = String(req.params.token || '');
    if (!validToken(token)) return res.status(400).type('text').send('This unsubscribe link is invalid.');
    try {
      const pool = await getPortalPool();
      const [rows] = await pool.execute(
        'UPDATE newsletter_subscriptions SET unsubscribed_at = COALESCE(unsubscribed_at, NOW()), confirmation_token_hash = NULL, confirmation_expires_at = NULL WHERE unsubscribe_token_hash = ? RETURNING id',
        [crypto.createHash('sha256').update(token).digest('hex')],
      );
      return rows.length ? res.type('text').send('You have been unsubscribed from Getafe updates.') : res.status(410).type('text').send('This unsubscribe link is invalid or has been replaced.');
    } catch (error) {
      console.error('Newsletter unsubscribe failed:', error.message);
      return res.status(503).type('text').send('We could not process your request right now. Please try again later.');
    }
  };

  return { subscribe, confirm, unsubscribe };
}
