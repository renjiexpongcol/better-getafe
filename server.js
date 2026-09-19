import { rememberGoogleProfile, googleOnboarding } from './src/services/googleOnboarding.js';
import { installCitizenRoutes } from './src/services/citizenRoutes.js';
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

import express from "express";
import { getGetafeWeather } from './src/services/getafeWeather.js';
import { getAggregatedCurrent, getAggregatedForecast, providerKeys } from './src/services/weatherAggregator.js';
import { closeCloudSql } from './src/services/cloudSql.js';
import path from "path";
import fs from "node:fs/promises";
import crypto from "crypto";
import QRCode from 'qrcode';
import { config } from './src/config/index.js';
import { closeConfigStore } from './src/config/DatabaseSettingsProvider.js';
import { installSettingsRoutes } from './src/services/settingsRoutes.js';
import { installAdminUsersRoutes } from './src/services/adminUsersRoutes.js';
import { loginThrottle, passwordResetEmailThrottle, issueCode, verifyCode, actionThrottle } from './src/services/authSecurity.js';
import { stateKey, stateTransaction, putState, consumeState, readState } from './src/services/authState.js';
import { replacePassword } from './src/services/passwords.js';
import { integrationRequest } from './src/services/integrations.js';
import { sendEmail } from './src/services/email.js';
import { AdaptiveTrafficProtector } from './src/services/trafficProtection.js';

import { fileURLToPath } from "url";
import { initializeServices, serviceStatus } from "./src/services/initialization.js";
import { createUploadUrl, uploadObject, createDownloadUrl, deleteObject, getObjectMetadata, imageSignatureMatches } from "./src/services/storage.js";

import { getCategories, createCategory, updateCategory, deleteCategory } from "./src/repositories/categoryRepository.js";
import { getNewsArticles, getNewsArticleBySlug, createNewsArticle, updateNewsArticle, deleteNewsArticle, bulkUpdateNewsArticles } from "./src/repositories/newsRepository.js";
import { getMedia, finalizePendingUpload, createPendingUpload, deletePendingUpload, deleteMediaRecord, getMediaByStoragePath, getPendingUpload } from "./src/repositories/mediaRepository.js";
import { getCmsUsers, getCmsUserById, getCmsUserByEmail } from "./src/repositories/cmsUserRepository.js";
import { getPortalUserByEmail, getPortalUserById, createPortalUser, savePortalUserMfa, consumePortalRecoveryCode } from "./src/repositories/portalUserRepository.js";
import { generateTotpSecret, verifyTotp, encryptMfaSecret, decryptMfaSecret, generateRecoveryCodes, hashRecoveryCode, recoveryCodeMatches } from './src/services/mfa.js';
import { getOfficials, saveOfficials } from "./src/repositories/officialsRepository.js";
import { getBarangays, saveBarangays } from "./src/repositories/barangaysRepository.js";
import { sanitizeRichText, sanitizeOfficials, sanitizeBarangays } from './src/services/sanitizeHtml.js';
import { getLocalSqlite, id as createId, now as dbNow } from './src/repositories/localDb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
// Cloud Run is behind one trusted proxy in production. Do not trust forwarded
// client-IP headers during local development, where they can be forged.
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
const PORT = process.env.PORT || 8080;

async function configuredWeatherProviders() {
  try { await config.load(); } catch { /* Environment defaults remain available when settings storage is unavailable. */ }
  return providerKeys({
    openWeatherApiKey: config.get('weather.openWeatherApiKey'),
    accuWeatherApiKey: config.get('weather.accuWeatherApiKey'),
  });
}

import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const secret = process.env.AUTH_SESSION_SECRET || process.env.CMS_SESSION_SECRET || process.env.SESSION_SECRET || (
  process.env.NODE_ENV === "production" ? null : "change-this-local-development-session-secret"
);
if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) throw new Error('A random AUTH_SESSION_SECRET of at least 32 characters is required in production.');

const trafficProtector = new AdaptiveTrafficProtector({
  // The callback is evaluated at request time, after authenticated() below is
  // initialized. API keys take precedence; authenticated users share a stable
  // identity across IP changes.
  getAuthenticatedId: req => authenticated(req)?.id,
});
app.use(trafficProtector.middleware());
// Rate limits run before parsing bodies so large JSON payloads cannot consume
// parsing capacity after a client has already been rejected.
app.use(express.json({ limit: "8mb" }));

