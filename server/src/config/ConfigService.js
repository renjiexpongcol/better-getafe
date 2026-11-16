import crypto from 'node:crypto';
import { definitions, isSettingVisible, omitInactiveSettings, validate } from './defaults.js';
import { environmentValue } from './EnvironmentProvider.js';
import { isDependencyFailure } from '../services/dependencyFailures.js';
import { dependencyReason } from '../services/startupDiagnostics.js';
export class ConfigService {
  constructor({ provider, secrets, env = process.env, prepare = async () => ({ activate() {}, discard() {} }) }) {
    this.provider = provider; this.secrets = secrets; this.env = env; this.prepare = prepare;
    this.values = {}; this.sources = {}; this.stored = {}; this.loadedAt = 0; this.attemptedAt = 0; this.available = false;
    this.pending = Promise.resolve();
    for (const key of Object.keys(definitions)) { this.values[key] = environmentValue(key, env) ?? definitions[key].default; this.sources[key] = environmentValue(key, env) !== undefined ? 'environment' : 'default'; }
  }
  get(key) { if (!definitions[key]) throw new Error(`Unknown setting: ${key}`); return isSettingVisible(key, this.values) ? this.values[key] : definitions[key].default; }
  managedByEnvironment(key) {
    return this.sources[key] === 'environment'
      && (key === 'storage.provider' || key === 'storage.configuredProvider' || (/^google\./.test(key) && Boolean(this.localGoogleConfiguration())) || (/^(database|portalDatabase)\./.test(key)
        && this.env.NODE_ENV !== 'production'));
  }
  localGoogleConfiguration() {
    if (this.env.NODE_ENV === 'production') return null;
    const configuration = Object.fromEntries(['google.clientId', 'google.clientSecret', 'google.redirectUri']
      .map(key => [key, environmentValue(key, this.env)]));
    if (Object.values(configuration).some(value => typeof value !== 'string' || !value.trim())) return null;
    return configuration;
  }
  async resolve(stored) {
    const values = {}, sources = {};
    for (const [key, d] of Object.entries(definitions)) {
      const environment = environmentValue(key, this.env);
      const localGoogle = this.localGoogleConfiguration();
      if (localGoogle && Object.hasOwn(localGoogle, key)) {
        values[key] = localGoogle[key];
        sources[key] = 'environment';
        continue;
      }
      if (key === 'database.provider' || key === 'portalDatabase.provider') {
        values[key] = d.default;
        sources[key] = 'default';
        continue;
      }
      // Development should follow the checked-out .env database so a stale
      // saved host cannot silently point the CMS at a different instance.
      // Persisted settings remain authoritative in production.
      const useDevelopmentDatabase = this.env.NODE_ENV !== 'production'
        && /^(database|portalDatabase)\./.test(key)
        && environment !== undefined;
      if (useDevelopmentDatabase || (key === 'storage.provider' && environment !== undefined)) {
        values[key] = environment;
        sources[key] = 'environment';
      } else if (d.secret && stored[key]?.secret_ref && environment !== undefined) {
        values[key] = environment;
        sources[key] = 'environment';
      } else if (stored[key] !== undefined && stored[key] !== null) {
        values[key] = d.secret ? await this.secrets.open(key, stored[key]) : stored[key];
        sources[key] = 'database';
      } else { values[key] = environment ?? d.default; sources[key] = environment !== undefined ? 'environment' : 'default'; }
    }
    if (stored['storage.configuredProvider'] == null || sources['storage.provider'] === 'environment') {
      values['storage.configuredProvider'] = values['storage.provider'];
      sources['storage.configuredProvider'] = sources['storage.provider'];
    }
    const idleMinutes = values['authentication.sessionIdleMinutes'];
    const warningKey = 'authentication.sessionWarningMinutes';
    if (Number.isFinite(idleMinutes) && values[warningKey] >= idleMinutes) {
      values[warningKey] = Math.max(1, Math.min(5, idleMinutes - 1));
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
        let stored, unavailable = false;
        try { stored = await this.provider.read(); }
        catch (error) {
          if (this.loadedAt || !isDependencyFailure(error)) throw error;
          stored = {}; unavailable = true;
          this.failureReason = dependencyReason(error);
          console.error(JSON.stringify({ event: 'settings_startup_degraded', reason: this.failureReason, required: true }));
        }
        const snapshot = await this.resolve(stored);
        const resources = await this.prepare(snapshot.values, this.values, { initializing: !this.loadedAt });
        await this.provider.activateConfigDatabase?.(snapshot.values);
        resources.activate();
        this.values = snapshot.values; this.sources = snapshot.sources; this.stored = stored; this.available = !unavailable; this.loadedAt = Date.now();
        if (!unavailable) this.failureReason = undefined;
      } catch (error) { this.available = false; this.failureReason = dependencyReason(error); error.subsystem ||= 'RUNTIME_CONFIG'; throw error; }
    });
  }
  snapshot() {
    const values = {}, metadata = {};
    for (const [key, d] of Object.entries(definitions)) {
      if (d.internal) continue;
      values[key] = d.secret ? null : this.values[key];
      const environmentNames = key === 'storage.configuredProvider' ? definitions['storage.provider'].env : d.env;
      const environmentVariable = environmentNames.find(name => this.env[name] !== undefined && this.env[name] !== '');
      const managedByEnvironment = this.managedByEnvironment(key);
      metadata[key] = {
        ...d, env: undefined, default: undefined, source: this.sources[key],
        environmentVariable: this.sources[key] === 'environment' ? environmentVariable : undefined,
        managedByEnvironment,
        configured: d.secret ? Boolean(this.values[key]) : undefined,
        overridden: Object.hasOwn(this.stored, key), requiresRestart: false,
        description: d.secret ? 'Leave blank to keep the current secret. Enter a new value to replace it.' : 'Saved settings override environment fallback values.',
      };
      if (key === 'authentication.sessionWarningMinutes') {
        metadata[key].max = Math.min(30, Math.max(1, this.values['authentication.sessionIdleMinutes'] - 1));
        metadata[key].default = Math.min(5, metadata[key].max);
      }
      if (!d.secret && (d.options || d.type === 'boolean')) metadata[key].resetValue = this.resetValue(key);
    }
    if (!Object.hasOwn(this.stored, 'storage.configuredProvider')) values['storage.configuredProvider'] = this.values['storage.provider'];
    return { values, metadata, available: this.available };
  }
  resetValue(key) {
    if (key === 'authentication.sessionWarningMinutes') return Math.min(5, Math.max(1, this.values['authentication.sessionIdleMinutes'] - 1));
    return key === 'storage.configuredProvider' ? this.values['storage.provider'] : environmentValue(key, this.env) ?? definitions[key].default;
  }
  visiblePatch(patch, baseline = this.values) {
    return omitInactiveSettings(patch, baseline, key => this.resetValue(key));
  }
  validateGoogleConfiguration(values) {
    const clientId = String(values['google.clientId'] || '').trim();
    const clientSecret = String(values['google.clientSecret'] || '').trim();
    const redirectUri = String(values['google.redirectUri'] || '').trim();
    if ((clientId || clientSecret) && (!clientId || !clientSecret)) {
      throw new Error('Google OAuth requires both a client ID and client secret.');
    }
    if (!redirectUri) return;
    let parsed;
    try { parsed = new URL(redirectUri); } catch { /* Report the expected backend callback below. */ }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
      || parsed.search || parsed.hash || parsed.pathname !== '/auth/callback'
      || (this.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
      || (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) {
      throw new Error('Google OAuth redirect URI must be the registered browser callback /auth/callback (HTTPS in production; localhost is allowed for development).');
    }
  }
  update(patch, actor) {
    return this.serial(() => this.provider.transaction(async stored => {
      const original = await this.resolve(stored);
      const activePatch = this.visiblePatch(patch, original.values);
      const managed = Object.keys(activePatch).find(key => this.managedByEnvironment(key));
      if (managed) {
        const environmentNames = managed === 'storage.configuredProvider' ? definitions['storage.provider'].env : definitions[managed].env;
        const variable = environmentNames.find(name => this.env[name] !== undefined && this.env[name] !== '');
        throw new Error(`${definitions[managed].label} is managed by environment${variable ? ` variable ${variable}` : ''}. Change it in the deployment environment and restart the backend.`);
      }
      validate(activePatch, { visiblePatch: true });
      const settings = { ...stored };
      const candidate = { ...original.values };
      const changes = [];
      for (const [key, value] of Object.entries(activePatch)) {
        const d = definitions[key];
        if (d.secret && value === '') continue;
        if (value === null) {
          const fallback = key === 'storage.configuredProvider' ? candidate['storage.provider'] : this.resetValue(key);
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
      if (Object.keys(activePatch).some(key => key.startsWith('google.'))) this.validateGoogleConfiguration(candidate);
      const resources = await this.prepare(candidate, this.values, { actor, changed: changes });
      try {
        for (const key of changes) if (definitions[key]?.secret && activePatch[key] !== null) settings[key] = await this.secrets.seal(key, activePatch[key]);
        const snapshot = await this.resolve(settings);
        const audit = changes.map(key => ({ id: crypto.randomUUID(), user_id: actor.id, action: 'settings.update', category: key.split('.')[0], setting_key: key, old_value: definitions[key].secret ? (original.values[key] ? '[SECRET CONFIGURED]' : null) : stored[key] ?? null, new_value: definitions[key].secret ? '[SECRET UPDATED]' : activePatch[key], ip_address: actor.ip || '', created_at: new Date().toISOString() }));
        return { settings, audit, discard: resources.discard, activate: async () => { await this.provider.activateConfigDatabase?.(snapshot.values); resources.activate(); this.values = snapshot.values; this.sources = snapshot.sources; this.stored = settings; this.loadedAt = Date.now(); this.available = true; } };
      } catch (error) { await resources.discard(); throw error; }
    }));
  }
  candidate(patch) {
    const activePatch = this.visiblePatch(patch);
    if (Object.keys(activePatch).length) validate(activePatch, { visiblePatch: true });
    const values = { ...this.values };
    for (const [key, value] of Object.entries(activePatch)) {
      if (definitions[key].secret && value === '') continue;
      values[key] = value ?? this.resetValue(key);
    }
    return values;
  }
}
