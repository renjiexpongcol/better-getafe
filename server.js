process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

import express from "express";
import { closeCloudSql } from './src/services/cloudSql.js';
import path from "path";
import fs from "node:fs/promises";
import crypto from "crypto";
import { config } from './src/config/index.js';
import { closeConfigStore } from './src/config/DatabaseSettingsProvider.js';
import { installSettingsRoutes } from './src/services/settingsRoutes.js';
import { loginThrottle, issueCode, verifyCode } from './src/services/authSecurity.js';
import { stateKey, stateTransaction, putState, consumeState } from './src/services/authState.js';
import { replacePassword } from './src/services/passwords.js';
import { integrationRequest } from './src/services/integrations.js';
import { sendEmail } from './src/services/email.js';

import { fileURLToPath } from "url";
import { initializeServices, serviceStatus } from "./src/services/initialization.js";
import { createUploadUrl, createDownloadUrl, deleteObject, getObjectMetadata } from "./src/services/storage.js";

import { getCategories, createCategory, updateCategory, deleteCategory } from "./src/repositories/categoryRepository.js";
import { getNewsArticles, getNewsArticleBySlug, createNewsArticle, updateNewsArticle, deleteNewsArticle, bulkUpdateNewsArticles } from "./src/repositories/newsRepository.js";
import { getMedia, finalizePendingUpload, createPendingUpload, deletePendingUpload, deleteMediaRecord, getMediaByStoragePath, getPendingUpload } from "./src/repositories/mediaRepository.js";
import { getCmsUsers, getCmsUserById, getCmsUserByEmail } from "./src/repositories/cmsUserRepository.js";
import { getPortalUserByEmail, getPortalUserById, createPortalUser } from "./src/repositories/portalUserRepository.js";
import { getOfficials, saveOfficials } from "./src/repositories/officialsRepository.js";
import { getBarangays, saveBarangays } from "./src/repositories/barangaysRepository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;

import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const secret = process.env.AUTH_SESSION_SECRET || process.env.CMS_SESSION_SECRET || process.env.SESSION_SECRET || (
  process.env.NODE_ENV === "production" ? null : "change-this-local-development-session-secret"
);

