import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const CURRENT = Object.freeze({ N: 2 ** 14, r: 8, p: 5, maxmem: 64 * 1024 * 1024 });
const LEGACY = Object.freeze({ N: 2 ** 14, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
const CURRENT_PREFIX = `scrypt$${CURRENT.N}$${CURRENT.r}$${CURRENT.p}$`;

function parsePasswordHash(encoded) {
  const value = String(encoded || '');
  const current = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([0-9a-f]{32})\$([0-9a-f]{128})$/i.exec(value);
  if (current) {
    const [, rawN, rawR, rawP, saltHex, digestHex] = current;
    if (Number(rawN) === CURRENT.N && Number(rawR) === CURRENT.r && Number(rawP) === CURRENT.p) {
      return { saltHex, salt: Buffer.from(saltHex, 'hex'), digestHex, options: CURRENT, current: true };
    }
    return null;
  }
  const legacy = /^([0-9a-f]{32}):([0-9a-f]{128})$/i.exec(value);
  if (legacy) return { saltHex: legacy[1], salt: Buffer.from(legacy[1], 'utf8'), digestHex: legacy[2], options: LEGACY, current: false };
  return null;
}

export async function hashPassword(password) {
  if (typeof password !== 'string') throw new TypeError('Password must be a string.');
  const saltHex = crypto.randomBytes(16).toString('hex');
  const digest = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH, CURRENT);
  return `${CURRENT_PREFIX}${saltHex}$${Buffer.from(digest).toString('hex')}`;
}

export async function verifyPassword(password, storedHash, dummyHash) {
  if (typeof password !== 'string' || password.length > 1024) return { valid: false, needsRehash: false };
  const dummy = parsePasswordHash(dummyHash);
  if (!dummy) throw new Error('Dummy password hash is invalid.');
  const parsed = parsePasswordHash(storedHash);
  const selected = parsed || dummy;
  const paddingOptions = selected.current ? LEGACY : CURRENT;
  const [derived, padding] = await Promise.all([
    scrypt(password, selected.salt, KEY_LENGTH, selected.options),
    scrypt(password, dummy.salt, KEY_LENGTH, paddingOptions),
  ]);
  // Always perform both work factors so unknown accounts and legacy hashes
  // follow a comparable password-work path during this lazy upgrade period.
  void padding;
  const actual = Buffer.from(derived);
  const expected = Buffer.from(selected.digestHex, 'hex');
  const matched = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  return { valid: Boolean(parsed && matched), needsRehash: Boolean(parsed && matched && !parsed.current) };
}
