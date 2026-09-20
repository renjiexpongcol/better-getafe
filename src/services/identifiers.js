import crypto from 'node:crypto';

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString().replace('T', ' ').substring(0, 23);
export const hash = (password, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
