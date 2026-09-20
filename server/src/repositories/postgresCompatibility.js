// Compatibility exports for repository modules while the application moves to
// the PostgreSQL runtime. No SQLite driver or local SQL database is used.
import crypto from 'node:crypto';
import { getPostgresRuntime } from './postgresRuntime.js';

export const getLocalSqlite = () => getPostgresRuntime('portal');
export const getLocalDb = () => getPostgresRuntime('portal');
export const saveLocalDb = async () => {};
export const isGcp = () => true;
export const isPortalGcp = () => true;
export const id = () => crypto.randomUUID();
export const slugify = (value = '') => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const now = () => new Date().toISOString().replace('T', ' ').substring(0, 23);
export const hash = (password, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;


