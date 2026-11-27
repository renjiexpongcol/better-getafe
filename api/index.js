import { deployment } from '../server/src/config/deployment.js';

let application;
let loading;
let retryAt = 0;

// Importing this entry point does not connect to services or start listeners.
// Failed configuration still permits a dependency-free liveness response.
export default async function handler(req, res) {
  const pathname = String(req.url || '/').split('?')[0];
  res.setHeader('Cache-Control', 'no-store');
  if (['/health', '/healthz', '/health/live', '/api/health/live'].includes(pathname)) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ status: 'ok', service: 'better-getafe' }));
  }
  try {
    if (deployment.errors.length) throw new Error('Deployment configuration is incomplete.');
    if (!application) {
      if (Date.now() < retryAt) throw new Error('Application initialization is cooling down.');
      loading ||= import('../server/index.js').then(module => { application = module; })
        .catch(error => { retryAt = Date.now() + 15000; throw error; })
        .finally(() => { loading = null; });
      await loading;
    }
    await application.ensureApplicationReady();
    return application.default(req, res);
  } catch {
    // Never serialize initialization exceptions: driver errors can contain secrets.
    res.statusCode = 503;
    res.setHeader('Retry-After', '15');
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ code: 'SERVICE_UNAVAILABLE', error: 'The service is temporarily unavailable.' }));
  }
}
