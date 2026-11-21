import crypto from 'node:crypto';

export function verifySessionToken(token, secret, { sessionMinutes, rememberDays }, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 4096 || token.split('.').length !== 2) return null;
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !secret) return null;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const bytes = Buffer.from(signature);
    if (bytes.length !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(bytes, Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.id || !data.sid || !Number.isFinite(data.iat) || data.iat > now || !Number.isFinite(data.exp)) return null;
    const lifetime = data.remember ? rememberDays * 86400000 : sessionMinutes * 60000;
    if (!(data.exp > now && data.iat + lifetime > now)) return null;
    return { ...data, signature };
  } catch { return null; }
}
