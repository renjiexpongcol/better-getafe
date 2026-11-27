// Bootstrap settings are resolved before any network clients are imported.
export function deploymentConfiguration(env = process.env) {
  const serverless = env.VERCEL === '1' || env.PORTAL_SERVERLESS === 'true';
  const stage = env.VERCEL_ENV || env.NODE_ENV || 'development';
  const origin = env.APP_URL || env.PUBLIC_SITE_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '');
  const errors = [];
  if (serverless) {
    try {
      const url = new URL(origin);
      if (url.protocol !== 'https:' || url.origin !== origin) throw new Error();
    } catch { errors.push('APP_URL must be an exact HTTPS origin.'); }
    if (stage === 'preview' && env.PREVIEW_DATA_ISOLATED !== 'true') {
      errors.push('Preview requires isolated database, Redis namespace, and media storage; set PREVIEW_DATA_ISOLATED=true only after verifying them.');
    }
    if (!env.SETTINGS_ENCRYPTION_KEY || Buffer.from(env.SETTINGS_ENCRYPTION_KEY, 'base64').length !== 32) {
      errors.push('SETTINGS_ENCRYPTION_KEY must contain the existing 32-byte base64 encryption key.');
    }
    if (env.CMS_MEDIA_PROVIDER === 'local' || env.STORAGE_PROVIDER === 'local') errors.push('Local persistent storage is unavailable in Vercel Functions.');
  }
  return Object.freeze({ serverless, stage, origin, errors });
}

export const deployment = deploymentConfiguration();
