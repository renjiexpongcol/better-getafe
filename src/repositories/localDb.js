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
  const categories = ["Announcements", "Events", "Community", "Updates", "Press Release", "Tourism", "Services"].map((name) => ({
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
    ["Man-made Mangrove Forest", "Tourism", "Explore one of Getafe's distinctive coastal landscapes.", "<p>Explore one of Getafe's distinctive coastal landscapes and coordinate with local tourism partners before visiting.</p>"],
    ["Pandanon Island", "Tourism", "Discover island horizons and quiet shorelines in coastal Getafe.", "<p>Discover island horizons and quiet shorelines in coastal Getafe. Follow local environmental guidance.</p>"],
    ["Handumon Marine Sanctuary", "Tourism", "Experience a protected marine landscape shaped by community stewardship.", "<p>Experience a protected marine landscape shaped by community stewardship and respect sanctuary rules.</p>"],
    ["Corte Paradise Resort", "Tourism", "Make time for a restful stay surrounded by coastal scenery.", "<p>Make time for a restful stay surrounded by the warmth and scenery of coastal Getafe.</p>"],
    ["Verador Hill", "Tourism", "Take in open views and a greener side of the municipality.", "<p>Take in open views and a slower, greener side of the municipality from the hills above town.</p>"],
    ["Executive", "Services", "The Office of the Mayor coordinates municipal programs and public service delivery.", "<p>Connect with the municipal executive offices for programs, policy coordination, and public service concerns.</p>"],
    ["Engineering", "Services", "Municipal engineering, infrastructure coordination, and public works support.", "<p>Find municipal engineering information, infrastructure coordination, and public works support.</p>"],
    ["Zoning/Planning", "Services", "Land use, development planning, zoning clearances, and planning requirements.", "<p>Get guidance on land use, development planning, zoning clearances, and local planning requirements.</p>"],
    ["Treasury", "Services", "Local tax, payment, business, and revenue-related information.", "<p>Access local tax, payment, business, and revenue-related information from the Municipal Treasurer.</p>"],
    ["Assessment", "Services", "Property assessment, tax declarations, and assessment office transactions.", "<p>Learn about property assessment, tax declarations, and assessment office transactions.</p>"],
    ["Civil Registry", "Services", "Birth, marriage, death, and other civil registry document requests.", "<p>Find information about birth, marriage, death, and other civil registry document requests.</p>"],
    ["Health", "Services", "Municipal health programs, public health services, and rural health support.", "<p>Connect with municipal health programs, public health services, and rural health support.</p>"],
    ["Social Welfare", "Services", "Assistance programs and social welfare support for residents and families.", "<p>Find assistance programs and social welfare support for families and vulnerable residents.</p>"],
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