app.use(express.json({ limit: "8mb" }));
app.get('/api/weather', async (req, res) => {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return res.status(503).json({ error: 'OpenWeather is not configured. Add OPENWEATHER_API_KEY to the server environment.' });
  const locations = [{ name: 'Getafe', lat: 10.15, lon: 124.15 }, { name: 'Manila', lat: 14.5995, lon: 120.9842 }, { name: 'Cebu', lat: 10.3157, lon: 123.8854 }, { name: 'Davao', lat: 7.1907, lon: 125.4553 }, { name: 'Baguio', lat: 16.4023, lon: 120.596 }];
  try { const results = await Promise.all(locations.map(async location => { const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${location.lat}&lon=${location.lon}&units=metric&appid=${encodeURIComponent(key)}`); if (!response.ok) throw new Error('OpenWeather request failed.'); return { ...(await response.json()), name: location.name }; })); res.set('Cache-Control', 'public, max-age=600'); res.json(results); } catch (error) { res.status(502).json({ error: error.message || 'Weather provider unavailable.' }); }
});
// Credentials must only travel over TLS in deployed environments. Local
// development remains available over localhost HTTP for convenience.
app.use((req, res, next) => {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (process.env.NODE_ENV === 'production' && !secure && req.path.startsWith('/api/auth')) {
    return res.status(400).json({ error: 'Secure HTTPS connection required for sign-in.' });
  }
  next();
});
app.use(async (req, res, next) => {
  try { await config.load(); } catch { /* Keep the last known working snapshot; status reports degraded. */ }
  if (config.get('security.frameProtection')) res.setHeader('X-Frame-Options', 'DENY');
  if (config.get('security.contentTypeProtection')) res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (config.get('maintenance.enabled') && !req.path.startsWith('/api/auth/') && !req.path.startsWith('/auth/') && !req.path.startsWith('/assets/') && !req.path.startsWith('/admin') && req.path !== '/api/public/config' && !req.path.startsWith('/api/admin/settings') && !['/health', '/healthz', '/ready', '/api/health', '/api/health/storage'].includes(req.path)) {
    const session = authenticated(req);
    if (session?.kind === 'cms') {
      try {
        const user = await getCmsUserById(session.id);
        const ips = config.get('maintenance.allowedAdminIps').split(',').map(ip => ip.trim()).filter(Boolean);
        if (['admin', 'super_admin'].includes(user?.role) && (!ips.length || ips.includes(req.ip))) return next();
      } catch { /* Fail closed for regular requests. */ }
    }
    res.setHeader('Retry-After', '60');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const message = escapeHtml(config.get('maintenance.message'));
    const expected = config.get('maintenance.expectedCompletion');
    const expectedText = expected ? `<p class="expected">Expected completion: ${escapeHtml(new Date(expected).toLocaleString(config.get('general.locale'), { timeZone: config.get('general.timezone') }) )}</p>` : '';
    if (req.path.startsWith('/api/')) {
      return res.status(503).json({ error: config.get('maintenance.message'), expectedCompletion: expected });
    }
    res.status(503).type('html').send(`<!doctype html><html lang="${escapeHtml(config.get('general.language'))}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(config.get('general.name'))} · Maintenance</title><style>html,body{margin:0;min-height:100%;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#17324d;background:#f4f8fb}body{display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{max-width:640px;width:100%;text-align:center;background:white;border:1px solid #d9e5ed;border-radius:18px;padding:48px 32px;box-shadow:0 16px 45px #17324d18}h1{margin:0 0 14px;font-size:clamp(28px,5vw,44px)}p{font-size:18px;line-height:1.6;margin:10px 0}.expected{font-size:15px;color:#557086;margin-top:24px}.mark{display:inline-grid;place-items:center;width:64px;height:64px;border-radius:50%;background:#e0f0f5;color:#17617a;font-size:32px;margin-bottom:20px}</style></head><body><main class="card" role="main"><div class="mark" aria-hidden="true">↻</div><h1>${escapeHtml(config.get('general.name'))} is temporarily unavailable</h1><p>${message}</p>${expectedText}<p class="expected">Please check back shortly.</p></main></body></html>`);
    return;
  }
  next();
});
app.use(['/api/auth', '/api/portal-auth'], (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Cookie');
  next();
});


const hash = (password, salt) => {
  if (!salt) salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
};

const matches = (password, stored) => {
  try {
    const [salt, saved] = String(stored || '').split(":");
    if (!salt || !saved || !/^[0-9a-f]+$/i.test(saved)) return false;
    const expected = Buffer.from(saved, "hex");
    const actual = Buffer.from(hash(password, salt).split(":")[1], "hex");
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
};
const passwordIsStrong = password => password.length >= 8 && password.length <= 1024 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password) && !['password', 'password1', '12345678', 'qwerty123', 'admin123'].includes(password.toLowerCase());

const SESSION_COOKIE = 'getafe_session';
const SESSION_LENGTH = 12 * 60 * 60 * 1000;
const REMEMBERED_SESSION_LENGTH = 30 * 24 * 60 * 60 * 1000;

const makeToken = (user, kind, remember = false) => {
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, kind, iat: Date.now(), remember, exp: Date.now() + (remember ? config.get('authentication.rememberDays') * 86400000 : config.get('authentication.sessionMinutes') * 60000) })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
};

const readCookies = (header = '') => Object.fromEntries(header.split(';').map(part => {
  const index = part.indexOf('=');
  return index < 0 ? [] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
}).filter(pair => pair.length));

function authenticated(req) {
  try {
    const authorization = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    const token = authorization || readCookies(req.headers.cookie)[SESSION_COOKIE] || '';
    const [payload, signature] = token.split(".");
    if (!payload || !signature || !secret) return null;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() && (data.iat || 0) + (data.remember ? config.get('authentication.rememberDays') * 86400000 : config.get('authentication.sessionMinutes') * 60000) > Date.now() ? data : null;
  } catch {
    return null;
  }
}

const admin = async (req, res, next) => {
  req.admin = authenticated(req);
  if (req.admin?.kind !== 'cms' || !['admin', 'super_admin'].includes(req.admin.role)) {
    return res.status(401).json({ error: "Administrator authentication required." });
  }
  try {
    const user = await getCmsUserById(req.admin.id);
    if (!user || !['admin', 'super_admin'].includes(user.role)) return res.status(401).json({ error: "Administrator authentication required." });
    req.admin = safeUser(user);
    next();
  } catch (error) {
    console.error('Administrator authorization lookup failed:', error.message);
    res.status(503).json({ error: "Authentication service is temporarily unavailable." });
  }
};

const setSessionCookie = (res, token, remember) => {
  const attributes = ['HttpOnly', 'Path=/', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  if (remember) attributes.push(`Max-Age=${config.get('authentication.rememberDays') * 86400}`);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${attributes.join('; ')}`);
};

const clearSessionCookie = (res) => {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
};

const safeUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

function validateArticle(body, res) {
  if (!body.title?.trim() || !body.excerpt?.trim() || !body.content?.trim()) {
    res.status(422).json({ error: "Title, excerpt, and content are required." });
    return false;
  }
  if (body.published_at && Number.isNaN(new Date(body.published_at).getTime())) {
    res.status(422).json({ error: "Publication date must be valid." });
    return false;
  }
  return true;
}

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const xmlEscape = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const siteUrl = (req) => {
  const configured = config.get('general.url') || `${req.protocol}://${req.get('host')}`;
  return configured.replace(/\/$/, '');
};

const decorate = async (article) => {
  const categories = await getCategories();
  const users = await getCmsUsers();
  return {
    ...article,
    content: String(article.content || '').replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, ''),
    featured_image: await createDownloadUrl(article.featured_image),
    featured_image_path: article.featured_image,
    category: categories.find((c) => c.id === article.category_id) || null,
    author: (() => {
      const u = users.find((u) => u.id === article.author_id);
      return u ? { id: u.id, name: u.name } : null;
    })(),
  };
};

app.get('/rss.xml', async (req, res) => {
  try {
    const baseUrl = siteUrl(req);
    const published = (await getNewsArticles())
      .filter((article) => article.status === 'published' && article.published_at && new Date(article.published_at) <= new Date())
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      .slice(0, 50);
    const items = published.map((article) => {
      const articleUrl = `${baseUrl}/news/${encodeURIComponent(article.slug)}`;
      return `
      <item>
        <title>${xmlEscape(article.title)}</title>
        <link>${xmlEscape(articleUrl)}</link>
        <guid isPermaLink="true">${xmlEscape(articleUrl)}</guid>
        <description>${xmlEscape(article.excerpt)}</description>
        <pubDate>${new Date(article.published_at).toUTCString()}</pubDate>
      </item>`;
    }).join('');
    const updated = published[0]?.published_at ? new Date(published[0].published_at).toUTCString() : new Date().toUTCString();
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(config.get('general.name'))} News &amp; Updates</title>
    <link>${xmlEscape(baseUrl)}</link>
    <description>Official announcements, community information, events, services, and tourism updates from the Municipality of Getafe, Bohol.</description>
    <language>${xmlEscape(config.get('general.locale'))}</language>
    <lastBuildDate>${updated}</lastBuildDate>
    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${xmlEscape(`${baseUrl}/rss.xml`)}" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;
    res.type('application/rss+xml').send(feed);
  } catch (error) {
    console.error('RSS feed generation failed:', error);
    res.status(503).type('text/plain').send('RSS feed unavailable.');
  }
});