// All browser API access must come through the portal application. This is a
// request boundary only; endpoint-specific authentication still applies.
app.use('/api', (req, res, next) => {
  // Image elements cannot attach custom fetch headers. Allow only the avatar
  // image subresource; its resident middleware still enforces authentication.
  const isAvatarImage = req.path === '/citizen/profile/avatar' && req.get('Sec-Fetch-Dest') === 'image';
  // Logout must remain available to clear a stale session even if an older
  // frontend bundle sends the request without the application header.
  const requestPath = req.originalUrl.split('?')[0];
  const isLogout = req.method === 'POST' && (req.path === '/auth/logout' || requestPath === '/api/auth/logout');
  // OAuth starts and finishes through a top-level browser navigation, so the
  // browser cannot provide the portal's X-Requested-With header. Keep these
  // two public entry points available while the routes below validate state.
  const isGoogleOAuthRequest = req.method === 'GET' && (req.path === '/auth/google' || req.path === '/auth/google/callback');
  if (req.get('X-Requested-With') === 'GetafeCitizenPortal' || isAvatarImage || isLogout || isGoogleOAuthRequest) return next();
  if (req.accepts('html')) {
    return res.status(403).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Access Restricted · Getafe Citizen Portal</title><style>:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f8fafc;color:#172033}.card{width:min(100%,520px);padding:42px 38px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 20px 55px #0f172a1a;text-align:center}.icon{width:64px;height:64px;display:grid;place-items:center;margin:0 auto 24px;border-radius:18px;background:#eff6ff;color:#2563eb}.icon svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.8}h1{margin:0 0 24px;font-size:clamp(1.7rem,4vw,2.15rem);letter-spacing:-.04em}.badge{display:inline-flex;padding:8px 13px;border-radius:999px;background:#fef2f2;color:#b91c1c;font-size:.78rem;font-weight:800;letter-spacing:.04em}</style></head><body><main class="card"><div class="icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/></svg></div><h1>Access Restricted</h1><span class="badge">HTTP 403 Forbidden</span></main></body></html>`);
  }
  return res.status(403).json({ error: 'Forbidden', message: 'Direct API access restricted. Please use the Getafe Citizen Portal application.' });
});
app.get('/api/weather/getafe', async (req, res) => {
  try {
    const weather = await getGetafeWeather();
    res.set('Cache-Control', 'public, max-age=900').json(weather);
  } catch {
    res.status(502).json({ error: 'Getafe weather is temporarily unavailable.' });
  }
});
app.get('/api/weather/forecast', async (req, res) => {
  const latitude = Number(req.query.lat), longitude = Number(req.query.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return res.status(400).json({ error: 'A valid location is required.' });
  try {
    const keys = await configuredWeatherProviders();
    const data = await getAggregatedForecast({ name: 'Selected location', lat: latitude, lon: longitude }, keys);
    res.set('Cache-Control', 'public, max-age=900').json(data);
  } catch (error) { res.status(502).json({ error: error.message || 'Weather forecast unavailable.' }); }
});
app.get('/api/weather', async (req, res) => {
  const locations = [{ name: 'Getafe', lat: 10.15, lon: 124.15 }, { name: 'Manila', lat: 14.5995, lon: 120.9842 }, { name: 'Cebu', lat: 10.3157, lon: 123.8854 }, { name: 'Davao', lat: 7.1907, lon: 125.4553 }, { name: 'Baguio', lat: 16.4023, lon: 120.596 }];
  try {
    const keys = await configuredWeatherProviders();
    const results = await Promise.all(locations.map(location => getAggregatedCurrent(location, keys)));
    res.set('Cache-Control', 'public, max-age=900').json(results);
  } catch (error) { res.status(502).json({ error: error.message || 'Weather providers are temporarily unavailable.' }); }
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
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/; connect-src 'self' https:; font-src 'self' data: https:; form-action 'self'");
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.path.startsWith('/api/')) {
    const hasCookieSession = Boolean(readCookies(req.headers.cookie)[SESSION_COOKIE]);
    const bearer = req.headers.authorization?.startsWith('Bearer ');
    const isPortalRequest = req.get('X-Requested-With') === 'GetafeCitizenPortal';
    const source = req.get('origin') || (req.get('referer') ? (() => { try { return new URL(req.get('referer')).origin } catch { return '' } })() : '');
    // The configured URL is the canonical public URL, but deployments may be
    // reached through a reverse proxy or an alternate host. In those cases a
    // browser same-origin request must be checked against the effective
    // request origin as well, otherwise every state-changing citizen action
    // is incorrectly rejected as cross-site.
    const effectiveHost = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    const effectiveOrigin = effectiveHost ? new URL(`${req.protocol}://${effectiveHost}`).origin : '';
    const configuredOrigin = config.get('general.url') ? new URL(config.get('general.url')).origin : '';
    const isLogoutRequest = req.method === 'POST' && req.originalUrl.split('?')[0] === '/api/auth/logout';
    if (hasCookieSession && !bearer && !isLogoutRequest && !isPortalRequest && source && ![effectiveOrigin, configuredOrigin].includes(source)) return res.status(403).json({ error: 'Cross-site request blocked.' });
  }
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
const revokedTokens = new Map();

const makeToken = (user, kind, remember = false) => {
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, kind, updatedAt: user.updated_at || user.updatedAt || null, iat: issuedAt, remember, exp: issuedAt + (remember ? config.get('authentication.rememberDays') * 86400000 : config.get('authentication.sessionMinutes') * 60000) })).toString("base64url");
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
    const revokedUntil = revokedTokens.get(signature);
    if (revokedUntil && revokedUntil > Date.now()) return null;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!(data.exp > Date.now() && (data.iat || 0) + (data.remember ? config.get('authentication.rememberDays') * 86400000 : config.get('authentication.sessionMinutes') * 60000) > Date.now())) return null;
    data.signature = signature;
    return data;
  } catch {
    return null;
  }
}

const tokenIsRevoked = async session => Boolean(session?.signature && await readState(stateKey('revoked-token', session.signature)));

