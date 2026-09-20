import crypto from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20) {
  const input = crypto.randomBytes(bytes);
  let bits = '';
  for (const byte of input) bits += byte.toString(2).padStart(8, '0');
  return bits.match(/.{1,5}/g).map(chunk => alphabet[Number.parseInt(chunk.padEnd(5, '0'), 2)]).join('');
}

function decodeBase32(value) {
  const normalized = String(value).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  return Buffer.from((bits.match(/.{8}/g) || []).map(byte => Number.parseInt(byte, 2)));
}

function totp(secret, counter) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}

export function verifyTotp(secret, code, now = Date.now()) {
  const candidate = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(candidate)) return false;
  const counter = Math.floor(now / 30000);
  return [-1, 0, 1].some(offset => {
    const expected = Buffer.from(totp(secret, counter + offset));
    return expected.length === candidate.length && crypto.timingSafeEqual(expected, Buffer.from(candidate));
  });
}

function encryptionKey() {
  const material = process.env.MFA_ENCRYPTION_KEY || process.env.AUTH_SESSION_SECRET || process.env.CMS_SESSION_SECRET || process.env.SESSION_SECRET;
  if (!material) throw new Error('MFA encryption key is not configured.');
  return crypto.createHash('sha256').update(material).digest();
}

export function encryptMfaSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptMfaSecret(value) {
  const [version, iv, tag, encrypted] = String(value || '').split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Invalid MFA secret.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => `${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase());
}

export function hashRecoveryCode(code, salt = crypto.randomBytes(16).toString('hex')) {
  const normalized = String(code || '').toUpperCase().replace(/[^A-F0-9]/g, '');
  return `${salt}:${crypto.scryptSync(normalized, salt, 32).toString('hex')}`;
}

export function recoveryCodeMatches(code, stored) {
  try {
    const [salt, digest] = String(stored).split(':');
    const actual = Buffer.from(hashRecoveryCode(code, salt).split(':')[1], 'hex');
    const expected = Buffer.from(digest, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