app.post('/api/feedback/article', async (req, res) => {
  try {
    const title = String(req.body.articleTitle || '').slice(0, 300);
    const url = String(req.body.articleUrl || '').slice(0, 1000);
    const feedback = String(req.body.feedback || '').slice(0, 4000);
    const includeScreenshot = req.body.includeScreenshot === true;
    const screenshotData = String(req.body.screenshotData || '');
    const reasons = Array.isArray(req.body.reasons) ? req.body.reasons.map(String).slice(0, 10) : [];
    const recipient = config.get('general.supportEmail') || config.get('email.senderEmail');
    if (!recipient) return res.status(503).json({ error: 'Feedback email is not configured.' });
    const attachments = includeScreenshot && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(screenshotData) ? [{ filename: 'article-feedback-screenshot.jpg', content: screenshotData.split(',')[1], encoding: 'base64', contentType: 'image/jpeg' }] : [];
    if (includeScreenshot && !attachments.length) return res.status(422).json({ error: 'The screenshot could not be attached. Please select Include screenshot and try again.' });
    await sendEmail(recipient, `Article feedback: ${title || 'Untitled article'}`, `Article: ${title}\nURL: ${url}\nReasons: ${reasons.join(', ') || 'None selected'}\nFeedback: ${feedback || 'No written feedback'}\nScreenshot attached: ${attachments.length ? 'Yes' : 'No'}\nUser agent: ${String(req.body.userAgent || '').slice(0, 500)}`, undefined, undefined, attachments);
    res.json({ message: '' });
  } catch (error) { console.error('Article feedback email failed:', error.message); res.status(503).json({ error: 'The report could not be sent right now. Please try again later.' }); }
});
const visitorIdentity = req => `${req.ip}|${req.get('user-agent') || ''}`;

// -- Auth Routes --
const loginUser = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const remember = req.body.remember === true;
    if (!await loginThrottle(`${req.ip}:${email}`)) return res.status(429).json({ error: 'Too many failed attempts. Try again after the configured lockout period.' });
    const cmsUser = await getCmsUserByEmail(email);
    const portalUser = cmsUser ? null : await getPortalUserByEmail(email);
    const user = cmsUser || portalUser;
    if (!user || !matches(password, user.password)) {
      await loginThrottle(`${req.ip}:${email}`, true);
      return res.status(401).json({ error: "Invalid email or password." });
    }
    await loginThrottle(`${req.ip}:${email}`, false);
    const kind = cmsUser ? 'cms' : 'portal';
    const age = config.get('authentication.passwordExpiryDays');
    const passwordChanged = await stateTransaction(stateKey('passwordAge', user.id), async value => ({ value, expires: 32503680000000, result: value }));
    if (age && Date.now() - (passwordChanged || Date.parse(user.created_at || '1970-01-01')) > age * 86400000) {
      const token = crypto.randomBytes(32).toString('hex');
      await putState(stateKey('passwordReset', token), { id: user.id, kind }, 600000);
      return res.json({ passwordExpired: true, resetToken: token });
    }
    const verified = await stateTransaction(stateKey('verified', user.id), async value => ({ value, expires: 3250368000000000, result: value }));
    const emailCodeRequired = config.get('authentication.mfaEnabled') || (config.get('authentication.requireEmailVerification') && !verified);
    if (emailCodeRequired) {
      try {
        const challengeId = await issueCode(user.email, 'login', { id: user.id, kind, remember });
        return res.json({ challengeId, verificationRequired: true });
      } catch (error) {
        console.error('Sign-in verification email failed:', error.message);
        return res.status(503).json({ error: 'We could not send the sign-in code. Please check the email service configuration and try again.' });
      }
    }
    setSessionCookie(res, makeToken(user, kind, remember), remember);
    res.json({ user: safeUser(user), admin: kind === 'cms' });
  } catch (error) {
    console.error('Authentication lookup failed:', error.message);
    res.status(503).json({ error: "The sign-in service is temporarily unavailable." });
  }
};

app.post("/api/auth/login", loginUser);

