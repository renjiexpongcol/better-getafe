import crypto from 'node:crypto';
import { redisPrefix } from './redisClient.js';

const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const safePart = value => encodeURIComponent(String(value)).replace(/%/g, '_').slice(0, 180);
const prefix = `${redisPrefix}:`;

export const redisKeys = Object.freeze({
  authState: key => `${prefix}auth-state:${digest(key)}`,
  session: tokenSignature => `${prefix}session:${digest(tokenSignature)}`,
  userSessions: (kind, userId) => `${prefix}sessions:${safePart(kind)}:${digest(userId)}`,
  sessionRevoked: sessionId => `${prefix}session-revoked:${digest(sessionId)}`,
  rateLimit: (bucket, clientId) => `${prefix}ratelimit:${safePart(bucket)}:${safePart(clientId)}`,
  rateLimitWait: (policy, clientId) => `${prefix}local:wait:${safePart(policy)}:${safePart(clientId)}`,
  rateLimitActive: (policy, clientId) => `${prefix}local:active:${safePart(policy)}:${safePart(clientId)}`,
  block: (policy, clientId) => `${prefix}block:${safePart(policy)}:${safePart(clientId)}`,
  cache: (group, resource, version = '0') => `${prefix}cache:${safePart(group)}:v${safePart(version)}:${safePart(resource)}`,
  cacheVersion: group => `${prefix}cache-version:${safePart(group)}`,
  lock: resource => `${prefix}lock:${safePart(resource)}`,
  queue: name => `${prefix}queue:${safePart(name)}`,
  counter: (name, id) => `${prefix}counter:${safePart(name)}:${safePart(id)}`,
  idempotency: id => `${prefix}idempotency:${digest(id)}`,
});
