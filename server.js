process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

import express from "express";
import path from "path";
import crypto from "crypto";

import { fileURLToPath } from "url";
import { initializeServices, serviceStatus } from "./src/services/initialization.js";
import { createUploadUrl, createDownloadUrl, deleteObject, getObjectMetadata } from "./src/services/storage.js";

import { getCategories, createCategory, updateCategory, deleteCategory } from "./src/repositories/categoryRepository.js";
import { getNewsArticles, getNewsArticleBySlug, createNewsArticle, updateNewsArticle, deleteNewsArticle } from "./src/repositories/newsRepository.js";
import { getMedia, finalizePendingUpload, createPendingUpload, deletePendingUpload, deleteMediaRecord, getMediaByStoragePath, getPendingUpload } from "./src/repositories/mediaRepository.js";
import { getCmsUsers, getCmsUserById, getCmsUserByEmail } from "./src/repositories/cmsUserRepository.js";
import { getPortalUserByEmail, createPortalUser } from "./src/repositories/portalUserRepository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 8080;

import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const secret = process.env.CMS_SESSION_SECRET || (
  process.env.NODE_ENV === "production" ? null : "change-this-local-development-session-secret"
);

app.use(express.json({ limit: "8mb" }));


const hash = (password, salt) => {
  if (!salt) salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
};

const matches = (password, stored) => {
  const [salt, saved] = stored.split(":");
  return crypto.timingSafeEqual(
    Buffer.from(saved, "hex"),
    Buffer.from(hash(password, salt).split(":")[1], "hex"),
  );
};