app.get('/api/auth/google', (req, res) => {
  const clientId = config.get('google.clientId');
  if (!clientId) return res.status(503).json({ error: 'Google sign-in is not configured.' });
  const state = crypto.randomBytes(24).toString('hex');
  res.cookie('google_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 600000 });
  const redirect = config.get('google.redirectUri') || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  res.redirect(url.toString());
});
app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const cookies = readCookies(req.headers.cookie);
    if (!req.query.code || !req.query.state || cookies.google_oauth_state !== req.query.state) return res.status(400).send('Invalid Google sign-in state.');
    const redirect = config.get('google.redirectUri') || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: config.get('google.clientId'), client_secret: config.get('google.clientSecret'), redirect_uri: redirect, grant_type: 'authorization_code' }) });
    const token = await tokenResponse.json(); if (!tokenResponse.ok) throw new Error('Google token exchange failed.');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResponse.json(); if (!profileResponse.ok || !profile.email_verified) throw new Error('Google account email is not verified.');
    let user = await getPortalUserByEmail(profile.email);
    if (!user) { user = await createPortalUser(profile.name || profile.email, profile.email, hash(crypto.randomBytes(32).toString('hex'))); }
    setSessionCookie(res, makeToken(user, 'portal', true), true); res.clearCookie('google_oauth_state'); res.redirect('/');
  } catch (error) { console.error('Google OAuth callback failed:', error.message); res.status(503).send('Google sign-in is temporarily unavailable.'); }
});

app.get("/api/auth/me", async (req, res) => {
  const session = authenticated(req);
  if (config.get('advanced.authDebug')) {
    console.info('Auth session check:', { cookiePresent: Boolean(readCookies(req.headers.cookie)[SESSION_COOKIE]), sessionValid: Boolean(session) });
  }
  if (!session) return res.json({ user: null });
  try {
    const user = session.kind === 'cms' ? await getCmsUserById(session.id) : await getPortalUserById(session.id);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Authentication required." });
    }
    res.json({ user: safeUser(user), admin: session.kind === 'cms' });
  } catch (error) {
    console.error('Authentication session lookup failed:', error.message);
    res.status(503).json({ error: "The sign-in service is temporarily unavailable." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
});

app.post('/api/portal-auth/login', loginUser);
app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const payload = await verifyCode(String(req.body.challengeId || ''), String(req.body.code || ''), 'login');
    if (!payload) return res.status(401).json({ error: 'Invalid or expired verification code.' });
    const user = payload.kind === 'cms' ? await getCmsUserById(payload.id) : await getPortalUserById(payload.id);
    if (!user) return res.status(401).json({ error: 'Account unavailable.' });
    await putState(stateKey('verified', user.id), true, 3153600000000);
    setSessionCookie(res, makeToken(user, payload.kind, payload.remember), payload.remember);
    res.json({ user: safeUser(user), admin: payload.kind === 'cms' });
  } catch { res.status(503).json({ error: 'Verification is temporarily unavailable.' }); }
});
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(422).json({ error: 'Enter a valid email address.' });
    const cmsUser = await getCmsUserByEmail(email);
    const user = cmsUser || await getPortalUserByEmail(email);
    if (user) {
      const challengeId = await issueCode(user.email, 'password-reset', { id: user.id, kind: cmsUser ? 'cms' : 'portal' });
      return res.json({ challengeId });
    }
    res.json({ challengeId: null });
  } catch (error) { console.error('Password reset request failed:', error.message); res.status(503).json({ error: 'Password reset email could not be sent.' }); }
});
app.post('/api/auth/forgot-password/verify', async (req, res) => {
  try {
    const payload = await verifyCode(String(req.body.challengeId || ''), String(req.body.code || ''), 'password-reset');
    if (!payload) return res.status(401).json({ error: 'Invalid or expired verification code.' });
    const token = crypto.randomBytes(32).toString('hex');
    await putState(stateKey('passwordReset', token), payload, 600000);
    res.json({ resetToken: token });
  } catch { res.status(503).json({ error: 'Verification is temporarily unavailable.' }); }
});
app.post('/api/auth/renew-password', async (req, res) => {
  try {
    const password = String(req.body.password || '');
    if (!passwordIsStrong(password) || password.length < config.get('authentication.passwordMinLength')) return res.status(422).json({ error: 'Choose a stronger password with uppercase and lowercase letters, a number, and a special character.' });
    const payload = await consumeState(stateKey('passwordReset', String(req.body.resetToken || '')));
    if (!payload) return res.status(401).json({ error: 'Password renewal expired. Sign in again.' });
    await replacePassword(payload.id, payload.kind, password);
    await putState(stateKey('passwordAge', payload.id), Date.now(), 3153600000000);
    res.json({ ok: true });
  } catch { res.status(503).json({ error: 'Password renewal failed. Sign in and try again.' }); }
});
app.post("/api/portal-auth/register", async (req, res) => {
  try {
    if (!config.get('authentication.registrationEnabled') || !config.get('features.publicRegistration')) return res.status(403).json({ error: 'Public registration is disabled.' });
    const name = String(req.body.name || "").trim(),
      email = String(req.body.email || "").trim().toLowerCase(),
      password = String(req.body.password || "");
    if (!name || !isValidEmail(email) || password.length < config.get('authentication.passwordMinLength'))
      return res.status(422).json({ error: "Enter a name, a valid email address, and a password of at least 8 characters." });

    if (await getCmsUserByEmail(email)) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    
    const user = await createPortalUser(name, email, password);
    await putState(stateKey('passwordAge', user.id), Date.now(), 3153600000000);
    if (config.get('authentication.requireEmailVerification') || config.get('authentication.mfaEnabled')) {
      const challengeId = await issueCode(user.email, 'login', { id: user.id, kind: 'portal', remember: true });
      return res.status(201).json({ challengeId, verificationRequired: true });
    }
    setSessionCookie(res, makeToken(user, 'portal', true), true);
    res.status(201).json({ user: safeUser(user), admin: false });
  } catch (error) {
    res.status(error?.code === "ER_DUP_ENTRY" ? 409 : 503).json({
      error: error?.code === "ER_DUP_ENTRY" ? "An account with that email already exists." : "Portal account service is unavailable.",
    });
  }
});

