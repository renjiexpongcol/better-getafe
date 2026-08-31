process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

import express from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { fileURLToPath } from "url";
import { initializeServices, serviceStatus } from "./src/services/initialization.js";
import { uploadMedia, deleteMedia, getSignedUrl } from "./src/services/storage.js";
import multer from "multer";

const uploadMiddleware = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

import { getCategories, createCategory, updateCategory, deleteCategory } from "./src/repositories/categoryRepository.js";
import { getNewsArticles, getNewsArticleBySlug, createNewsArticle, updateNewsArticle, deleteNewsArticle } from "./src/repositories/newsRepository.js";
import { getMedia, createMediaRecord, deleteMediaRecord } from "./src/repositories/mediaRepository.js";
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

const secret = process.env.CMS_SESSION_SECRET || "change-this-local-development-session-secret";

app.use(express.json({ limit: "8mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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
  return req.admin ? next() : res.status(401).json({ error: "Authentication required." });
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

const decorate = async (article) => {
  const categories = await getCategories();
  const users = await getCmsUsers();
  return {
    ...article,
    featured_image: await getSignedUrl(article.featured_image),
    category: categories.find((c) => c.id === article.category_id) || null,
    author: (() => {
      const u = users.find((u) => u.id === article.author_id);
      return u ? { id: u.id, name: u.name } : null;
    })(),
  };
};

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
  
  const page = Math.max(1, Number(req.query.page || 1)), limit = Math.min(24, Math.max(1, Number(req.query.limit || 9)));
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
  const article = await createNewsArticle(req.body, req.admin.id);
  res.status(201).json(await decorate(article));
});

app.put("/api/news/:id", admin, async (req, res) => {
  if (!validateArticle(req.body, res)) return;
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
    filepath: await getSignedUrl(m.filepath)
  })));
  res.json(decoratedMedia);
});

app.post("/api/media", admin, uploadMiddleware.single("file"), async (req, res) => {
  if (!req.file) return res.status(422).json({ error: "No file uploaded." });
  
  const { originalname, mimetype, buffer, size } = req.file;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimetype)) {
    return res.status(422).json({ error: "Use a JPG, PNG, or WEBP image." });
  }

  const ext = mimetype === "image/jpeg" ? "jpg" : mimetype.split('/')[1];
  const filename = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${ext}`;
  
  const filepath = await uploadMedia(buffer, filename, mimetype, 'media');
  
  const name = req.body.name || originalname;
  const item = await createMediaRecord(name, filepath, mimetype, size, req.admin.id);
  
  // Return signed URL in the response
  res.status(201).json({ ...item, filepath: await getSignedUrl(filepath) });
});

app.delete("/api/media/:id", admin, async (req, res) => {
  const allMedia = await getMedia();
  const item = allMedia.find(m => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Media not found." });
  
  const articles = await getNewsArticles();
  if (articles.some((n) => n.featured_image === item.filepath))
    return res.status(409).json({ error: "This image is being used by an article." });
    
  await deleteMedia(item.filepath);
  
  await deleteMediaRecord(req.params.id);
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
  const userConfigured = (process.env.USER_DATABASE_PROVIDER || "local") === "gcp";
  
  res.status(200).json({
    environment: isProd ? "production" : "development",
    databaseProvider: process.env.CMS_DATABASE_PROVIDER || "local",
    userDatabaseProvider: process.env.USER_DATABASE_PROVIDER || "local",
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
  res.status(200).json({
    status: "ready",
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
      const requiredEnv = [
        'CMS_DATABASE_PROVIDER', 'CMS_MEDIA_PROVIDER', 'USER_DATABASE_PROVIDER',
        'GCP_PROJECT_ID', 'INSTANCE_CONNECTION_NAME', 'DB_NAME', 'DB_USER',
        'USER_DB_NAME', 'USER_DB_USER', 'GCS_BUCKET'
      ];
      
      const missing = requiredEnv.filter(env => !process.env[env]);
      if (missing.length > 0) {
        console.error('\n========================================');
        console.error('FATAL CONFIGURATION ERROR');
        console.error('========================================\n');
        console.error('Environment: production\n');
        console.error('Missing required variables:');
        missing.forEach(v => console.error(`- ${v}`));
        console.error('\nAvailable configuration groups:');
        console.error(`- CMS database: ${process.env.CMS_DATABASE_PROVIDER ? 'configured' : 'not configured'}`);
        console.error(`- User database: ${process.env.USER_DATABASE_PROVIDER ? 'configured' : 'not configured'}`);
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
