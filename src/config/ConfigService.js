import crypto from 'node:crypto';
import { definitions, validate } from './defaults.js';
import { environmentValue } from './EnvironmentProvider.js';
export class ConfigService {
  constructor({ provider, secrets, env = process.env, prepare = async () => ({ activate() {}, discard() {} }) }) {
    this.provider = provider; this.secrets = secrets; this.env = env; this.prepare = prepare;
    this.values = {}; this.sources = {}; this.stored = {}; this.loadedAt = 0; this.attemptedAt = 0; this.available = false;
    this.pending = Promise.resolve();
    for (const key of Object.keys(definitions)) { this.values[key] = environmentValue(key, env) ?? definitions[key].default; this.sources[key] = environmentValue(key, env) !== undefined ? 'environment' : 'default'; }
  }
  get(key) { if (!definitions[key]) throw new Error(`Unknown setting: ${key}`); return this.values[key]; }
  async resolve(stored) {
    const values = {}, sources = {};
    for (const [key, d] of Object.entries(definitions)) {
      if (stored[key] !== undefined && stored[key] !== null) {
        values[key] = d.secret ? await this.secrets.open(key, stored[key]) : stored[key];
        sources[key] = d.secret && stored[key].secret_ref ? 'secret-manager' : 'database';
      } else { const fallback = environmentValue(key, this.env); values[key] = fallback ?? d.default; sources[key] = fallback !== undefined ? 'environment' : 'default'; }
    }
    validate(values);
    return { values, sources };
  }
  serial(work) { const task = this.pending.then(work); this.pending = task.catch(() => {}); return task; }
  async load(force = false) {
    if (!force && Date.now() - this.attemptedAt < 30000) return;
    return this.serial(async () => {
      if (!force && Date.now() - this.attemptedAt < 30000) return;
      this.attemptedAt = Date.now();
      try {
        const stored = await this.provider.read();
        const snapshot = await this.resolve(stored);
        const resources = await this.prepare(snapshot.values, this.values, { initializing: !this.loadedAt });
        resources.activate();
        this.values = snapshot.values; this.sources = snapshot.sources; this.stored = stored; this.available = true; this.loadedAt = Date.now();
      } catch (error) { this.available = false; throw error; }
    });
  }
  snapshot() {
    const values = {}, metadata = {};
    for (const [key, d] of Object.entries(definitions)) {
      values[key] = d.secret ? null : this.values[key];
      metadata[key] = { ...d, env: undefined, default: undefined, source: this.sources[key], configured: d.secret ? Boolean(this.values[key]) : undefined, overridden: Object.hasOwn(this.stored, key), requiresRestart: false, description: d.secret ? 'Leave blank to keep the current secret. Enter a new value to replace it.' : 'Saved settings override environment fallback values.' };
    }
    return { values, metadata, available: this.available };
  }
  update(patch, actor) {
    validate(patch);
    return this.serial(() => this.provider.transaction(async stored => {
      const settings = { ...stored };
      const original = await this.resolve(stored);
      const candidate = { ...original.values };
      const changes = [];
      for (const [key, value] of Object.entries(patch)) {
        const d = definitions[key];
        if (d.secret && value === '') continue;
        if (value === null) {
          const fallback = environmentValue(key, this.env) ?? d.default;
          candidate[key] = fallback;
          if (!Object.hasOwn(settings, key)) continue;
          delete settings[key];
          changes.push(key);
          continue;
        }
        candidate[key] = value; if (!d.secret && settings[key] === value) continue; settings[key] = value;
        changes.push(key);
      }
      validate(candidate);
      const resources = await this.prepare(candidate, this.values, { actor, changed: changes });
      try {
        for (const key of changes) if (definitions[key].secret && patch[key] !== null) settings[key] = await this.secrets.seal(key, patch[key]);
        const snapshot = await this.resolve(settings);
        const audit = changes.map(key => ({ id: crypto.randomUUID(), user_id: actor.id, action: 'settings.update', category: key.split('.')[0], setting_key: key, old_value: definitions[key].secret ? (original.values[key] ? '[SECRET CONFIGURED]' : null) : stored[key] ?? null, new_value: definitions[key].secret ? '[SECRET UPDATED]' : patch[key], ip_address: actor.ip || '', created_at: new Date().toISOString() }));
        return { settings, audit, discard: resources.discard, activate: () => { resources.activate(); this.values = snapshot.values; this.sources = snapshot.sources; this.stored = settings; this.loadedAt = Date.now(); this.available = true; } };
      } catch (error) { await resources.discard(); throw error; }
    }));
  }
  candidate(patch) { validate(patch); const values = { ...this.values }; for (const [key, value] of Object.entries(patch)) { if (definitions[key].secret && value === '') continue; values[key] = value; } return values; }
}