const admin = async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  req.admin = authenticated(req);
  if (await tokenIsRevoked(req.admin) || req.admin?.kind !== 'cms' || !['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(req.admin.role)) {
    return res.status(401).json({ error: "Administrator authentication required." });
  }
  try {
    const user = await getCmsUserById(req.admin.id);
    if (!user || !['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user.role) || (req.admin.updatedAt && req.admin.updatedAt !== (user.updated_at || user.updatedAt || null))) return res.status(401).json({ error: "Administrator authentication required." });
    req.admin = safeUser(user);
    next();
  } catch (error) {
    console.error('Administrator authorization lookup failed:', error.message);
    res.status(503).json({ error: "Authentication service is temporarily unavailable." });
  }
};

const resident = async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  const session = authenticated(req);
  if (!session || await tokenIsRevoked(session) || session.kind !== 'portal' || session.role !== 'resident') return res.status(401).json({ error: 'Resident authentication required.' });
  req.resident = await getPortalUserById(session.id);
  if (!req.resident || (session.updatedAt && session.updatedAt !== (req.resident.updated_at || req.resident.updatedAt || null))) return res.status(401).json({ error: 'Resident account unavailable.' });
  const onboarding = await googleOnboarding(req.resident);
  if (onboarding.setupRequired && !req.path.startsWith('/api/citizen/onboarding/') && !['/api/citizen/profile', '/api/citizen/profile/avatar'].includes(req.path)) return res.status(403).json({ error: 'Complete your account information before using the app.', setupRequired: true });
  next();
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

const setGoogleOAuthStateCookie = (res, value, secure) => {
  res.append('Set-Cookie', `google_oauth_state=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`);
};

const clearGoogleOAuthStateCookie = (res, secure) => {
  res.append('Set-Cookie', `google_oauth_state=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
};

const safeUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, mfaEnabled: user.mfa_enabled === true || user.mfa_enabled === 1 });

function validateArticle(body, res) {
  if (body.content_type !== undefined && !['news', 'event', 'meeting'].includes(body.content_type)) {
    res.status(422).json({ error: "Content type must be News, Event, or Meeting." });
    return false;
  }
  for (const field of ['show_in_news', 'show_in_upcoming', 'show_in_events', 'show_on_homepage']) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') {
      res.status(422).json({ error: `${field} must be true or false.` });
      return false;
    }
  }
  if (body.is_important !== undefined && typeof body.is_important !== 'boolean') {
    res.status(422).json({ error: "Important announcement must be true or false." });
    return false;
  }
  if (!body.title?.trim() || !body.excerpt?.trim() || !body.content?.trim() || body.title.length > 300 || body.excerpt.length > 1000 || body.content.length > 50000) {
    res.status(422).json({ error: "Title, excerpt, and content are required." });
    return false;
  }
  body.content = sanitizeRichText(body.content);
  if (!body.content.trim()) { res.status(422).json({ error: "Article content contains no permitted markup." }); return false; }
  if (body.published_at && Number.isNaN(new Date(body.published_at).getTime())) {
    res.status(422).json({ error: "Publication date must be valid." });
    return false;
  }
  if (body.event_start_at && Number.isNaN(new Date(body.event_start_at).getTime())) {
    res.status(422).json({ error: "Event start date must be valid." });
    return false;
  }
  if (body.event_end_at && Number.isNaN(new Date(body.event_end_at).getTime())) {
    res.status(422).json({ error: "Event end date must be valid." });
    return false;
  }
  if (body.event_start_at && body.event_end_at && new Date(body.event_end_at) < new Date(body.event_start_at)) {
    res.status(422).json({ error: "Event end date cannot be earlier than its start date." });
    return false;
  }
  if (body.show_in_upcoming === true && (!['event', 'meeting'].includes(body.content_type) || !body.event_start_at)) {
    res.status(422).json({ error: "Upcoming content must be an Event or Meeting with a start date." });
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
    is_important: article.is_important === true || article.is_important === 1,
    show_in_news: article.show_in_news === true || article.show_in_news === 1,
    show_in_upcoming: article.show_in_upcoming === true || article.show_in_upcoming === 1,
    show_in_events: article.show_in_events === true || article.show_in_events === 1,
    show_on_homepage: article.show_on_homepage === true || article.show_on_homepage === 1,
    content: sanitizeRichText(String(article.content || '').replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '')),
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
      .filter((article) => article.status === 'published' && (article.show_in_news === true || article.show_in_news === 1) && article.published_at && new Date(article.published_at) <= new Date())
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
    if (!await actionThrottle('article-feedback', visitorIdentity(req), 3, 60 * 60 * 1000)) return res.status(429).json({ error: 'Please wait before sending another report.' });
    const title = String(req.body.articleTitle || '').slice(0, 300);
    const url = String(req.body.articleUrl || '').slice(0, 1000);
    const feedback = String(req.body.feedback || '').slice(0, 4000);
    const includeScreenshot = req.body.includeScreenshot === true;
    const screenshotData = String(req.body.screenshotData || '');
    const reasons = Array.isArray(req.body.reasons) ? req.body.reasons.map(String).slice(0, 10) : [];
    const recipient = config.get('general.supportEmail') || config.get('email.senderEmail');
    if (!recipient) return res.status(503).json({ error: 'Feedback email is not configured.' });
    const configuredUrl = config.get('general.url');
    if (configuredUrl) {
      try { if (new URL(url).origin !== new URL(configuredUrl).origin) return res.status(422).json({ error: 'The article URL is not valid.' }); }
      catch { return res.status(422).json({ error: 'The article URL is not valid.' }); }
    }
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
    if (password.length > 1024) return res.status(422).json({ error: 'Password must be 1,024 characters or fewer.' });
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
    if (kind === 'portal' && (user.mfa_enabled === true || user.mfa_enabled === 1)) {
      const challengeId = crypto.randomBytes(32).toString('hex');
      await putState(stateKey('mfa-login', challengeId), { id: user.id, remember, attempts: 0 }, 5 * 60 * 1000);
      return res.json({ mfaRequired: true, mfaChallengeId: challengeId });
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

app.post('/api/auth/mfa/verify', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  try {
    const challengeId = String(req.body.challengeId || '');
    const code = String(req.body.code || '');
    const key = stateKey('mfa-login', challengeId);
    const challenge = await readState(key);
    if (!challenge) return res.status(401).json({ error: 'This MFA challenge has expired. Sign in again.' });
    const user = await getPortalUserById(challenge.id);
    if (!user || !(user.mfa_enabled === true || user.mfa_enabled === 1) || !user.mfa_secret_encrypted) return res.status(401).json({ error: 'MFA is unavailable for this account.' });
    const totpValid = verifyTotp(decryptMfaSecret(user.mfa_secret_encrypted), code);
    const recoveryValid = totpValid ? false : await consumePortalRecoveryCode(user.id, code, recoveryCodeMatches);
    if (!totpValid && !recoveryValid) {
      const attempts = await stateTransaction(key, async current => {
        if (!current) return { value: null, result: 5 };
        current.attempts = (current.attempts || 0) + 1;
        return { value: current.attempts >= 5 ? null : current, expires: Date.now() + 5 * 60 * 1000, result: current.attempts };
      });
      return res.status(401).json({ error: attempts >= 5 ? 'Too many attempts. Sign in again.' : 'Invalid authenticator or recovery code.' });
    }
    await consumeState(key);
    setSessionCookie(res, makeToken(user, 'portal', challenge.remember), challenge.remember);
    res.json({ user: safeUser(user), admin: false, recoveryCodeUsed: recoveryValid });
  } catch (error) {
    console.error('MFA verification failed:', error.message);
    res.status(503).json({ error: 'MFA verification is temporarily unavailable.' });
  }
});

app.get('/api/auth/google', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const clientId = config.get('google.clientId');
  if (!clientId) return res.status(503).json({ error: 'Google sign-in is not configured.' });
  const intent = req.query.intent === 'signup' ? 'signup' : 'signin';
  const state = crypto.randomBytes(24).toString('hex');
  setGoogleOAuthStateCookie(res, `${state}.${intent}`, req.secure);
  const redirect = config.get('google.redirectUri') || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  res.redirect(url.toString());
});
app.get('/api/auth/google/callback', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cookies = readCookies(req.headers.cookie);
    const [savedState, intent = 'signin'] = String(cookies.google_oauth_state || '').split('.');
    if (!req.query.code || !req.query.state || savedState !== req.query.state) return res.status(400).send('Invalid Google sign-in state.');
    const redirect = config.get('google.redirectUri') || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: config.get('google.clientId'), client_secret: config.get('google.clientSecret'), redirect_uri: redirect, grant_type: 'authorization_code' }) });
    const token = await tokenResponse.json(); if (!tokenResponse.ok) throw new Error('Google token exchange failed.');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResponse.json(); if (!profileResponse.ok || !profile.email_verified || typeof profile.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) throw new Error('Google account email is not verified.');
    const cmsUser = await getCmsUserByEmail(profile.email);
    if (cmsUser) {
      if (intent === 'signup') { clearGoogleOAuthStateCookie(res, req.secure); return res.redirect('/auth/login?google=existing'); }
      setSessionCookie(res, makeToken(cmsUser, 'cms', true), true);
      clearGoogleOAuthStateCookie(res, req.secure);
      return res.redirect('/admin');
    }
    let user = await getPortalUserByEmail(profile.email);
    if (user && intent === 'signup') { clearGoogleOAuthStateCookie(res, req.secure); return res.redirect('/auth/login?google=existing'); }
    if (!user) { user = await createPortalUser(profile.name || profile.email, profile.email, hash(crypto.randomBytes(32).toString('hex'))); }
    await rememberGoogleProfile(user, profile);
    const onboarding = await googleOnboarding(user);
    if (user.mfa_enabled === true || user.mfa_enabled === 1) {
      const challengeId = crypto.randomBytes(32).toString('hex');
      await putState(stateKey('mfa-login', challengeId), { id: user.id, remember: true, attempts: 0 }, 5 * 60 * 1000);
      clearGoogleOAuthStateCookie(res, req.secure);
      return res.redirect(`/auth/login?mfa=${encodeURIComponent(challengeId)}`);
    }
    setSessionCookie(res, makeToken(user, 'portal', true), true); clearGoogleOAuthStateCookie(res, req.secure); res.redirect(onboarding.setupRequired ? '/app/setup' : '/app/dashboard');
  } catch (error) { console.error('Google OAuth callback failed:', error.message); res.status(503).send('Google sign-in is temporarily unavailable.'); }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const session = authenticated(req);
    const cookies = readCookies(req.headers.cookie);
    if (config.get('advanced.authDebug')) {
      console.info('Auth session check:', { cookiePresent: Boolean(cookies[SESSION_COOKIE]), sessionValid: Boolean(session) });
    }
    if (!session) {
      if (cookies[SESSION_COOKIE]) clearSessionCookie(res);
      return res.status(401).json({ user: null, error: 'Authentication required.' });
    }
    if (await tokenIsRevoked(session)) {
      clearSessionCookie(res);
      return res.status(401).json({ user: null });
    }
    const user = session.kind === 'cms' ? await getCmsUserById(session.id) : await getPortalUserById(session.id);
    if (!user || (session.updatedAt && session.updatedAt !== (user.updated_at || user.updatedAt || null))
      || (session.kind === 'cms' && !['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user.role))
      || (session.kind === 'portal' && user.role !== 'resident')) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Authentication required." });
    }
    res.json({ user: { ...safeUser(user), ...(session.kind === 'portal' ? await googleOnboarding(user) : {}) }, admin: session.kind === 'cms' && ['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(user.role) });
  } catch (error) {
    console.error('Authentication session lookup failed:', error.message);
    res.status(503).json({ error: "The sign-in service is temporarily unavailable." });
  }
});

app.get('/api/auth/mfa/status', resident, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.json({ enabled: req.resident.mfa_enabled === true || req.resident.mfa_enabled === 1, verifiedAt: req.resident.mfa_verified_at || null });
});

app.post('/api/auth/change-password', resident, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const password = String(req.body.password || '');
    if (!matches(currentPassword, req.resident.password)) return res.status(401).json({ error: 'Current password is incorrect.' });
    if (password.length < 8) return res.status(422).json({ error: 'Password must be at least 8 characters.' });
    if (password === currentPassword) return res.status(422).json({ error: 'Choose a different password.' });
    await replacePassword(req.resident.id, 'portal', password);
    res.json({ ok: true });
  } catch (error) { console.error('Password change failed:', error.message); res.status(503).json({ error: 'Password could not be changed.' }); }
});

app.post('/api/auth/mfa/setup', resident, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  try {
    if (req.resident.mfa_enabled === true || req.resident.mfa_enabled === 1) return res.status(409).json({ error: 'MFA is already enabled.' });
    if (!await actionThrottle('mfa-setup', req.resident.id, 5, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many setup attempts. Please wait and try again.' });
    const secretValue = generateTotpSecret();
    const enrollmentId = crypto.randomBytes(32).toString('hex');
    await putState(stateKey('mfa-enrollment', enrollmentId), { userId: req.resident.id, secret: encryptMfaSecret(secretValue), attempts: 0 }, 10 * 60 * 1000);
    const issuer = config.get('general.name') || 'Municipality of Getafe';
    const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(req.resident.email)}?secret=${secretValue}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    const qrCode = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
    res.json({ enrollmentId, secret: secretValue, qrCode, expiresIn: 600 });
  } catch (error) { console.error('MFA setup failed:', error.message); res.status(503).json({ error: 'MFA setup is temporarily unavailable.' }); }
});

app.post('/api/auth/mfa/activate', resident, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  try {
    const key = stateKey('mfa-enrollment', String(req.body.enrollmentId || ''));
    const enrollment = await readState(key);
    if (!enrollment || enrollment.userId !== req.resident.id) return res.status(401).json({ error: 'This setup has expired. Start again.' });
    const secretValue = decryptMfaSecret(enrollment.secret);
    if (!verifyTotp(secretValue, req.body.code)) {
      const attempts = await stateTransaction(key, async current => {
        if (!current || current.userId !== req.resident.id) return { value: null, result: 5 };
        current.attempts = (current.attempts || 0) + 1;
        return { value: current.attempts >= 5 ? null : current, expires: Date.now() + 10 * 60 * 1000, result: current.attempts };
      });
      return res.status(401).json({ error: attempts >= 5 ? 'Too many invalid codes. Start setup again.' : 'The authenticator code is invalid. Check your device clock and try again.' });
    }
    const recoveryCodes = generateRecoveryCodes();
    const verifiedAt = new Date().toISOString().replace('T', ' ').slice(0, 23);
    await savePortalUserMfa(req.resident.id, { enabled: true, secret: enrollment.secret, recoveryCodes: recoveryCodes.map(code => hashRecoveryCode(code)), verifiedAt });
    await consumeState(key);
    const updated = await getPortalUserById(req.resident.id);
    const currentSession = authenticated(req);
    setSessionCookie(res, makeToken(updated, 'portal', currentSession?.remember === true), currentSession?.remember === true);
    res.json({ enabled: true, recoveryCodes });
  } catch (error) { console.error('MFA activation failed:', error.message); res.status(503).json({ error: 'MFA could not be activated.' }); }
});

app.post('/api/auth/mfa/disable/request', resident, async (req, res) => {
  try {
    if (!(req.resident.mfa_enabled === true || req.resident.mfa_enabled === 1)) return res.status(409).json({ error: 'MFA is not enabled.' });
    if (!await actionThrottle('mfa-disable-email', req.resident.id, 3, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many requests. Please wait before requesting another code.' });
    const challengeId = await issueCode(req.resident.email, 'mfa-disable', { userId: req.resident.id });
    res.json({ challengeId, message: 'A confirmation code has been sent to your email address.' });
  } catch (error) { console.error('MFA disable code failed:', error.message); res.status(503).json({ error: 'We could not send the confirmation code.' }); }
});

app.post('/api/auth/mfa/disable/confirm', resident, async (req, res) => {
  try {
    const payload = await verifyCode(String(req.body.challengeId || ''), String(req.body.code || ''), 'mfa-disable');
    if (!payload || payload.userId !== req.resident.id) return res.status(401).json({ error: 'Invalid or expired confirmation code.' });
    await savePortalUserMfa(req.resident.id, { enabled: false, secret: null, recoveryCodes: [], verifiedAt: null });
    const updated = await getPortalUserById(req.resident.id);
    const currentSession = authenticated(req);
    setSessionCookie(res, makeToken(updated, 'portal', currentSession?.remember === true), currentSession?.remember === true);
    res.json({ enabled: false });
  } catch (error) { console.error('MFA disable failed:', error.message); res.status(503).json({ error: 'MFA could not be disabled.' }); }
});

app.post("/api/auth/logout", async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  clearSessionCookie(res);
  res.append('Set-Cookie', `google_oauth_state=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${req.secure ? '; Secure' : ''}`);
  const cookieSession = authenticated({ headers: { cookie: req.headers.cookie } });
  const bearerSession = req.headers.authorization?.startsWith('Bearer ') ? authenticated({ headers: { authorization: req.headers.authorization } }) : null;
  for (const session of [cookieSession, bearerSession].filter((value, index, sessions) => value && sessions.findIndex(item => item?.signature === value.signature) === index)) {
    const remaining = Math.max(1, session.exp - Date.now());
    revokedTokens.set(session.signature, Date.now() + remaining);
    try { await putState(stateKey('revoked-token', session.signature), true, remaining); }
    catch (error) {
      console.error('Session revocation failed:', error.message);
      return res.status(503).json({ error: 'Sign out could not be completed.' });
    }
  }
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
      const throttle = await passwordResetEmailThrottle(user.email);
      if (!throttle.allowed) return res.status(429).json({ error: `Please wait ${throttle.retryAfter} seconds before requesting another code.`, retryAfter: throttle.retryAfter });
      const challengeId = await issueCode(user.email, 'password-reset', { id: user.id, kind: cmsUser ? 'cms' : 'portal' });
      return res.json({ challengeId, retryAfter: throttle.retryAfter });
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
    const ipKey = stateKey('registration-attempts', req.ip || 'unknown');
    const allowed = await stateTransaction(ipKey, async current => {
      const value = current || { count: 0 };
      if (value.count >= config.get('security.registrationRateLimit')) return { value, expires: Date.now() + 3600000, result: false };
      value.count++;
      return { value, expires: Date.now() + 3600000, result: true };
    });
    if (!allowed) return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
    if (config.get('security.registrationCaptcha')) {
      const token = String(req.body.captchaToken || '');
      const secretKey = config.get('security.recaptchaSecretKey');
      if (!secretKey || !token) return res.status(422).json({ error: 'Please complete the reCAPTCHA verification.' });
      const verification = await fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(req.ip || '')}`);
      const result = await verification.json();
      if (!verification.ok || !result.success) return res.status(422).json({ error: 'reCAPTCHA verification failed. Please try again.' });
    }
    const name = String(req.body.name || "").trim(),
      email = String(req.body.email || "").trim().toLowerCase(),
      password = String(req.body.password || "");
    if (password.length > 1024) return res.status(422).json({ error: 'Password must be 1,024 characters or fewer.' });
    if (!name || name.length > 160 || email.length > 255 || !isValidEmail(email) || !passwordIsStrong(password) || password.length < config.get('authentication.passwordMinLength'))
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
installAdminUsersRoutes(app, admin);
installCitizenRoutes(app, resident, safeUser);

app.get('/api/public/config', (req, res) => {
  // This endpoint is only an internal bootstrap request. Reject direct browser
  // navigation and cross-site requests to prevent public hotlinking.
  const origin = req.get('origin');
  const referer = req.get('referer');
  const requestHost = `${req.protocol}://${req.get('host')}`;
  const sameOrigin = (!origin && !referer)
    || req.get('sec-fetch-site') === 'same-origin'
    || origin === requestHost
    || (referer && referer.startsWith(`${requestHost}/`));
  if (req.get('sec-fetch-dest') === 'document' || !sameOrigin) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const publicKeys = Object.keys(config.values).filter(key => key.startsWith('general.') || key.startsWith('features.') || ['authentication.registrationEnabled', 'authentication.passwordMinLength', 'security.registrationCaptcha', 'security.recaptchaProvider', 'security.recaptchaSiteKey', 'notifications.enabled', 'maintenance.enabled', 'maintenance.message', 'maintenance.expectedCompletion'].includes(key));
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
// Privacy request administration is part of the CMS Administrator role. Keep
// this check aligned with the navigation and the general admin middleware;
// restricting it to super_admin makes regular Administrators see an option
// they can never use.
const privacyAdmin = (req, res, next) => ['admin', 'super_admin'].includes(req.admin?.role)
  ? next()
  : res.status(403).json({ error: 'Data privacy requests require an authorized privacy administrator.' });
app.get('/api/admin/privacy-requests', admin, privacyAdmin, async (req, res) => {
  const db = await getLocalSqlite(), requests = db.prepare('SELECT * FROM privacy_requests ORDER BY created_at DESC').all();
  res.json(requests.map(request => ({ ...request, events: db.prepare('SELECT * FROM privacy_request_events WHERE request_id = ? ORDER BY created_at DESC').all(request.id) })));
});
app.patch('/api/admin/privacy-requests/:id', admin, privacyAdmin, async (req, res) => {
  const allowed = new Set(['submitted', 'identity_verified', 'under_review', 'processing', 'completed', 'additional_information_required', 'partially_completed', 'rejected_unable_to_delete', 'cancelled']);
  const status = String(req.body?.status || ''), note = String(req.body?.note || '').trim().slice(0, 2000);
  if (!allowed.has(status)) return res.status(422).json({ error: 'Choose a valid privacy request status.' });
  if (!note) return res.status(422).json({ error: 'Add an internal or citizen-facing explanation for this update.' });
  const db = await getLocalSqlite(), request = db.prepare('SELECT id FROM privacy_requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Privacy request not found.' });
  const updated = dbNow();
  db.prepare('UPDATE privacy_requests SET status = ?, updated_at = ?, review_note = ? WHERE id = ?').run(status, updated, note, request.id);
  db.prepare('INSERT INTO privacy_request_events (id,request_id,actor_id,actor_type,event,note,created_at) VALUES (?,?,?,?,?,?,?)').run(createId(), request.id, req.admin.id, 'admin', `status:${status}`, note, updated);
  res.json({ ok: true, status, updated_at: updated });
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
  try { res.json((await getNewsArticles()).filter(article => article.status === 'published' && (article.show_in_news === true || article.show_in_news === 1) && new Date(article.published_at) <= new Date()).slice(-10).map(article => ({ id: article.id, title: article.title, slug: article.slug }))); }
  catch { res.status(503).json({ error: 'Notifications unavailable.' }); }
});

// -- CMS News --
app.get("/api/news", async (req, res) => {
  const allNews = await getNewsArticles();
  const session = authenticated(req);
  const isAdmin = req.query.public !== 'true' && session && !(await tokenIsRevoked(session)) && session.kind === 'cms' && ['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(session.role);
  let items = allNews.filter((n) => isAdmin || (n.status === "published" && n.published_at && new Date(n.published_at) <= new Date()));

  // The landing-page feed must only expose live announcements, even to CMS admins.
  if (req.query.important === 'true') {
    items = items.filter((n) => (n.is_important === true || n.is_important === 1) && (n.show_on_homepage === true || n.show_on_homepage === 1) && n.status === 'published' && n.published_at && new Date(n.published_at) <= new Date());
  }

  if (req.query.status && isAdmin) items = items.filter((n) => n.status === req.query.status);
  if (req.query.type) items = items.filter((n) => n.content_type === req.query.type);

  const displayField = { news: 'show_in_news', upcoming: 'show_in_upcoming', events: 'show_in_events', homepage: 'show_on_homepage' }[req.query.display];
  if (displayField) items = items.filter((n) => n[displayField] === true || n[displayField] === 1);
  if (req.query.homepage === 'true') items = items.filter((n) => n.show_on_homepage === true || n.show_on_homepage === 1);
  if (req.query.temporal === 'upcoming') {
    const now = new Date();
    items = items.filter((n) => ['event', 'meeting'].includes(n.content_type) && n.event_start_at && new Date(n.event_end_at || n.event_start_at) >= now);
  } else if (req.query.temporal === 'past') {
    const now = new Date();
    items = items.filter((n) => ['event', 'meeting'].includes(n.content_type) && n.event_start_at && new Date(n.event_end_at || n.event_start_at) < now);
  }

  const categories = await getCategories();
  if (req.query.category)
    items = items.filter((n) => n.category_id === req.query.category || categories.find((c) => c.id === n.category_id)?.slug === req.query.category);
  
  if (req.query.search) {
    const q = req.query.search.toLowerCase();
    items = items.filter((n) => `${n.title} ${n.excerpt} ${n.content}`.toLowerCase().includes(q));
  }
  items.sort((a, b) => req.query.temporal === 'upcoming'
    ? new Date(a.event_start_at) - new Date(b.event_start_at)
    : new Date(b.event_start_at || b.published_at || b.created_at) - new Date(a.event_start_at || a.published_at || a.created_at));
  
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
  const isAdmin = req.query.public !== 'true' && session && !(await tokenIsRevoked(session)) && session.kind === 'cms' && ['admin', 'super_admin', 'staff', 'it_support', 'content_manager'].includes(session.role);
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
    console.error('Bulk news update failed:', e.message);
    res.status(500).json({ error: 'The news update could not be completed.' });
  }
});

// -- CMS Categories --
app.get("/api/categories", async (req, res) => {
  const categories = await getCategories();
  res.json(categories);
});

app.get('/api/officials', async (req, res) => {
  try {
    const content = sanitizeOfficials(await getOfficials()) || {};
    const groups = ['mayor', 'viceMayor', 'abcPresident', 'sbMembers', 'punongBarangays', 'deptHeads'];
    const refreshPhoto = async (person) => {
      if (!person?.photo || !/^https?:\/\//i.test(person.photo)) return person;
      try {
        const url = new URL(person.photo);
        const marker = '/media/';
        const index = url.pathname.indexOf(marker);
        if (index < 0) return person;
        return { ...person, photo: await createDownloadUrl(url.pathname.slice(index + 1)) };
      } catch { return person; }
    };
    for (const group of groups) {
      if (Array.isArray(content[group])) content[group] = await Promise.all(content[group].map(refreshPhoto));
      else if (content[group]) content[group] = await refreshPhoto(content[group]);
    }
    res.json(content);
  } catch (error) { console.error('Officials lookup failed:', error.message); res.status(503).json({ error: 'Officials are temporarily unavailable.' }); }
});
app.put('/api/officials', admin, async (req, res) => {
  try { if (!req.body || typeof req.body !== 'object') return res.status(422).json({ error: 'Invalid officials content.' }); res.json(await saveOfficials(sanitizeOfficials(req.body))); }
  catch (error) { console.error('Officials update failed:', error.message); res.status(500).json({ error: 'Officials could not be updated.' }); }
});
app.get('/api/barangays', async (req, res) => {
  try { res.json(sanitizeBarangays(await getBarangays())); } catch (error) { console.error('Barangays lookup failed:', error.message); res.status(503).json({ error: 'Barangays are temporarily unavailable.' }); }
});
app.put('/api/barangays', admin, async (req, res) => {
  try { if (!Array.isArray(req.body)) return res.status(422).json({ error: 'Invalid barangays content.' }); res.json(await saveBarangays(sanitizeBarangays(req.body))); }
  catch (error) { console.error('Barangays update failed:', error.message); res.status(500).json({ error: 'Barangays could not be updated.' }); }
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
    if (config.get('storage.provider') === 'backblaze') await createPendingUpload({
      id: uuid, storagePath, originalFilename: filename, contentType, fileSize,
      uploadedBy: req.admin.id, context, expiresAt, createdAt,
    });
    const uploadUrl = process.env.NODE_ENV !== 'production' && config.get('storage.provider') === 'backblaze'
      ? `/api/media/upload-proxy?storagePath=${encodeURIComponent(storagePath)}&contentType=${encodeURIComponent(contentType)}`
      : await createUploadUrl(storagePath, contentType, fileSize);
    res.json({
      uploadUrl,
      storagePath,
      expiresIn: config.get('storage.signedUrlMinutes') * 60
    });
  } catch (error) {
    if (config.get('storage.provider') === 'backblaze') await deletePendingUpload(storagePath).catch(() => {});
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: "Failed to generate upload URL." });
  }
});

app.put('/api/media/upload-proxy', admin, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '25mb' }), async (req, res) => {
  const storagePath = String(req.query.storagePath || '');
  const contentType = String(req.query.contentType || '');
  if (!/^media\/\d{4}\/\d{2}\/[a-f0-9-]+\.(jpg|png|webp)$/.test(storagePath) || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Invalid upload request.' });
  try { await uploadObject(storagePath, req.body, contentType); res.sendStatus(200); } catch (error) { console.error('Proxy upload failed:', error.message); res.status(502).json({ error: 'Storage upload failed.' }); }
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
  const isLocalStorage = config.get('storage.provider') === 'local';

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

  // Verify object exists and retrieve authoritative metadata from Backblaze B2.
  const storageMetadata = isLocalStorage ? null : await getObjectMetadata(storagePath);
  if (isLocalStorage) {
    const localFile = path.resolve(config.get('storage.localPath') || 'data/uploads', storagePath);
    try {
      const stat = await fs.stat(localFile);
      if (!stat.isFile()) throw new Error('not a file');
      if (stat.size !== Number(pending.file_size) || stat.size > config.get('storage.maxUploadMb') * 1024 * 1024) throw new Error('invalid size');
      const bytes = await fs.readFile(localFile);
      if (!imageSignatureMatches(bytes, pending.content_type)) throw new Error('invalid image');
    } catch { return res.status(404).json({ error: "Uploaded file not found. Upload may have failed." }); }
  }
  if (!isLocalStorage && !storageMetadata) {
    return res.status(404).json({ error: "Backblaze object not found. Upload may have failed." });
  }

  const verifiedContentType = isLocalStorage ? pending.content_type : (storageMetadata.ContentType || 'application/octet-stream');
  const verifiedFileSize = isLocalStorage ? pending.file_size : (Number(storageMetadata.ContentLength) || 0);
  if (!isLocalStorage && (verifiedContentType !== pending.content_type || verifiedFileSize !== Number(pending.file_size))) {
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
  const mediaConfigured = ['backblaze', 'local'].includes(config.get('storage.provider'));
  res.status(200).json({
    storageConfigured: mediaConfigured,
    storageAccessible: serviceStatus.storage === 'connected',
    status: serviceStatus.storage === 'connected' ? 'ok' : 'degraded'
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
  const contentType = relative.endsWith('.jpg') ? 'image/jpeg' : relative.endsWith('.png') ? 'image/png' : 'image/webp';
  if (!Buffer.isBuffer(req.body) || req.body.length > config.get('storage.maxUploadMb') * 1024 * 1024 || !imageSignatureMatches(req.body, contentType)) return res.status(422).json({ error: 'The uploaded file is not a valid supported image.' });
  try {
    const root = path.resolve(config.get('storage.localPath') || 'data/uploads');
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`)) return res.status(400).json({ error: 'Invalid upload path.' });
    await (await import('node:fs/promises')).mkdir(path.dirname(target), { recursive: true });
    await (await import('node:fs/promises')).writeFile(target, req.body);
    res.status(200).json({ ok: true });
  } catch { res.status(503).json({ error: 'Local upload storage is unavailable.' }); }
});
app.use('/uploads', (req, res, next) => {
  const referer = req.get('referer') || req.get('origin');
  if (referer) {
    try {
      const source = new URL(referer);
      const host = req.get('host');
      if (host && source.host !== host) return res.status(403).json({ error: 'External media embedding is not allowed.' });
    } catch { return res.status(400).json({ error: 'Invalid referrer.' }); }
  }
  res.set('Vary', 'Referer, Origin');
  try {
    const pathSegments = decodeURIComponent(req.path).replaceAll('\\', '/').split('/').filter(Boolean);
    if (pathSegments[0] === 'citizen-private' || pathSegments[0] === 'profiles') return res.sendStatus(404);
  }
  catch { return res.sendStatus(400); }
  next();
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
const distDirectory = path.join(__dirname, 'dist');

// Respect a visitor's public-cache preference while keeping private responses
// protected by their existing no-store rules.
app.use((req, res, next) => {
  if (readCookies(req.headers.cookie).getafe_cache === 'off') res.set('Cache-Control', 'no-store, max-age=0');
  next();
});

// Keep the SPA fallback from turning missing JavaScript, CSS, and image files
// into HTML responses. Browsers report that as a misleading MIME-type error
// and dynamic imports fail much later than the actual missing asset request.
app.use('/assets', express.static(path.join(distDirectory, 'assets'), {
  fallthrough: false,
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
  immutable: process.env.NODE_ENV === 'production',
  setHeaders: (res, filePath, stat) => {
    if (readCookies(res.req.headers.cookie).getafe_cache === 'off') res.set('Cache-Control', 'no-store, max-age=0');
  },
}));
app.use(express.static(distDirectory, {
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
  immutable: process.env.NODE_ENV === 'production',
  setHeaders: (res, filePath) => {
    if (path.basename(filePath) === 'index.html') res.set('Cache-Control', 'no-store');
    else if (readCookies(res.req.headers.cookie).getafe_cache === 'off') res.set('Cache-Control', 'no-store, max-age=0');
  },
}));
app.use((req, res) => {
  // A request with a file extension is an asset/API typo, not an SPA route.
  // Return a real 404 instead of serving index.html with text/html.
  if (path.extname(req.path)) return res.status(404).type('text/plain').send('Not found');
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(distDirectory, 'index.html'));
});

async function startServer() {
  try {
    console.log('[STARTUP 1/8] Process started');
    const isProd = process.env.NODE_ENV === 'production';
    console.log(`[STARTUP 2/8] Environment: ${process.env.NODE_ENV || 'development'}`);
    
    console.log('[STARTUP 3/8] Validating Cloud Run configuration');
    if (isProd && (!secret || /^(change-this-|replace-with-|your-)/.test(secret))) throw new Error('A bootstrap session signing secret is required.');

    console.log('[STARTUP 4/8] Initializing CMS database (and User database)');
    console.log('[STARTUP 5/8] Initializing user database');
    console.log('[STARTUP 6/8] Initializing Backblaze B2 storage');
    
    // We already do timeouts internally in initializeServices
    await initializeServices();
    await trafficProtector.start();
    
    console.log('[STARTUP 7/8] Starting HTTP server');
    const PORT = Number(process.env.PORT) || 8080;
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`[STARTUP 8/8] Server listening on 0.0.0.0:${PORT}`);
    });
    // Release slow or incomplete connections instead of allowing them to
    // exhaust the Node worker during a slowloris-style flood.
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    server.keepAliveTimeout = 5_000;
    server.maxRequestsPerSocket = 100;
    let stopping = false;
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 25000);
      server.close(async (error) => {
        try {
          await trafficProtector.stop(); await closeCloudSql(); await closeConfigStore();
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



