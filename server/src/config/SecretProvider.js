import crypto from 'node:crypto';
import fs from 'node:fs';
export class SecretProvider {
  constructor(env = process.env, client) { this.env = env; this.client = client; }
  async manager() {
    if (!this.client) { const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager'); this.client = new SecretManagerServiceClient(); }
    return this.client;
  }
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
    if (this.env.SETTINGS_SECRET_PROJECT) {
      const client = await this.manager();
      const secretId = `${this.env.SETTINGS_SECRET_PREFIX || 'getafe'}-${key.replaceAll('.', '-')}`;
      const parent = `projects/${this.env.SETTINGS_SECRET_PROJECT}`;
      try { await client.createSecret({ parent, secretId, secret: { replication: { automatic: {} } } }); }
      catch (error) { if (error.code !== 6) throw new Error('Secret Manager could not create the secret. Check service account permissions.'); }
      const [version] = await client.addSecretVersion({ parent: `${parent}/secrets/${secretId}`, payload: { data: Buffer.from(value) } });
      // Pin the version: uncommitted saves must never change an active secret.
      return { secret_ref: version.name };
    }
    if (this.env.NODE_ENV === 'production') throw new Error('Configure SETTINGS_SECRET_PROJECT to save production secrets with Secret Manager.');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    cipher.setAAD(Buffer.from(key));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { encrypted: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  }
  async open(key, envelope) {
    if (envelope.secret_ref) {
      const [version] = await (await this.manager()).accessSecretVersion({ name: envelope.secret_ref });
      return Buffer.from(version.payload.data).toString('utf8');
    }
    if (envelope.encrypted !== 1) throw new Error('Invalid secret envelope');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(key));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }
}