installSettingsRoutes(app, admin);

app.get('/api/public/config', (req, res) => {
  // This endpoint is only an internal bootstrap request. Reject direct browser
  // navigation and cross-site requests to prevent public hotlinking.
  const origin = req.get('origin');
  const referer = req.get('referer');
  const requestHost = `${req.protocol}://${req.get('host')}`;
  const sameOrigin = req.get('sec-fetch-site') === 'same-origin'
    || origin === requestHost
    || (referer && referer.startsWith(`${requestHost}/`));
  if (req.get('sec-fetch-dest') === 'document' || !sameOrigin) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const publicKeys = Object.keys(config.values).filter(key => key.startsWith('general.') || key.startsWith('features.') || ['authentication.registrationEnabled', 'authentication.passwordMinLength', 'notifications.enabled', 'maintenance.enabled', 'maintenance.message', 'maintenance.expectedCompletion'].includes(key));
    res.json(Object.fromEntries(publicKeys.map(key => [key, config.get(key)])));
  } catch (error) {
    console.error('Public configuration unavailable:', error.message);
    // Keep the public site usable while the settings store is recovering.
    res.json({
      'general.name': 'Municipality of Getafe',
      'general.company': 'Municipality of Getafe',
      'general.url': '',
      'general.timezone': 'Asia/Manila',
      'general.locale': 'en-PH',
      'authentication.registrationEnabled': true,
      'authentication.passwordMinLength': 8,
      'notifications.enabled': true,
      'features.uploads': true,
      'features.publicRegistration': true,
      'maintenance.enabled': false,
    });
  }
});

app.get('/api/admin/reports', admin, async (req, res) => {
  if (!config.get('features.reports')) return res.status(403).json({ error: 'Reports are disabled.' });
  try { const articles = await getNewsArticles(); res.json({ generatedAt: new Date().toISOString(), total: articles.length, published: articles.filter(article => article.status === 'published').length }); }
  catch { res.status(503).json({ error: 'Reports unavailable.' }); }
});
app.post('/api/admin/integrations/test', admin, async (req, res) => {
  try { await integrationRequest('health'); res.json({ ok: true }); }
  catch { res.status(422).json({ error: 'Integration health check failed. Check configuration and credentials.' }); }
});
app.post('/api/admin/ai', admin, async (req, res) => {
  if (!config.get('features.ai')) return res.status(403).json({ error: 'AI features are disabled.' });
  try { const response = await integrationRequest('ai', { prompt: String(req.body.prompt || '').slice(0, 5000) }); res.json(await response.json()); }
  catch { res.status(503).json({ error: 'AI integration is unavailable.' }); }
});
app.post('/api/admin/notifications/test', admin, async (req, res) => {
  if (!config.get('notifications.enabled') || !config.get('notifications.emailEnabled')) return res.status(403).json({ error: 'Email notifications are disabled.' });
  try { await sendEmail(req.admin.email, 'Notification test', 'Email notifications are enabled.'); res.json({ ok: true }); }
  catch { res.status(503).json({ error: 'Notification delivery failed.' }); }
});
app.get('/api/notifications', async (req, res) => {
  if (!config.get('notifications.enabled')) return res.status(403).json({ error: 'Notifications are disabled.' });
  try { res.json((await getNewsArticles()).filter(article => article.status === 'published' && new Date(article.published_at) <= new Date()).slice(-10).map(article => ({ id: article.id, title: article.title, slug: article.slug }))); }
  catch { res.status(503).json({ error: 'Notifications unavailable.' }); }
});

