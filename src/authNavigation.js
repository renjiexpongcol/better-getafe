import {ROUTES, APP_MODULE_PATHS, ADMIN_MODULE_PATHS, STAFF_MODULE_PATHS, adminLocation, staffLocation, canonicalSettingsTarget} from './routeRegistry.js';
import {getProtectedRouteState, routeOverrides} from './routeConfig.js';
import {resolveModuleAccess} from './applicationModuleRegistry.js';
export const pendingReturnUrlKey='getafe:auth:intended-destination:v1';
const pendingKey=pendingReturnUrlKey;
// The SPA supplies its auto-discovered manifest so removed or newly added
// pages follow the same route source as the router, including public pages.
let destinationPatterns = [...Object.values(ROUTES.public), ...Object.values(routeOverrides), ...Object.values(APP_MODULE_PATHS), '/info/history', '/info/sitemap', '/services/directory'];
export function registerAuthDestinationRoutes(manifest) {
  destinationPatterns = manifest.map(route => route.path);
}
function registeredDestination(pathname) {
  return destinationPatterns.some(pattern => new RegExp('^' + pattern.split('/').map(part => part.startsWith(':') ? '[^/]+' : part).join('/') + '$').test(pathname));
}
export function safeReturnPath(value, origin = typeof window === 'undefined' ? 'https://getafe.invalid' : window.location.origin) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || decoded.includes('\\') || /[\u0000-\u001f\u007f]/.test(decoded)) return null;
    const target = new URL(value, origin);
    if (target.origin !== origin || /^\/(?:auth|api|errors|login|signin|create-account|logout)(?:\/|$)/i.test(decodeURIComponent(target.pathname))) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export function loginDestination(value, parameters = {}) {
  const query = new URLSearchParams(parameters);
  const safe = safeReturnPath(value);
  if (safe) query.set('returnUrl', safe);
  return ROUTES.auth.login + (query.size ? '?' + query.toString() : '');
}
export function authorizedReturnPath(value, user) {
  const safe = safeReturnPath(value);
  if (!safe) return null;
  const target = new URL(safe, 'https://getafe.invalid');
  const pathname = target.pathname;
  if (pathname === ROUTES.admin.settings) {
    const canonical = canonicalSettingsTarget(target.search, target.hash);
    return canonical ? authorizedReturnPath(canonical, user) : null;
  }
  // Legacy root selectors redirect to another module. Only canonical module
  // paths can serve as intended destinations and be authorized here.
  if (['/app', '/app/staff', '/admin'].includes(pathname) && ['sysparm_object_id', 'tab'].some(key => target.searchParams.has(key))) return null;
  const shell = /^\/admin(?:\/|$)/.test(pathname) ? 'admin'
    : /^\/app\/staff(?:\/|$)/.test(pathname) ? 'staff'
      : /^\/app(?:\/|$)/.test(pathname) ? 'app' : null;
  if (!shell) return registeredDestination(pathname) ? safe : null;
  if (getProtectedRouteState({ user, requiredRole: shell === 'app' ? 'citizen' : shell }) !== 'allowed') return null;
  if (shell === 'admin' || shell === 'staff') {
    const route = shell === 'admin' ? adminLocation(pathname) : staffLocation(pathname);
    if (shell === 'staff' && pathname.split('/').length > 5) return null;
    return route && resolveModuleAccess(shell, route.module, user).state === 'allowed' ? safe : null;
  }
  // Setup is an intermediate step, never a final destination after completion.
  return pathname !== '/app/setup' && registeredDestination(pathname) ? safe : null;
}
export function defaultAuthDestination(user) {
  if (user?.role === 'resident') return user.setupRequired ? '/app/setup' : ROUTES.app.root;
  const shell = ['admin', 'super_admin'].includes(user?.role) ? 'admin' : 'staff';
  const root = shell === 'admin' ? ROUTES.admin.root : ROUTES.staff.root;
  if (authorizedReturnPath(root, user)) return root;
  for (const path of Object.values(shell === 'admin' ? ADMIN_MODULE_PATHS : STAFF_MODULE_PATHS)) {
    if (authorizedReturnPath(path, user)) return path;
  }
  return '/';
}
export function resolvePostAuthDestination(user, intended) {
  if (user?.role === 'resident' && user.setupRequired) return '/app/setup';
  return authorizedReturnPath(intended, user) || defaultAuthDestination(user);
}
function tabStorage() {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; }
  catch { return null; }
}
export function clearPendingReturnUrl(storage = tabStorage()) {
  try { storage?.removeItem(pendingKey); } catch { /* Storage is optional. */ }
}
export function setPendingReturnUrl(value, storage = tabStorage()) {
  const safe = safeReturnPath(value);
  if (!safe) { clearPendingReturnUrl(storage); return null; }
  try { storage?.setItem(pendingKey, JSON.stringify({ value: safe, expires: Date.now() + 10 * 60 * 1000 })); }
  catch { /* Query parameters still carry the active flow. */ }
  return safe;
}
export function getPendingReturnUrl(storage = tabStorage()) {
  try {
    const item = JSON.parse(storage?.getItem(pendingKey) || 'null');
    if (item?.expires > Date.now()) return safeReturnPath(item.value);
    clearPendingReturnUrl(storage);
  } catch { /* Malformed or unavailable storage cannot redirect. */ }
  return null;
}
export function consumePostAuthDestination(user, explicit) {
  const intended = explicit === undefined ? getPendingReturnUrl() : safeReturnPath(explicit);
  if (user?.role === 'resident' && user.setupRequired) {
    if (intended) setPendingReturnUrl(intended);
    return '/app/setup';
  }
  const target = resolvePostAuthDestination(user, intended);
  clearPendingReturnUrl();
  return target;
}
