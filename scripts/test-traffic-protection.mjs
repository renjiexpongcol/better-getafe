import assert from 'node:assert/strict';
import { AdaptiveTrafficProtector, resolveClient } from '../src/services/trafficProtection.js';

function request(path = '/api/news', address = '198.51.100.20') { return { originalUrl: path, path, method: 'GET', socket: { remoteAddress: address }, get: () => undefined }; }
function response() { const events = new Map(); return { headers: new Map(), statusCode: 200, setHeader(k, v) { this.headers.set(k, v); }, status(v) { this.statusCode = v; return this; }, json(v) { this.body = v; return this; }, once(name, fn) { events.set(name, fn); }, finish() { events.get('finish')?.(); } }; }
let time = 1_000;
const protector = new AdaptiveTrafficProtector({ now: () => time });
const invoke = async req => { const res = response(); let passed = false; await protector.middleware()(req, res, () => { passed = true; res.finish(); }); return { res, passed }; };
// Redis fallback deliberately halves the normal burst capacity (30 -> 15).
for (let count = 0; count < 15; count++) assert.equal((await invoke(request())).passed, true, 'short normal burst passes');
const delayed = await invoke(request());
assert.equal(delayed.res.statusCode, 200, 'small excess is shaped, not immediately rejected');
await new Promise(resolve => setTimeout(resolve, 550));
for (let count = 0; count < 4; count++) await invoke(request());
assert.equal((await invoke(request())).res.statusCode, 429, 'sustained excess is rejected');
const spoofed = resolveClient({ socket: { remoteAddress: '198.51.100.30' }, get: name => name === 'X-Forwarded-For' ? '203.0.113.99' : undefined });
const direct = resolveClient({ socket: { remoteAddress: '198.51.100.30' }, get: () => undefined });
assert.equal(spoofed.value, direct.value, 'untrusted forwarding headers are ignored');
console.log('Adaptive traffic protection checks passed.');
