import crypto from 'node:crypto';
import fs from 'node:fs';
export class SecretProvider {
  constructor(env = process.env) { this.env = env; }
  encryptionKey() {
    let encoded = this.env.SETTINGS_ENCRYPTION_KEY || '';
    if (!encoded && this.env.NODE_ENV !== 'production') {
      const file = this.env.SETTINGS_ENCRYPTION_KEY_FILE || 'data/.settings-encryption-key';
      try { encoded = fs.readFileSync(file, 'utf8').trim(); } catch { encoded = crypto.randomBytes(32).toString('base64'); fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(file, encoded, { mode: 0o600 }); }
      this.env.SETTINGS_ENCRYPTION_KEY = encoded;
    }
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error('Configure the bootstrap SETTINGS_ENCRYPTION_KEY (32 random bytes, base64) before saving secrets.');
    return key;
  }
  async seal(key, value) {
    if (this.env.NODE_ENV === 'production' && !this.env.SETTINGS_ENCRYPTION_KEY) throw new Error('Configure SETTINGS_ENCRYPTION_KEY (32 random bytes, base64) before saving production secrets.');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    cipher.setAAD(Buffer.from(key));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { encrypted: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  }
  async open(key, envelope) {
    if (envelope.secret_ref) throw new Error('A legacy external secret reference is still configured. Move the secret into the matching environment variable before removing the managed secret service.');
    if (envelope.encrypted !== 1) throw new Error('Invalid secret envelope');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(key));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }
}
