import crypto from 'node:crypto';
import { connector } from './registry.js';
import { HubError, hash, safeRequest } from './security.js';

export function pkce() { const verifier = crypto.randomBytes(32).toString('base64url'); return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') }; }
export function redirectUri(env = process.env) {
  const uri = env.INTEGRATION_GOOGLE_REDIRECT_URI;
  let url; try { url = new URL(uri); } catch { throw new HubError('oauth_redirect_not_configured', 503); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api/admin/integration-hub/oauth/callback') throw new HubError('invalid_oauth_redirect', 503);
  return url.href;
}
export async function tokenRequest(body, request = safeRequest) {
  const result = await request('https://oauth2.googleapis.com/token', { allowedHosts: ['oauth2.googleapis.com'], method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString(), maxBytes: 32768 });
  let token; try { token = JSON.parse(result.text); } catch { throw new HubError('invalid_oauth_response'); }
  if (token.token_type?.toLowerCase() !== 'bearer' || typeof token.access_token !== 'string' || !token.access_token || /[\r\n\0]/.test(token.access_token) || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw new HubError('invalid_oauth_response');
  const required = connector('google-calendar').scopes;
  if (typeof token.scope !== 'string' || required.some(scope => !token.scope.split(' ').includes(scope))) throw new HubError('insufficient_scopes');
  return { accessToken: token.access_token, ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}), expiresAt: Date.now() + token.expires_in * 1000, scopes: token.scope };
}
export class GoogleAuthorization {
  constructor(repository, vault, { env = process.env, request = safeRequest } = {}) { this.repo = repository; this.vault = vault; this.env = env; this.request = request; }
  async start(id, actor) {
    const redirect = redirectUri(this.env), state = crypto.randomBytes(32).toString('base64url'), proof = pkce();
    return this.repo.transaction(async db => {
      const installation = await db.prepare('SELECT * FROM integration_installations WHERE id=? FOR UPDATE').get(id);
      if (!installation || installation.connector_id !== 'google-calendar') throw new HubError('oauth_not_supported');
      if (!installation.credential) throw new HubError('credentials_required', 409);
      await db.prepare('DELETE FROM integration_oauth_states WHERE installation_id=? OR expires_at<now()').run(id);
      await db.prepare("INSERT INTO integration_oauth_states(state_hash,installation_id,actor_id,verifier,revision,expires_at) VALUES (?,?,?,?,?,now()+interval '10 minutes')").run(hash(state), id, actor, JSON.stringify(this.vault.seal(id, { verifier: proof.verifier, redirect })), installation.revision);
      await db.prepare("UPDATE integration_installations SET status='pending_authorization' WHERE id=?").run(id);
      await this.repo.audit(db, id, actor, 'oauth.start');
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: installation.configuration.clientId, redirect_uri: redirect, response_type: 'code', scope: connector('google-calendar').scopes.join(' '), state, code_challenge: proof.challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent' });
      return { authorizationUrl: url.href };
    });
  }
  async finish(state, code, actor) {
    if (!/^[\w-]{43}$/.test(state || '') || typeof code !== 'string' || !code || code.length > 2000) throw new HubError('invalid_oauth_state', 400);
    // Consume state before exchange; provider failure requires a fresh authorization.
    const saved = await this.repo.transaction(db => db.prepare('DELETE FROM integration_oauth_states WHERE state_hash=? AND actor_id=? AND expires_at>now() RETURNING *').get(hash(state), actor));
    if (!saved) throw new HubError('invalid_oauth_state', 400);
    return this.repo.transaction(async db => {
      const installation = await db.prepare('SELECT * FROM integration_installations WHERE id=? FOR UPDATE').get(saved.installation_id);
      if (installation.revision !== saved.revision || !installation.credential) throw new HubError('authorization_superseded', 409);
      const proof = this.vault.open(installation.id, saved.verifier), credentials = this.vault.open(installation.id, installation.credential);
      if (proof.redirect !== redirectUri(this.env)) throw new HubError('invalid_oauth_redirect');
      const token = await tokenRequest({ code, client_id: installation.configuration.clientId, client_secret: credentials.clientSecret, redirect_uri: proof.redirect, grant_type: 'authorization_code', code_verifier: proof.verifier }, this.request);
      const next = { ...credentials, ...token };
      if (!next.refreshToken) throw new HubError('offline_authorization_required');
      await db.prepare("UPDATE integration_installations SET credential=?,enabled=TRUE,status='configured',revision=revision+1,failures=0,circuit_until=NULL,updated_at=now() WHERE id=?").run(JSON.stringify(this.vault.seal(installation.id, next)), installation.id);
      await this.repo.audit(db, installation.id, actor, 'oauth.authorized');
    });
  }
  async refresh(installation, credentials) {
    if (credentials.expiresAt > Date.now() + 60000) return credentials;
    if (!credentials.refreshToken) throw new HubError('reauthorization_required', 409);
    const token = await tokenRequest({ client_id: installation.configuration.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken, grant_type: 'refresh_token' }, this.request);
    return { ...credentials, ...token };
  }
  async revoke(credentials) {
    const token = credentials.refreshToken || credentials.accessToken;
    if (token) {
      try { await this.request('https://oauth2.googleapis.com/revoke', { allowedHosts: ['oauth2.googleapis.com'], method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString(), maxBytes: 32768 }); }
      catch (error) { if (!(error instanceof HubError && error.providerStatus === 400)) throw error; }
    }
  }
}
