import { getPortalPool } from '../services/cloudSql.js';
import crypto from "crypto";

const now = () => new Date().toISOString().replace('T', ' ').substring(0, 23);
const id = () => crypto.randomUUID();
const hash = (password, salt = crypto.randomBytes(16).toString("hex")) => `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;

export async function getPortalUserByEmail(email) {
  const pool = await getPortalPool();
  if (!pool) throw new Error("Portal account database is not configured.");
  const [rows] = await pool.execute(
    "SELECT id, name, email, password, role FROM portal_users WHERE email = ?",
    [String(email).toLowerCase()]
  );
  return rows[0] || null;
}

export async function createPortalUser(name, email, password) {
  const pool = await getPortalPool();
  if (!pool) throw new Error("Portal account database is not configured.");
  
  const created = now();
  const user = { 
    id: id(), 
    name, 
    email: String(email).toLowerCase(), 
    password: hash(password), 
    role: "resident", 
    created_at: created, 
    updated_at: created 
  };
  
  await pool.execute(
    "INSERT INTO portal_users (id, name, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [user.id, user.name, user.email, user.password, user.role, user.created_at, user.updated_at]
  );
  return user;
}
