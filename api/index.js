import { deployment } from '../server/src/config/deployment.js';
import { isPublicWeatherPath, publicWeatherHandler } from '../server/src/services/publicWeather.js';

// Imported project variables can contain a legacy development NODE_ENV. Vercel
// always needs production auth/cookie semantics before loading the application.
if(process.env.VERCEL==='1')process.env.NODE_ENV='production';

let application;
let loading;
let retryAt = 0;
let diagnosticAt=0;

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
  // Weather is a public data service. Dispatch it before loading route policy,
  // database inspection, Redis, configuration stores, or the CMS application.
  if (isPublicWeatherPath(pathname)) return publicWeatherHandler(req, res);
  try {
    const {resolveApiRoutePolicy}=await import('../server/src/services/apiRoutePolicy.js');
    const policy=resolveApiRoutePolicy(req.method,pathname);
    const publicRead=['GET','HEAD'].includes(req.method)&&policy?.access==='PUBLIC'&&policy.methodAllowed;
    const blockingErrors=publicRead?deployment.errors.filter(error=>error.includes('APP_URL')):deployment.errors;
    if (blockingErrors.length) throw new Error('Deployment configuration is incomplete.');
    if (!application) {
      if (Date.now() < retryAt) throw new Error('Application initialization is cooling down.');
      loading ||= import('../server/src/database/runtime.js').then(async({runtimeDatabaseInspection})=>{
        const inspection=await runtimeDatabaseInspection();
        if(['empty','partially_initialized','inconsistent_migrations'].includes(inspection.state))throw new Error('Run the authorized database initialization workflow.');
        return import('../server/index.js');
      }).then(module => { application = module; })
        .catch(error => { retryAt = Date.now() + 15000; throw error; })
        .finally(() => { loading = null; });
      await loading;
    }
    await application.ensureApplicationReady();
    return application.default(req, res);
  } catch(error) {
    if(Date.now()-diagnosticAt>15000){
      diagnosticAt=Date.now();
      const code=/^[A-Z0-9_]{2,48}$/.test(error?.code||'')?error.code:'APPLICATION_INITIALIZATION_UNAVAILABLE';
      console.warn(JSON.stringify({event:'application_bootstrap_unavailable',code,stage:application?'runtime':'import_or_database_inspection'}));
    }
    // Never serialize initialization exceptions: driver errors can contain secrets.
    res.statusCode = 503;
    res.setHeader('Retry-After', '15');
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ code: 'SERVICE_UNAVAILABLE', error: 'The service is temporarily unavailable.' }));
  }
}