// -- CMS News --
app.get("/api/news", async (req, res) => {
  const allNews = await getNewsArticles();
  const session = authenticated(req);
  const isAdmin = session?.kind === 'cms' && session.role === 'admin';
  let items = allNews.filter((n) => isAdmin || (n.status === "published" && n.published_at && new Date(n.published_at) <= new Date()));

  if (req.query.status && isAdmin) items = items.filter((n) => n.status === req.query.status);

  const categories = await getCategories();
  if (req.query.category)
    items = items.filter((n) => n.category_id === req.query.category || categories.find((c) => c.id === n.category_id)?.slug === req.query.category);
  
  if (req.query.search) {
    const q = req.query.search.toLowerCase();
    items = items.filter((n) => `${n.title} ${n.excerpt} ${n.content}`.toLowerCase().includes(q));
  }
  items.sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
  
  const requestedLimit = Number(req.query.limit || 9);
  const limit = Math.min(isAdmin ? 100 : 24, Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 9);
  const requestedPage = Number(req.query.page || 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const paginated = items.slice((page - 1) * limit, page * limit);
  const decorated = await Promise.all(paginated.map(n => decorate(n)));
  
  res.json({
    items: decorated,
    total: items.length,
    page,
    pages: Math.ceil(items.length / limit) || 1,
  });
});

app.get("/api/news/:slug", async (req, res) => {
  const article = await getNewsArticleBySlug(req.params.slug);
  const session = authenticated(req);
  const isAdmin = session?.kind === 'cms' && session.role === 'admin';
  if (!article || (!isAdmin && (article.status !== "published" || new Date(article.published_at) > new Date())))
    return res.status(404).json({ error: "Article not found." });
  res.json(await decorate(article));
});

app.post("/api/news", admin, async (req, res) => {
  if (!validateArticle(req.body, res)) return;
  const categories = await getCategories();
  if (req.body.category_id && !categories.some((category) => category.id === req.body.category_id)) {
    return res.status(422).json({ error: "The selected category does not exist." });
  }
  const article = await createNewsArticle(req.body, req.admin.id);
  res.status(201).json(await decorate(article));
});

app.put("/api/news/:id", admin, async (req, res) => {
  if (!validateArticle(req.body, res)) return;
  const categories = await getCategories();
  if (req.body.category_id && !categories.some((category) => category.id === req.body.category_id)) {
    return res.status(422).json({ error: "The selected category does not exist." });
  }
  const article = await updateNewsArticle(req.params.id, req.body);
  if (!article) return res.status(404).json({ error: "Article not found." });
  res.json(await decorate(article));
});

app.delete("/api/news/:id", admin, async (req, res) => {
  await deleteNewsArticle(req.params.id);
  res.status(204).end();
});

app.post("/api/news/bulk", admin, async (req, res) => {
  try {
    const { ids, action } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "Select at least one article" });
    if (!['delete', 'published', 'draft'].includes(action)) return res.status(400).json({ error: "Unsupported bulk action" });
    const count = await bulkUpdateNewsArticles(ids, action);
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -- CMS Categories --
app.get("/api/categories", async (req, res) => {
  const categories = await getCategories();
  res.json(categories);
});

app.get('/api/officials', async (req, res) => {
  try { res.json(await getOfficials() || {}); } catch (error) { res.status(503).json({ error: error.message }); }
});
app.put('/api/officials', admin, async (req, res) => {
  try { if (!req.body || typeof req.body !== 'object') return res.status(422).json({ error: 'Invalid officials content.' }); res.json(await saveOfficials(req.body)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/api/barangays', async (req, res) => {
  try { res.json(await getBarangays()); } catch (error) { res.status(503).json({ error: error.message }); }
});
app.put('/api/barangays', admin, async (req, res) => {
  try { if (!Array.isArray(req.body)) return res.status(422).json({ error: 'Invalid barangays content.' }); res.json(await saveBarangays(req.body)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/categories", admin, async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(422).json({ error: "A category name is required." });
  const all = await getCategories();
  if (all.some((c) => c.name.toLowerCase() === name.toLowerCase()))
    return res.status(409).json({ error: "That category already exists." });
  
  const item = await createCategory(name, req.body.slug);
  res.status(201).json(item);
});

app.put("/api/categories/:id", admin, async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(422).json({ error: "A category name is required." });
  
  const item = await updateCategory(req.params.id, name, req.body.slug);
  if (!item) return res.status(404).json({ error: "Category not found." });
  res.json(item);
});

app.delete("/api/categories/:id", admin, async (req, res) => {
  const articles = await getNewsArticles();
  if (articles.some((n) => n.category_id === req.params.id))
    return res.status(409).json({ error: "This category is used by an article." });
    
  await deleteCategory(req.params.id);
  res.status(204).end();
});

// -- CMS Media --
app.get("/api/media", admin, async (req, res) => {
  const media = await getMedia();
  const decoratedMedia = await Promise.all(media.map(async (m) => ({
    ...m,
    preview_url: await createDownloadUrl(m.storage_path, m.storage_bucket)
  })));
  res.json(decoratedMedia);
});

app.post("/api/storage/upload-url", admin, async (req, res) => {
  if (!config.get('features.uploads')) return res.status(403).json({ error: 'File uploads are disabled.' });
  const filename = String(req.body.filename || '').trim();
  const contentType = String(req.body.contentType || '').trim().toLowerCase();
  const fileSize = Number(req.body.fileSize);
  const context = String(req.body.context || '');
  
  if (!filename || !Number.isSafeInteger(fileSize) || fileSize <= 0) {
    return res.status(422).json({ error: "Filename, contentType, and fileSize are required." });
  }

  if (filename.length > 255 || /[\\/\0\r\n]/.test(filename)) {
    return res.status(422).json({ error: "Invalid filename." });
  }

  // Validate context and file
  if (context !== 'media' && context !== 'news') {
    return res.status(422).json({ error: "Invalid upload context." });
  }

  const allowedTypes = new Set(config.get('storage.allowedTypes').split(',').map(type => type.trim()));
  if (!allowedTypes.has(contentType)) {
    return res.status(422).json({ error: "Use a JPG, PNG, or WEBP image." });
  }
  const extension = filename.toLowerCase().split('.').pop();
  const allowedExtensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (extension !== allowedExtensions[contentType] && !(contentType === 'image/jpeg' && extension === 'jpeg')) {
    return res.status(422).json({ error: "The filename extension must match the content type." });
  }

  if (fileSize > config.get('storage.maxUploadMb') * 1024 * 1024) {
    return res.status(422).json({ error: "File size exceeds the configured upload limit." });
  }

  const ext = contentType === "image/jpeg" ? "jpg" : contentType.split('/')[1];
  const uuid = crypto.randomUUID();
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  
  const storagePath = `${config.get('storage.prefix')}/${yyyy}/${mm}/${uuid}.${ext}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + config.get('storage.signedUrlMinutes') * 60000);

  try {
    if (config.get('storage.provider') === 'gcp') await createPendingUpload({
      id: uuid, storagePath, originalFilename: filename, contentType, fileSize,
      uploadedBy: req.admin.id, context, expiresAt, createdAt,
    });
    const uploadUrl = await createUploadUrl(storagePath, contentType, fileSize);
    res.json({
      uploadUrl,
      storagePath,
      expiresIn: config.get('storage.signedUrlMinutes') * 60
    });
  } catch (error) {
    if (config.get('storage.provider') === 'gcp') await deletePendingUpload(storagePath).catch(() => {});
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: "Failed to generate upload URL." });
  }
});

app.post("/api/media/complete", admin, async (req, res) => {
  const storagePath = String(req.body.storagePath || '');
  const relatedRecordId = req.body.relatedRecordId || null;
  
  if (!storagePath || !/^[a-zA-Z0-9_\/-]+\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(storagePath)) {
    return res.status(422).json({ error: "Invalid storage path." });
  }
  if (relatedRecordId && !/^[0-9a-f-]{36}$/i.test(String(relatedRecordId))) {
    return res.status(422).json({ error: "Invalid related record ID." });
  }

  const bucketName = config.get('storage.bucket');
  const isLocalStorage = config.get('storage.provider') !== 'gcp';

  // Guard against duplicate completion
  const existing = await getMediaByStoragePath(storagePath);
  if (existing) {
    if (existing.uploaded_by !== req.admin.id) return res.status(403).json({ error: "You do not own this upload." });
    return res.status(200).json({ ...existing, preview_url: await createDownloadUrl(storagePath) });
  }

  const pending = isLocalStorage ? {
    original_filename: String(req.body.originalFilename || 'upload'),
    content_type: String(req.body.contentType || ''),
    file_size: Number(req.body.fileSize || 0),
  } : await getPendingUpload(storagePath, req.admin.id);
  if (!pending) return res.status(403).json({ error: "Upload was not issued to this administrator or has expired." });

  // Verify object exists and retrieve authoritative metadata from GCS
  const gcsMetadata = isLocalStorage ? null : await getObjectMetadata(storagePath);
  if (isLocalStorage) {
    const localFile = path.resolve(config.get('storage.localPath') || 'data/uploads', storagePath);
    try {
      const stat = await fs.stat(localFile);
      if (!stat.isFile()) throw new Error('not a file');
    } catch { return res.status(404).json({ error: "Uploaded file not found. Upload may have failed." }); }
  }
  if (!isLocalStorage && !gcsMetadata) {
    return res.status(404).json({ error: "GCS object not found. Upload may have failed." });
  }

  const verifiedContentType = isLocalStorage ? pending.content_type : (gcsMetadata.contentType || 'application/octet-stream');
  const verifiedFileSize = isLocalStorage ? pending.file_size : (parseInt(gcsMetadata.size, 10) || 0);
  if (!isLocalStorage && (gcsMetadata.name !== storagePath || verifiedContentType !== pending.content_type || verifiedFileSize !== Number(pending.file_size))) {
    return res.status(422).json({ error: "Uploaded object metadata does not match the issued upload." });
  }

  const item = await finalizePendingUpload(pending, {
    id: crypto.randomUUID(),
    originalFilename: pending.original_filename,
    storageBucket: bucketName,
    storagePath,
    contentType: verifiedContentType,
    fileSize: verifiedFileSize,
    uploadedBy: req.admin.id,
    relatedRecordId,
    createdAt: new Date().toISOString().slice(0, 23).replace('T', ' '),
  });
  
  res.status(201).json({ ...item, preview_url: await createDownloadUrl(storagePath) });
});

app.delete("/api/media/:id", admin, async (req, res) => {
  const allMedia = await getMedia();
  const item = allMedia.find(m => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Media not found." });
  
  const articles = await getNewsArticles();
  if (articles.some((n) => n.featured_image === item.storage_path))
    return res.status(409).json({ error: "This image is being used by an article." });
    
  await deleteMediaRecord(req.params.id);
  await deleteObject(item.storage_path, item.storage_bucket);
  res.status(204).end();
});

// -- Dashboard --
app.get("/api/admin/dashboard", admin, async (req, res) => {
  const allNews = await getNewsArticles();
  const decoratedNews = await Promise.all(allNews.map(n => decorate(n)));
  res.json({
    published: decoratedNews.filter((n) => n.status === "published").length,
    drafts: decoratedNews.filter((n) => n.status === "draft").length,
    recent: decoratedNews.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 5),
  });
});

// -- Health Endpoints --
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "better-getafe" });
});

app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/health/storage", (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const gcpConfigured = config.get('database.provider') === "gcp";
  const mediaConfigured = config.get('storage.provider') === "gcp";
  const portalProvider = config.get('portalDatabase.provider');
  
  res.status(200).json({
    environment: isProd ? "production" : "development",
    databaseProvider: config.get('database.provider'),
    userDatabaseProvider: portalProvider,
    mediaProvider: config.get('storage.provider'),
    cloudSqlConfigured: gcpConfigured,
    cloudSqlConnected: serviceStatus.cmsDatabase === 'connected',
    gcsConfigured: mediaConfigured,
    gcsAccessible: serviceStatus.storage === 'connected',
    bucket: config.get('storage.bucket') || "",
    localPersistentStorageEnabled: !isProd
  });
});

app.get("/api/health", (req, res) => {
  const healthy = serviceStatus.cmsDatabase === 'connected' || serviceStatus.cmsDatabase === 'local';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    cmsDatabase: serviceStatus.cmsDatabase,
    portalDatabase: serviceStatus.portalDatabase,
  });
});

app.get("/ready", (req, res) => {
  const ready = Object.values(serviceStatus).every((status) => status === 'connected' || status === 'local');
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    services: {
      cmsDatabase: serviceStatus.cmsDatabase,
      portalDatabase: serviceStatus.portalDatabase,
      storage: serviceStatus.storage
    }
  });
});

// Keep API failures machine-readable so the dashboard never tries to parse an
// HTML error page as JSON. Log the original error server-side for diagnosis.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('API request failed:', error?.message || error);
  if (req.path.startsWith('/api/')) return res.status(503).json({ error: 'The service is temporarily unavailable.' });
  next(error);
});
app.put(/^\/uploads\/(.+)$/, admin, express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  const relative = req.params[0];
  if (!relative || relative.includes('..') || relative.includes('\\') || !/^[a-zA-Z0-9_\/-]+\.(jpg|png|webp)$/.test(relative)) return res.status(400).json({ error: 'Invalid upload path.' });
  try {
    const root = path.resolve(config.get('storage.localPath') || 'data/uploads');
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`)) return res.status(400).json({ error: 'Invalid upload path.' });
    await (await import('node:fs/promises')).mkdir(path.dirname(target), { recursive: true });
    await (await import('node:fs/promises')).writeFile(target, req.body);
    res.status(200).json({ ok: true });
  } catch { res.status(503).json({ error: 'Local upload storage is unavailable.' }); }
});
app.use('/uploads', express.static(path.resolve(config.get('storage.localPath') || 'data/uploads')));
const crawlableRoutes = ['/', '/info/about', '/info/accessibility', '/info/history', '/info/officials', '/info/sitemap', '/contact', '/legal/privacy', '/legal/terms', '/services', '/services/directory', '/services/barangays', '/services/hotlines', '/services/business-trade', '/services/certificates', '/services/education', '/services/health', '/weather', '/news', '/tourism', '/events'];
app.get('/sitemap.xml', async (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  let routes = [...crawlableRoutes];
  try {
    const records = await getBarangays();
    routes = routes.concat(records.map((item) => `/services/barangays/${item.id}`));
  } catch { /* Keep the core sitemap available if CMS data is unavailable. */ }
  const urls = routes.map((route) => `<url><loc>${origin}${route}</loc></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});
app.get('/robots.txt', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /auth/\nDisallow: /admin/\nDisallow: /api/\nDisallow: /uploads/\nSitemap: ${origin}/sitemap.xml\n`);
});
app.use(express.static(path.join(__dirname, "dist")));
app.use((req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

async function startServer() {
  try {
    console.log('[STARTUP 1/8] Process started');
    const isProd = process.env.NODE_ENV === 'production';
    console.log(`[STARTUP 2/8] Environment: ${process.env.NODE_ENV || 'development'}`);
    
    console.log('[STARTUP 3/8] Validating Cloud Run configuration');
    if (isProd && (!secret || /^(change-this-|replace-with-|your-)/.test(secret))) throw new Error('A bootstrap session signing secret is required.');

    console.log('[STARTUP 4/8] Initializing CMS database (and User database)');
    console.log('[STARTUP 5/8] Initializing user database');
    console.log('[STARTUP 6/8] Initializing Google Cloud Storage');
    
    // We already do timeouts internally in initializeServices
    await initializeServices();
    
    console.log('[STARTUP 7/8] Starting HTTP server');
    const PORT = Number(process.env.PORT) || 8080;
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`[STARTUP 8/8] Server listening on 0.0.0.0:${PORT}`);
    });
    let stopping = false;
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 25000);
      server.close(async (error) => {
        try {
          await closeCloudSql(); await closeConfigStore();
          process.exitCode = error ? 1 : 0;
        } catch {
          console.error('Database shutdown failed');
          process.exitCode = 1;
        } finally {
          clearTimeout(deadline);
        }
      });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('\n[STARTUP FAILED]');
    console.error('Stage: Service initialization');
    console.error(`Message: ${error.message || 'Unknown error'}`);
    console.error(`Stack: ${error.stack}`);
    console.error('Local fallback: DISABLED\n');
    process.exit(1);
  }
}

startServer();