const makeToken = (user) => {
  const payload = Buffer.from(JSON.stringify({ id: user.id, exp: Date.now() + 43200000 })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
};

function authenticated(req) {
  try {
    const [payload, signature] = (req.headers.authorization || "").replace("Bearer ", "").split(".");
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

const admin = (req, res, next) => {
  req.admin = authenticated(req);
  return req.admin?.role === 'admin'
    ? next()
    : res.status(401).json({ error: "Administrator authentication required." });
};

const cmsSettings = () => ({
  databaseProvider: process.env.CMS_DATABASE_PROVIDER || "local",
  mediaProvider: process.env.CMS_MEDIA_PROVIDER || "local",
  projectId: process.env.GCP_PROJECT_ID || "",
  instanceConnectionName: process.env.CMS_CLOUD_SQL_INSTANCE || "",
  databaseName: process.env.CMS_DB_NAME || "",
  databaseUser: process.env.CMS_DB_USER || "",
  privateIp: process.env.PRIVATE_IP === "true",
  bucket: process.env.GCS_BUCKET_NAME || "",
  publicBaseUrl: process.env.GCS_PUBLIC_BASE_URL || "",
  databasePasswordConfigured: Boolean(process.env.CMS_DB_PASSWORD),
});

function validateArticle(body, res) {
  if (!body.title?.trim() || !body.excerpt?.trim() || !body.content?.trim()) {
    res.status(422).json({ error: "Title, excerpt, and content are required." });
    return false;
  }
  return true;
}

const xmlEscape = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const siteUrl = (req) => {
  const configured = process.env.PUBLIC_SITE_URL || `${req.protocol}://${req.get('host')}`;
  return configured.replace(/\/$/, '');
};

const decorate = async (article) => {
  const categories = await getCategories();
  const users = await getCmsUsers();
  return {
    ...article,
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
    <title>Municipality of Getafe News &amp; Updates</title>
    <link>${xmlEscape(baseUrl)}</link>
    <description>Official announcements, community information, events, services, and tourism updates from the Municipality of Getafe, Bohol.</description>
    <language>en-PH</language>
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

// -- Auth Routes --
app.post("/api/auth/login", async (req, res) => {
  const user = await getCmsUserByEmail(req.body.email || "");
  if (!user || !matches(req.body.password || "", user.password))
    return res.status(401).json({ error: "Invalid administrator credentials." });
  res.json({
    token: makeToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.get("/api/auth/me", admin, async (req, res) => {
  const user = await getCmsUserById(req.admin.id);
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

app.post("/api/portal-auth/login", async (req, res) => {
  try {
    const user = await getPortalUserByEmail(req.body.email || "");
    if (!user)
      return res.status(401).json({ error: "Invalid email or password." });
    if (!matches(req.body.password || "", user.password))
      return res.status(401).json({ error: "Invalid email or password." });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error(error);
    res.status(503).json({ error: "Portal account service is unavailable." });
  }
});

app.post("/api/portal-auth/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim(),
      email = String(req.body.email || "").trim().toLowerCase(),
      password = String(req.body.password || "");
    if (!name || !email || password.length < 8)
      return res.status(422).json({ error: "Name, email, and a password of at least 8 characters are required." });
    
    const user = await createPortalUser(name, email, password);
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    res.status(error?.code === "ER_DUP_ENTRY" ? 409 : 503).json({
      error: error?.code === "ER_DUP_ENTRY" ? "An account with that email already exists." : "Portal account service is unavailable.",
    });
  }
});

// -- Admin Settings --
app.get("/api/admin/settings", admin, (req, res) => res.json(cmsSettings()));

app.put("/api/admin/settings", admin, (req, res) => {
  // CMS settings like site title or theme preferences would be saved to DB here in the future.
  // Infrastructure settings are readonly via the dashboard in a Cloud Run environment.
  res.json({ ...cmsSettings(), saved: true });
});

// -- CMS News --
app.get("/api/news", async (req, res) => {
  const allNews = await getNewsArticles();
  const isAdmin = authenticated(req);
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
  const limit = Math.min(isAdmin ? 100 : 24, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 9));
  const page = Math.max(1, Number(req.query.page || 1));
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
  const isAdmin = authenticated(req);
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

// -- CMS Categories --
app.get("/api/categories", async (req, res) => {
  const categories = await getCategories();
  res.json(categories);
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
    preview_url: await createDownloadUrl(m.storage_path)
  })));
  res.json(decoratedMedia);
});

app.post("/api/storage/upload-url", admin, async (req, res) => {
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

  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowedTypes.has(contentType)) {
    return res.status(422).json({ error: "Use a JPG, PNG, or WEBP image." });
  }
  const extension = filename.toLowerCase().split('.').pop();
  const allowedExtensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (extension !== allowedExtensions[contentType] && !(contentType === 'image/jpeg' && extension === 'jpeg')) {
    return res.status(422).json({ error: "The filename extension must match the content type." });
  }

  if (fileSize > 5 * 1024 * 1024) {
    return res.status(422).json({ error: "File size exceeds 5MB limit." });
  }

  const ext = contentType === "image/jpeg" ? "jpg" : contentType.split('/')[1];
  const uuid = crypto.randomUUID();
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  
  const storagePath = `media/${yyyy}/${mm}/${uuid}.${ext}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 15 * 60 * 1000);

  try {
    await createPendingUpload({
      id: uuid,
      storagePath,
      originalFilename: filename,
      contentType,
      fileSize,
      uploadedBy: req.admin.id,
      context,
      expiresAt,
      createdAt,
    });
    const uploadUrl = await createUploadUrl(storagePath, contentType, fileSize);
    res.json({
      uploadUrl,
      storagePath,
      expiresIn: 900
    });
  } catch (error) {
    await deletePendingUpload(storagePath).catch(() => {});
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: "Failed to generate upload URL." });
  }
});

app.post("/api/media/complete", admin, async (req, res) => {
  const storagePath = String(req.body.storagePath || '');
  const relatedRecordId = req.body.relatedRecordId || null;
  
  if (!storagePath || !/^media\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(storagePath)) {
    return res.status(422).json({ error: "Invalid storage path." });
  }
  if (relatedRecordId && !/^[0-9a-f-]{36}$/i.test(String(relatedRecordId))) {
    return res.status(422).json({ error: "Invalid related record ID." });
  }

  const bucketName = process.env.GCS_BUCKET_NAME || process.env.GCS_BUCKET;

  // Guard against duplicate completion
  const existing = await getMediaByStoragePath(storagePath);
  if (existing) {
    if (existing.uploaded_by !== req.admin.id) return res.status(403).json({ error: "You do not own this upload." });
    return res.status(200).json({ ...existing, preview_url: await createDownloadUrl(storagePath) });
  }

  const pending = await getPendingUpload(storagePath, req.admin.id);
  if (!pending) return res.status(403).json({ error: "Upload was not issued to this administrator or has expired." });

  // Verify object exists and retrieve authoritative metadata from GCS
  const gcsMetadata = await getObjectMetadata(storagePath);
  if (!gcsMetadata) {
    return res.status(404).json({ error: "GCS object not found. Upload may have failed." });
  }

  const verifiedContentType = gcsMetadata.contentType || 'application/octet-stream';
  const verifiedFileSize = parseInt(gcsMetadata.size, 10) || 0;
  if (gcsMetadata.name !== storagePath || verifiedContentType !== pending.content_type || verifiedFileSize !== Number(pending.file_size)) {
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
  await deleteObject(item.storage_path);
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
  const gcpConfigured = (process.env.CMS_DATABASE_PROVIDER || "local") === "gcp";
  const mediaConfigured = (process.env.CMS_MEDIA_PROVIDER || "local") === "gcp";
  const portalProvider = process.env.PORTAL_DATABASE_PROVIDER || process.env.USER_DATABASE_PROVIDER || "local";
  
  res.status(200).json({
    environment: isProd ? "production" : "development",
    databaseProvider: process.env.CMS_DATABASE_PROVIDER || "local",
    userDatabaseProvider: portalProvider,
    mediaProvider: process.env.CMS_MEDIA_PROVIDER || "local",
    cloudSqlConfigured: gcpConfigured,
    cloudSqlConnected: serviceStatus.cmsDatabase === 'connected',
    gcsConfigured: mediaConfigured,
    gcsAccessible: serviceStatus.storage === 'connected',
    bucket: process.env.GCS_BUCKET_NAME || process.env.GCS_BUCKET || "",
    localPersistentStorageEnabled: !isProd
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

app.use(express.static(path.join(__dirname, "dist")));
app.use((req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

async function startServer() {
  try {
    console.log('[STARTUP 1/8] Process started');
    const isProd = process.env.NODE_ENV === 'production';
    console.log(`[STARTUP 2/8] Environment: ${process.env.NODE_ENV || 'development'}`);
    
    console.log('[STARTUP 3/8] Validating Cloud Run configuration');
    if (isProd) {
      const portalProvider = process.env.PORTAL_DATABASE_PROVIDER || process.env.USER_DATABASE_PROVIDER;
      const requiredEnvGroups = [
        ['CMS_DATABASE_PROVIDER'],
        ['CMS_MEDIA_PROVIDER'],
        ['PORTAL_DATABASE_PROVIDER', 'USER_DATABASE_PROVIDER'],
        ['CMS_SESSION_SECRET']
      ];

      if (process.env.CMS_DATABASE_PROVIDER === 'gcp' || portalProvider === 'gcp' || process.env.CMS_MEDIA_PROVIDER === 'gcp') {
        requiredEnvGroups.push(['GCP_PROJECT_ID']);
      }
      if (process.env.CMS_DATABASE_PROVIDER === 'gcp') {
        requiredEnvGroups.push(
          ['CMS_CLOUD_SQL_INSTANCE', 'INSTANCE_CONNECTION_NAME'],
          ['CMS_DB_NAME', 'DB_NAME'],
          ['CMS_DB_USER', 'DB_USER']
        );
        if (process.env.CMS_IAM_AUTH !== 'true') requiredEnvGroups.push(['CMS_DB_PASSWORD', 'DB_PASS']);
      }
      if (portalProvider === 'gcp') {
        requiredEnvGroups.push(
          ['PORTAL_CLOUD_SQL_INSTANCE', 'INSTANCE_CONNECTION_NAME'],
          ['PORTAL_DB_NAME', 'USER_DB_NAME'],
          ['PORTAL_DB_USER', 'USER_DB_USER']
        );
        if (process.env.PORTAL_IAM_AUTH !== 'true') requiredEnvGroups.push(['PORTAL_DB_PASSWORD', 'USER_DB_PASS']);
      }
      if (process.env.CMS_MEDIA_PROVIDER === 'gcp') {
        requiredEnvGroups.push(['GCS_BUCKET_NAME', 'GCS_BUCKET']);
      }
      
      const missing = requiredEnvGroups
        .filter(group => !group.some(env => {
          const value = process.env[env];
          return value && !(env === 'CMS_SESSION_SECRET' && (
            value.startsWith('change-this-') || value.startsWith('replace-with-') || value.startsWith('your-')
          ));
        }))
        .map(group => group.join(' or '));
      if (missing.length > 0) {
        console.error('\n========================================');
        console.error('FATAL CONFIGURATION ERROR');
        console.error('========================================\n');
        console.error('Environment: production\n');
        console.error('Missing required variables:');
        missing.forEach(v => console.error(`- ${v}`));
        console.error('\nAvailable configuration groups:');
        console.error(`- CMS database: ${process.env.CMS_DATABASE_PROVIDER ? 'configured' : 'not configured'}`);
        console.error(`- User database: ${process.env.PORTAL_DATABASE_PROVIDER || process.env.USER_DATABASE_PROVIDER ? 'configured' : 'not configured'}`);
        console.error(`- GCS storage: ${process.env.CMS_MEDIA_PROVIDER ? 'configured' : 'not configured'}\n`);
        console.error('Application startup aborted.');
        console.error('========================================\n');
        process.exit(1);
      }
    }

    console.log('[STARTUP 4/8] Initializing CMS database (and User database)');
    console.log('[STARTUP 5/8] Initializing user database');
    console.log('[STARTUP 6/8] Initializing Google Cloud Storage');
    
    // We already do timeouts internally in initializeServices
    await initializeServices();
    
    console.log('[STARTUP 7/8] Starting HTTP server');
    const PORT = Number(process.env.PORT) || 8080;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[STARTUP 8/8] Server listening on 0.0.0.0:${PORT}`);
    });
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
