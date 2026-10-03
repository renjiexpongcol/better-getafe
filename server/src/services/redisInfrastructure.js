import crypto from 'node:crypto';
import redis, { isRedisReady } from '../infrastructure/redis/redisClient.js';
import { redisKeys } from '../infrastructure/redis/redisKeys.js';

export async function incrementCounter(name, id, ttlSeconds = 86400) {
  if (!isRedisReady()) return null;
  const key = redisKeys.counter(name, id);
  try {
    const value = await redis.incr(key);
    if (value === 1) await redis.expire(key, ttlSeconds);
    return value;
  } catch { return null; }
}

export async function withRedisLock(resource, ttlMs, work) {
  if (!isRedisReady()) throw Object.assign(new Error('Redis lock unavailable; operation was not started.'), { code: 'DEPENDENCY_UNAVAILABLE', status: 503 });
  const key = redisKeys.lock(resource);
  const token = crypto.randomUUID();
  if (await redis.set(key, token, { NX: true, PX: ttlMs }) !== 'OK') return { acquired: false };
  try { return { acquired: true, value: await work() }; }
  finally {
    await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", { keys: [key], arguments: [token] }).catch(() => {});
  }
}

export async function claimIdempotency(id, ttlSeconds = 86400) {
  if (!isRedisReady()) throw Object.assign(new Error('Redis idempotency store unavailable; operation was not started.'), { code: 'DEPENDENCY_UNAVAILABLE', status: 503 });
  return (await redis.set(redisKeys.idempotency(id), 'processing', { NX: true, EX: ttlSeconds })) === 'OK';
}

export async function enqueueEmail(message, { priority = message?.priority || 'normal' } = {}) {
  if (!isRedisReady()) throw Object.assign(new Error('Email queue unavailable.'), { code: 'DEPENDENCY_UNAVAILABLE', status: 503 });
  const queueName = priority === 'high' ? 'email:high' : priority === 'low' ? 'email:low' : 'email';
  const queueKey = redisKeys.queue(queueName);
  const job = { id: crypto.randomUUID(), attempts: 0, message };
  const accepted = await redis.eval("local length=redis.call('LLEN',KEYS[1]); if length>=tonumber(ARGV[1]) then return 0 end; return redis.call('RPUSH',KEYS[1],ARGV[2])", { keys: [queueKey], arguments: ['1000', JSON.stringify(job)] });
  if (Number(accepted) !== 1) throw new Error('Email queue is full.');
  globalThis.getafeMetrics ||= Object.create(null);
  globalThis.getafeMetrics.job_queued = (globalThis.getafeMetrics.job_queued || 0) + 1;
  globalThis.getafeMetrics.email_queued = (globalThis.getafeMetrics.email_queued || 0) + 1;
  return job.id;
}

let emailWorkerTimer;
let emailWorkerTask = null;
let emailWorkerStopping = false;
const processingKey = () => redisKeys.queue('email:processing');
const retryKey = () => redisKeys.queue('email:retry');
const queueKeysByPriority = () => [redisKeys.queue('email:high'), redisKeys.queue('email'), redisKeys.queue('email:low')];
export function startEmailWorker(send, onFailure = undefined) {
  if (emailWorkerTimer) return;
  globalThis.getafeMetrics ||= Object.create(null);
  emailWorkerStopping = false;
  emailWorkerTimer = setInterval(() => {
    if (emailWorkerTask || emailWorkerStopping) return;
    emailWorkerTask = (async () => {
    if (!isRedisReady()) return;
    let raw;
    try {
      const due = await redis.zRangeByScore(retryKey(), 0, Date.now(), { LIMIT: { offset: 0, count: 1 } });
      if (due.length) {
        const claimed = await redis.eval("if redis.call('ZREM',KEYS[1],ARGV[1])==1 then redis.call('LPUSH',KEYS[2],ARGV[1]); return 1 end; return 0", { keys: [retryKey(), processingKey()], arguments: [due[0]] });
        if (Number(claimed) === 1) raw = due[0];
      }
      if (!raw) {
        for (const queueKey of queueKeysByPriority()) {
          raw = await redis.brPopLPush(queueKey, processingKey(), 0.01);
          if (raw) break;
        }
      }
    } catch { return; }
    if (!raw) return;
    let job;
    try {
      job = JSON.parse(raw);
      await send(job.message, job);
      await redis.lRem(processingKey(), 1, raw);
      globalThis.getafeMetrics.job_completed = (globalThis.getafeMetrics.job_completed || 0) + 1;
    } catch (error) {
      if (!job) {
        await redis.lRem(processingKey(), 1, raw).catch(() => {});
        return;
      }
      job.attempts = (job.attempts || 0) + 1;
      globalThis.getafeMetrics.job_failed = (globalThis.getafeMetrics.job_failed || 0) + 1;
      await redis.lRem(processingKey(), 1, raw).catch(() => {});
      if (job.attempts < 5) await redis.zAdd(retryKey(), [{ score: Date.now() + Math.min(300_000, 1000 * 2 ** job.attempts + Math.floor(Math.random() * 500)), value: JSON.stringify(job) }]).catch(() => {});
      else {
        await onFailure?.(job.message, job, error);
        console.error(JSON.stringify({ event: 'email_job_dead_letter', job_id: job.id, attempts: job.attempts, error: error?.message || 'delivery failed' }));
      }
    }
    })().catch(error => {
      // Includes delivery callbacks and queue bookkeeping, not only SMTP.
      console.error(JSON.stringify({ event: 'email_worker_failed', code: error?.code || error?.name, message: error?.message }));
    }).finally(() => { emailWorkerTask = null; });
  }, 500);
  emailWorkerTimer.unref?.();
}
export async function recoverEmailJobs() {
  if (!isRedisReady()) return 0;
  const processing = processingKey();
  const length = await redis.lLen(processing);
  if (!length) return 0;
  const recovered = await redis.eval("local items=redis.call('LRANGE',KEYS[1],0,-1); for _,item in ipairs(items) do redis.call('LPUSH',KEYS[2],item) end; redis.call('DEL',KEYS[1]); return #items", { keys: [processing, redisKeys.queue('email')] });
  return Number(recovered);
}
export async function stopEmailWorker() {
  emailWorkerStopping = true;
  clearInterval(emailWorkerTimer);
  emailWorkerTimer = null;
  await emailWorkerTask;
}
