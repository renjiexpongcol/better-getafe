import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config/index.js';

const execFileAsync = promisify(execFile);
let cachedAccessToken = '';
let accessTokenExpiresAt = 0;

async function applicationAccessToken() {
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt - 60000) return cachedAccessToken;

  try {
    const response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(1500),
    });
    if (response.ok) {
      const body = await response.json();
      if (typeof body.access_token === 'string' && body.access_token) {
        cachedAccessToken = body.access_token;
        accessTokenExpiresAt = Date.now() + Math.max(60, Number(body.expires_in) || 3600) * 1000;
        return cachedAccessToken;
      }
    }
  } catch { /* Local development can use gcloud Application Default Credentials. */ }

  if (process.env.NODE_ENV === 'production') throw new Error('Google Cloud application credentials are unavailable.');
  const { stdout } = await execFileAsync('gcloud', ['auth', 'application-default', 'print-access-token'], { timeout: 5000, windowsHide: true, maxBuffer: 8192 });
  const token = stdout.trim();
  if (!token) throw new Error('Google Application Default Credentials returned no access token.');
  cachedAccessToken = token;
  accessTokenExpiresAt = Date.now() + 300000;
  return token;
}

async function assessEnterpriseToken(token, action) {
  const projectId = String(config.get('security.recaptchaProjectId') || '').trim();
  const siteKey = String(config.get('security.recaptchaSiteKey') || '').trim();
  if (!projectId || !siteKey || !token) return false;
  const accessToken = await applicationAccessToken();
  const response = await fetch(`https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/assessments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assessment: { event: { token, siteKey, expectedAction: action } } }),
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return false;
  const assessment = await response.json();
  const properties = assessment.tokenProperties;
  return properties?.valid === true && properties.action === action && Number(assessment.riskAnalysis?.score) >= 0.5;
}

export async function verifyRecaptchaToken(token, action) {
  if (config.get('security.recaptchaProvider') === 'google-enterprise') {
    try { return await assessEnterpriseToken(token, action); } catch { return false; }
  }
  const secret = config.get('security.recaptchaSecretKey');
  if (!secret || !token) return false;
  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }), signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    const version = config.get('security.recaptchaVersion') || 'v2';
    return response.ok && result.success === true && (version !== 'v3' || (result.action === action && Number(result.score) >= 0.5));
  } catch { return false; }
}
