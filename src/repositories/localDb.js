import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, "..", "..", "data", "cms.json");

const now = () => new Date().toISOString().replace('T', ' ').substring(0, 23);
const id = () => crypto.randomUUID();
const slugify = (v = "") => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const hash = (password, salt = crypto.randomBytes(16).toString("hex")) => `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;

function seed() {
  const created = now();
  const user = {
    id: id(),
    name: "CMS Administrator",
    email: "admin@getafe.gov.ph",
    password: hash(process.env.CMS_ADMIN_PASSWORD || "ChangeMe123!"),
    role: "admin",
    created_at: created,
    updated_at: created,
  };
  const categories = ["Announcements", "Events", "Community", "Updates", "Press Release"].map((name) => ({
    id: id(),
    name,
    slug: slugify(name),
    created_at: created,
    updated_at: created,
  }));
  const stories = [
    [
      "Municipality of Getafe launches improved online public information portal",
      "Updates",
      "The municipality is making local services and announcements easier to access online.",
      "<p>The Municipality of Getafe is pleased to introduce an improved online portal for residents and visitors. The new experience brings services, local information, and official announcements together in one accessible place.</p>",
    ],
    [
      "Community clean-up drive scheduled this September",
      "Community",
      "Residents, barangays, and civic groups are invited to join the coastal clean-up drive.",
      "<p>All residents are invited to take part in the municipality-wide clean-up drive. Please coordinate with your barangay office for assembly locations and materials.</p>",
    ],
    [
      "Public advisory: municipal office hours",
      "Announcements",
      "A reminder about regular municipal office hours and service channels.",
      "<p>Municipal offices are open Monday through Friday during regular business hours. Online enquiries may also be sent through the contact page.</p>",
    ],
  ];
  return {
    users: [user],
    categories,
    media: [],
    news: stories.map(([title, category, excerpt, content], index) => ({
      id: id(),
      title,
      slug: slugify(title),
      excerpt,
      content,
      featured_image: "",
      category_id: categories.find((c) => c.name === category).id,
      author_id: user.id,
      status: "published",
      published_at: new Date(Date.now() - index * 86400000).toISOString().replace('T', ' ').substring(0, 23),
      created_at: created,
      updated_at: created,
    })),
    portal_users: []
  };
}

export async function getLocalDb() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error("Local JSON database is explicitly disabled in production. Configure Google Cloud SQL.");
  }
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    fs.writeFileSync(dataPath, JSON.stringify(seed(), null, 2));
  }
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

export async function saveLocalDb(data) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error("Local JSON database is explicitly disabled in production. Configure Google Cloud SQL.");
  }
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

export function isGcp() {
  return (process.env.CMS_DATABASE_PROVIDER || "local") === "gcp";
}

export function isPortalGcp() {
  return (process.env.PORTAL_DATABASE_PROVIDER || process.env.USER_DATABASE_PROVIDER || "local") === "gcp";
}

export { id, slugify, now, hash };
