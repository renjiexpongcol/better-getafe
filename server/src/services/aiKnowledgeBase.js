import crypto from 'node:crypto';
import OpenAI from 'openai';
import { getCmsPool } from './database.js';
import { openAiApiKey, isAiOperationEnabled } from './aiManagement.js';
import { getNewsArticles } from '../repositories/newsRepository.js';
import { findDepartment, listDepartments } from '../repositories/departmentsRepository.js';
import { getBarangays } from '../repositories/barangaysRepository.js';
import { managedContentRepository } from '../repositories/managedContentRepository.js';
import { EserviceEngine } from './eserviceEngine.js';
import { publicService } from './eservicePresentation.js';
import { statisticsService } from './statisticsService.js';
import { toPublicBarangays } from './publicApiDtos.js';
import { dependencyReason } from './startupDiagnostics.js';
import {recoveryJobsAllowed} from '../database/workerRecovery.js';

const serviceEngine = new EserviceEngine();
const contentRepository = managedContentRepository();
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE = 2400;
const MAX_CHUNKS = 12;
const SOURCE_LABELS = Object.freeze({
  published_news_updates: 'Published News & Updates',
  published_events_meetings: 'Published Events & Meetings',
  municipal_services: 'Municipal Services',
  municipal_departments: 'Municipal Offices',
  barangay_profiles: 'Barangay Profiles',
  public_open_data: 'Public Open Data',
  official_faqs: 'Official FAQs',
  ordinances_resolutions: 'Ordinances & Resolutions',
  approved_municipal_documents: 'Approved Municipal Documents',
  official_forms: 'Official Downloadable Forms',
  approved_website_pages: 'Approved Website Pages',
});

const strip = value => String(value ?? '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
function flatten(value, depth = 0) {
  if (depth > 6 || value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return strip(value);
  if (Array.isArray(value)) return value.map(item => flatten(item, depth + 1)).filter(Boolean).join(' ');
  if (typeof value === 'object') return Object.entries(value).filter(([key]) => !/password|secret|token|private|internal|personal|resident|employee|auth/i.test(key)).map(([, item]) => flatten(item, depth + 1)).filter(Boolean).join(' ');
  return '';
}

function publicRecord(sourceKey, sourceRecordId, title, content, sourceUrl, sourceModule) {
  const safeTitle = strip(title).slice(0, 500);
  const safeContent = strip(content).slice(0, 24000);
  const safeUrl = String(sourceUrl || '/').startsWith('/') && !String(sourceUrl).startsWith('//') ? String(sourceUrl).slice(0, 1000) : '/';
  if (!safeTitle || !safeContent) return null;
  return { sourceKey, sourceRecordId: String(sourceRecordId), title: safeTitle, content: safeContent, sourceUrl: safeUrl, sourceModule, visibility: 'public', publicationStatus: 'published', approved: true };
}

function listFrom(value, keys = ['items', 'datasets', 'topics', 'results']) {
  const data = value?.data ?? value ?? {};
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data[key])) return data[key];
  return [];
}

async function sourceRecords(sourceKey, recordId = null) {
  const records = [];
  if (['published_news_updates', 'published_events_meetings'].includes(sourceKey)) {
    let articles;
    if (recordId && recordId !== '*') {
      const pool = await getCmsPool();
      const [rows] = await pool.execute('SELECT id,title,slug,excerpt,content,content_type,status,published_at FROM news WHERE id=?', [recordId]);
      articles = rows;
    } else articles = await getNewsArticles();
    for (const item of articles) {
      const isEvent = ['event', 'meeting'].includes(item.content_type);
      if ((sourceKey === 'published_events_meetings') !== isEvent || item.status !== 'published' || (item.published_at && new Date(item.published_at) > new Date())) continue;
      records.push(publicRecord(sourceKey, item.id, item.title, [item.excerpt, item.content].join('\n'), isEvent ? '/events' : `/news/${encodeURIComponent(item.slug)}`, 'news'));
    }
  } else if (sourceKey === 'municipal_services') {
    const services = recordId && recordId !== '*' ? [await serviceEngine.configuration(recordId).catch(() => null)].filter(Boolean) : await serviceEngine.catalog();
    for (const item of services) {
      const safeItem = publicService(item);
      records.push(publicRecord(sourceKey, safeItem.id, safeItem.name, flatten(safeItem), `/services/e-services/${encodeURIComponent(safeItem.slug)}`, 'services'));
    }
  } else if (sourceKey === 'municipal_departments') {
    const departments = recordId && recordId !== '*' ? [await findDepartment(recordId).catch(() => null)].filter(Boolean) : await listDepartments();
    for (const item of departments) {
      const safeItem = { name:item.name, shortDescription:item.shortDescription, description:item.description, responsibilities:item.responsibilities, programs:item.programs, phone:item.phone, email:item.email, location:item.location, hours:item.hours };
      records.push(publicRecord(sourceKey, item.id, item.name, flatten(safeItem), `/departments/${encodeURIComponent(item.slug)}`, 'departments'));
    }
  } else if (sourceKey === 'barangay_profiles') {
    const barangays = toPublicBarangays(await getBarangays());
    records.push(publicRecord(sourceKey, 'barangays', 'Barangay Profiles of Getafe', flatten(barangays), '/barangays', 'barangays'));
  } else if (sourceKey === 'public_open_data') {
    const datasetResult = recordId && recordId !== '*' && !recordId.startsWith('topic:') ? await statisticsService.dataset(recordId).catch(() => null) : recordId && recordId.startsWith('topic:') ? null : await statisticsService.datasets({ limit: 200, offset: 0 });
    const topicResult = !recordId || recordId === '*' || recordId.startsWith('topic:') ? await statisticsService.topics() : null;
    const datasets = datasetResult ? listFrom(datasetResult, ['items','datasets','results']).concat(Array.isArray(datasetResult.data) ? datasetResult.data : !Array.isArray(datasetResult.data) ? [datasetResult.data] : []) : [];
    for (const item of datasets) {
      const id = item.id || item.dataset_id || item.code;
      if (id) records.push(publicRecord(sourceKey, id, item.title || item.name || item.label || id, flatten(item), `/data/datasets/${encodeURIComponent(id)}`, 'open_data'));
    }
    for (const item of listFrom(topicResult)) {
      const topicId = `topic:${item.id || item.code || item.label || item.name}`;
      if (!recordId || recordId === '*' || recordId === topicId) records.push(publicRecord(sourceKey, topicId, item.label || item.name || item.title || 'Public data topic', flatten(item), '/data/datasets', 'open_data'));
    }
  } else if (sourceKey === 'official_faqs' || sourceKey === 'approved_website_pages') {
    const expectedKind = sourceKey === 'official_faqs' ? 'help' : 'page';
    const rows = recordId && recordId !== '*' ? [await contentRepository.find(recordId).catch(() => null)].filter(Boolean) : await contentRepository.list();
    for (const row of rows) {
      if (row.kind !== expectedKind || !row.published) continue;
      const item = await contentRepository.find(row.key);
      if (!item?.published) continue;
      const slug = row.key.startsWith('page-') ? row.key.slice(5) : row.key;
      records.push(publicRecord(sourceKey, row.key, row.title, flatten(item.content), expectedKind === 'help' ? '/help' : `/${encodeURIComponent(slug)}`, 'managed_content'));
    }
  } else if (['ordinances_resolutions', 'approved_municipal_documents', 'official_forms'].includes(sourceKey)) {
    const pool = await getCmsPool();
    const [rows] = recordId && recordId !== '*'
      ? await pool.execute(`SELECT id, title, content, source_url, visibility, publication_status, approved FROM ai_knowledge_manual_documents WHERE source_key=? AND id=?`, [sourceKey, recordId])
      : await pool.execute(`SELECT id, title, content, source_url, visibility, publication_status, approved FROM ai_knowledge_manual_documents WHERE source_key=?`, [sourceKey]);
    for (const item of rows) {
      if (!item.approved || item.visibility !== 'public' || item.publication_status !== 'published') continue;
      records.push(publicRecord(sourceKey, item.id, item.title, item.content, item.source_url, 'manual_documents'));
    }
  }
  return records.filter(Boolean);
}

function chunkText(text) {
  const source = String(text || '').trim();
  if (!source) return [];
  const chunks = [];
  for (let start = 0; start < source.length && chunks.length < MAX_CHUNKS; start += CHUNK_SIZE) chunks.push(source.slice(start, start + CHUNK_SIZE));
  return chunks;
}

async function vectorAvailable() {
  const pool = await getCmsPool();
  const [rows] = await pool.execute(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ai_knowledge_documents' AND column_name='embedding') AS available`);
  return Boolean(rows[0]?.available);
}

async function makeEmbeddings(texts) {
  if (!texts.length || !openAiApiKey() || !(await isAiOperationEnabled()) || !(await isAiOperationEnabled('knowledge_base'))) return null;
  try {
    const client = new OpenAI({ apiKey: openAiApiKey(), timeout: 20000, maxRetries: 1 });
    const response = await client.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
    return response.data.sort((a, b) => a.index - b.index).map(item => item.embedding);
  } catch (error) {
    console.warn(JSON.stringify({ event: 'ai_knowledge_embedding_failed', code: error?.code || 'embedding_unavailable' }));
    return null;
  }
}

async function indexRecords(sourceKey, records, { rebuild = false, syncRunId = crypto.randomUUID() } = {}) {
  const pool = await getCmsPool();
  const [policyRows] = await pool.execute('SELECT enabled, approved, visibility FROM ai_knowledge_sources WHERE source_key=?', [sourceKey]);
  const policy = policyRows[0];
  if (!policy?.enabled || !policy.approved || policy.visibility !== 'public') {
    await pool.execute('DELETE FROM ai_knowledge_documents WHERE source_key=?', [sourceKey]);
    return { indexed: 0, removed: true };
  }
  const pieces = records.flatMap(record => chunkText(record.content).map((content, chunkIndex) => ({ ...record, content, chunkIndex, contentHash: crypto.createHash('sha256').update(record.content).digest('hex') })));
  let embeddings = null;
  let useVector = false;
  try { useVector = await vectorAvailable(); } catch { useVector = false; }
  if (useVector && pieces.length) embeddings = await makeEmbeddings(pieces.map(piece => `${piece.title}\n${piece.content}`));
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (rebuild) await connection.execute('DELETE FROM ai_knowledge_documents WHERE source_key=?', [sourceKey]);
    for (const record of records) {
      const [priorChunks] = await connection.execute('SELECT id, chunk_index FROM ai_knowledge_documents WHERE source_key=? AND source_record_id=?', [sourceKey, record.sourceRecordId]);
      const nextChunks = new Set(chunkText(record.content).map((_, index) => index));
      for (const old of priorChunks) if (!nextChunks.has(Number(old.chunk_index))) await connection.execute('DELETE FROM ai_knowledge_documents WHERE id=?', [old.id]);
    }
    for (let index = 0; index < pieces.length; index++) {
      const piece = pieces[index];
      const values = [sourceKey, piece.sourceModule, piece.sourceRecordId, piece.chunkIndex, piece.title, piece.sourceUrl, piece.content, piece.visibility, piece.publicationStatus, piece.approved, piece.contentHash, embeddings ? `${EMBEDDING_MODEL}:1536` : null, syncRunId];
      if (embeddings) {
        await connection.execute(`INSERT INTO ai_knowledge_documents (source_key,source_module,source_record_id,chunk_index,title,source_url,content,visibility,publication_status,approved,content_hash,embedding_model_version,sync_run_id,indexing_status,indexed_at,embedding) VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?,'indexed',CURRENT_TIMESTAMP,?::vector) ON CONFLICT(source_key,source_record_id,chunk_index) DO UPDATE SET source_module=EXCLUDED.source_module,title=EXCLUDED.title,source_url=EXCLUDED.source_url,content=EXCLUDED.content,visibility=EXCLUDED.visibility,publication_status=EXCLUDED.publication_status,approved=EXCLUDED.approved,content_hash=EXCLUDED.content_hash,embedding_model_version=EXCLUDED.embedding_model_version,sync_run_id=EXCLUDED.sync_run_id,indexing_status='indexed',indexed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,embedding=EXCLUDED.embedding`, [...values, `[${embeddings[index].join(',')}]`]);
      } else {
        await connection.execute(`INSERT INTO ai_knowledge_documents (source_key,source_module,source_record_id,chunk_index,title,source_url,content,visibility,publication_status,approved,content_hash,embedding_model_version,sync_run_id,indexing_status,indexed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?,'indexed',CURRENT_TIMESTAMP) ON CONFLICT(source_key,source_record_id,chunk_index) DO UPDATE SET source_module=EXCLUDED.source_module,title=EXCLUDED.title,source_url=EXCLUDED.source_url,content=EXCLUDED.content,visibility=EXCLUDED.visibility,publication_status=EXCLUDED.publication_status,approved=EXCLUDED.approved,content_hash=EXCLUDED.content_hash,embedding_model_version=NULL,sync_run_id=EXCLUDED.sync_run_id,indexing_status='indexed',indexed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`, values);
      }
    }
    await connection.commit();
    return { indexed: pieces.length, removed: false };
  } catch (error) { await connection.rollback().catch(() => {}); throw error; }
  finally { connection.release(); }
}

async function processJob(job) {
  if (job.source_record_id === '*') {
    const records = await sourceRecords(job.source_key);
    return indexRecords(job.source_key, records, { rebuild: true });
  }
  const current = await sourceRecords(job.source_key, job.source_record_id);
  return indexRecords(job.source_key, current);
}

export async function processAiKnowledgeJobs(limit = 3) {
  if(!await recoveryJobsAllowed())return 0;
  const pool = await getCmsPool();
  await pool.execute(`UPDATE ai_knowledge_jobs SET status='pending',last_error='Recovered an interrupted indexing job.',started_at=NULL WHERE status='processing' AND started_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes'`);
  const connection = await pool.getConnection();
  let jobs = [];
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(`SELECT id,source_key,source_record_id,operation,attempts FROM ai_knowledge_jobs WHERE status='pending' ORDER BY requested_at,id LIMIT ? FOR UPDATE SKIP LOCKED`, [Math.max(1, Math.min(10, Number(limit) || 3))]);
    jobs = rows;
    for (const job of jobs) await connection.execute(`UPDATE ai_knowledge_jobs SET status='processing',attempts=attempts+1,started_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=?`, [job.id]);
    await connection.commit();
  } catch (error) { await connection.rollback().catch(() => {}); throw error; }
  finally { connection.release(); }
  for (const job of jobs) {
    try {
      await processJob(job);
      await pool.execute(`UPDATE ai_knowledge_jobs SET status='completed',completed_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=?`, [job.id]);
    } catch (error) {
      const attempts = Number(job.attempts || 0) + 1;
      const reason = dependencyReason(error);
      await pool.execute(`UPDATE ai_knowledge_jobs SET status=?,last_error=?,completed_at=CASE WHEN ? >= 3 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?`, [attempts >= 3 ? 'failed' : 'pending', reason.slice(0, 240), attempts, job.id]);
      console.error(JSON.stringify({ event: 'ai_knowledge_job_failed', pid: process.pid, job_id: job.id, source_key: job.source_key, attempts, code: workerFailureCode(error), reason }));
    }
  }
  return jobs.length;
}

let workerTimer;
let workerRun;
let workerReady = () => true;
let lastWorkerFailureLog = { fingerprint: '', at: 0 };
let workerStatus = { state: 'stopped', reason: null, updatedAt: new Date().toISOString(), lastRunAt: null };
function setWorkerStatus(patch) {
  const next = { ...workerStatus, ...patch, updatedAt: new Date().toISOString() };
  if (next.state !== workerStatus.state || next.reason !== workerStatus.reason) {
    console.info(JSON.stringify({ event: 'ai_knowledge_worker_status', pid: process.pid, state: next.state, reason: next.reason || null }));
  }
  workerStatus = next;
}
export function aiKnowledgeWorkerStatus() { return { ...workerStatus }; }
function logWorkerUnavailable(error, code) {
  const reason = dependencyReason(error);
  const fingerprint = `${code}:${reason}`;
  const now = Date.now();
  if (fingerprint !== lastWorkerFailureLog.fingerprint || now - lastWorkerFailureLog.at >= 60_000) {
    console.warn(JSON.stringify({ event: 'ai_knowledge_worker_unavailable', pid: process.pid, code, reason }));
    lastWorkerFailureLog = { fingerprint, at: now };
  }
}
function workerFailureCode(error) {
  const code = String(error?.code || '').toLowerCase();
  if (/^[a-z0-9_-]{1,48}$/.test(code)) return code;
  if (error?.cause?.code && /^[a-z0-9_-]{1,48}$/i.test(error.cause.code)) return String(error.cause.code).toLowerCase();
  if (/postgresql is not connected|database (?:is )?unavailable|connection timed out/i.test(String(error?.message || ''))) return 'database_unavailable';
  return 'unexpected_worker_failure';
}
async function runKnowledgeWorker() {
  if (workerRun) return workerRun;
  let readiness;
  try { readiness = await workerReady(); }
  catch (error) {
    const code = workerFailureCode(error);
    setWorkerStatus({ state: 'degraded', reason: code });
    logWorkerUnavailable(error, code);
    return;
  }
  if (readiness === false || readiness?.ready === false) {
    setWorkerStatus({ state: readiness?.state || 'waiting', reason: readiness?.reason || null });
    return;
  }
  let enabled;
  try { enabled = await isAiOperationEnabled('knowledge_base'); }
  catch (error) {
    const code = workerFailureCode(error);
    setWorkerStatus({ state: 'degraded', reason: code });
    logWorkerUnavailable(error, code);
    return;
  }
  if (!enabled) {
    setWorkerStatus({ state: 'disabled', reason: 'feature_disabled' });
    return;
  }
  setWorkerStatus({ state: 'running', reason: null });
  workerRun = processAiKnowledgeJobs().then(processed => {
    setWorkerStatus({ state: 'ready', reason: null, lastRunAt: new Date().toISOString(), lastProcessedJobs: processed });
  }).catch(error => {
    const code = workerFailureCode(error);
    setWorkerStatus({ state: 'degraded', reason: code, lastRunAt: new Date().toISOString() });
    logWorkerUnavailable(error, code);
  }).finally(() => { workerRun = null; });
  return workerRun;
}
export function startAiKnowledgeWorker({ isReady = () => true } = {}) {
  if (workerTimer) return;
  workerReady = isReady;
  setWorkerStatus({ state: 'starting', reason: null });
  workerTimer = setInterval(() => { void runKnowledgeWorker(); }, 5000);
  workerTimer.unref?.();
  void runKnowledgeWorker();
}
export async function stopAiKnowledgeWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = undefined;
  await workerRun;
  setWorkerStatus({ state: 'stopped', reason: null });
}

export async function queueKnowledgeSourceRebuild(sourceKeys, requestedBy = null) {
  const pool = await getCmsPool();
  const keys = [...new Set(sourceKeys)].filter(key => Object.hasOwn(SOURCE_LABELS, key));
  for (const sourceKey of keys) await pool.execute(`INSERT INTO ai_knowledge_jobs (source_key,source_record_id,operation,status,requested_by) VALUES (?, '*','rebuild','pending',?) ON CONFLICT (source_key,source_record_id) WHERE status IN ('pending','processing') DO NOTHING`, [sourceKey, requestedBy]);
  return keys.length;
}

export async function queueKnowledgeDocuments(documentIds, requestedBy = null) {
  const pool = await getCmsPool();
  const ids = [...new Set(documentIds)].slice(0, 100);
  let queued = 0;
  for (const id of ids) {
    const [rows] = await pool.execute('SELECT source_key,source_record_id FROM ai_knowledge_documents WHERE id=?', [id]);
    if (!rows[0]) continue;
    const [inserted] = await pool.execute(`INSERT INTO ai_knowledge_jobs (source_key,source_record_id,operation,status,requested_by) VALUES (?,?,'sync','pending',?) ON CONFLICT (source_key,source_record_id) WHERE status IN ('pending','processing') DO NOTHING RETURNING id`, [rows[0].source_key, rows[0].source_record_id, requestedBy]);
    if (inserted.length) queued++;
  }
  return queued;
}

export async function knowledgeDashboard() {
  const pool = await getCmsPool();
  const [sources] = await pool.execute(`SELECT s.source_key AS "sourceKey",s.label,s.description,s.source_module AS "sourceModule",s.enabled,s.approved,s.visibility,s.approved_by AS "approvedBy",s.approved_at AS "approvedAt",s.updated_at AS "updatedAt",COUNT(DISTINCT d.source_record_id)::int AS "documentCount" FROM ai_knowledge_sources s LEFT JOIN ai_knowledge_documents d ON d.source_key=s.source_key AND d.indexing_status='indexed' GROUP BY s.source_key ORDER BY s.label`);
  const [counts] = await pool.execute(`SELECT COUNT(DISTINCT (source_key,source_record_id)) FILTER (WHERE indexing_status='indexed' AND approved AND visibility='public' AND publication_status='published')::int AS "indexedDocuments",COUNT(*) FILTER (WHERE indexing_status='pending')::int AS "pendingDocuments",COUNT(*) FILTER (WHERE indexing_status='failed')::int AS "failedDocuments" FROM ai_knowledge_documents`);
  const [jobCounts] = await pool.execute(`SELECT COUNT(*) FILTER (WHERE status='pending')::int AS "pendingJobs",COUNT(*) FILTER (WHERE status='processing')::int AS "processingJobs",COUNT(*) FILTER (WHERE status='failed')::int AS "failedJobs",MAX(completed_at) FILTER (WHERE status='completed') AS "lastSuccessfulSync" FROM ai_knowledge_jobs`);
  const [failures] = await pool.execute(`SELECT id,source_key AS "sourceKey",source_record_id AS "sourceRecordId",attempts,last_error AS "lastError",requested_at AS "requestedAt" FROM ai_knowledge_jobs WHERE status='failed' ORDER BY completed_at DESC NULLS LAST LIMIT 20`);
  const [documents] = await pool.execute(`SELECT d.id,d.source_key AS "sourceKey",s.label AS "sourceLabel",d.source_record_id AS "sourceRecordId",d.title,d.source_url AS "sourceUrl",d.visibility,d.publication_status AS "publicationStatus",d.approved,d.indexing_status AS "indexingStatus",d.updated_at AS "updatedAt" FROM ai_knowledge_documents d JOIN ai_knowledge_sources s USING(source_key) ORDER BY d.updated_at DESC LIMIT 100`);
  const [manualDocuments] = await pool.execute(`SELECT id,source_key AS "sourceKey",title,source_url AS "sourceUrl",visibility,publication_status AS "publicationStatus",approved,updated_at AS "updatedAt" FROM ai_knowledge_manual_documents ORDER BY updated_at DESC LIMIT 100`);
  const [vectorRows] = await pool.execute(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ai_knowledge_documents' AND column_name='embedding') AS available`);
  return { worker: aiKnowledgeWorkerStatus(), sources, metrics: { ...(counts[0] || {}), ...(jobCounts[0] || {}), vectorAvailable: Boolean(vectorRows[0]?.available) }, failures, documents, manualDocuments };
}

export async function updateKnowledgeSourcePolicy(sourceKey, body, actor) {
  if (!Object.hasOwn(SOURCE_LABELS, sourceKey)) throw Object.assign(new Error('Unknown knowledge source.'), { status: 404 });
  if (typeof body?.enabled !== 'boolean' || typeof body?.approved !== 'boolean' || !['public','internal','private'].includes(body?.visibility)) throw Object.assign(new Error('Choose an approval state, enabled state, and visibility.'), { status: 422 });
  const enabled = body.enabled && body.approved && body.visibility === 'public';
  const pool = await getCmsPool();
  const [rows] = await pool.execute(`UPDATE ai_knowledge_sources SET enabled=?,approved=?,visibility=?,approved_by=CASE WHEN ? THEN ? ELSE approved_by END,approved_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE approved_at END,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE source_key=? RETURNING source_key`, [enabled, body.approved, body.visibility, body.approved, actor.id, body.approved, actor.id, sourceKey]);
  if (!rows.length) throw Object.assign(new Error('Knowledge source was not found.'), { status: 404 });
  await pool.execute(`INSERT INTO ai_audit_logs (id,user_id,action,module_key,details,ip_address) VALUES (?,?,'ai.knowledge.source.update','knowledge_base',?::jsonb,?)`, [crypto.randomUUID(), actor.id, JSON.stringify({ sourceKey, enabled, approved: body.approved, visibility: body.visibility }), actor.ip || '']);
  await queueKnowledgeSourceRebuild([sourceKey], actor.id);
}

export async function saveManualKnowledgeDocument(id, body, actor) {
  const allowedSources = new Set(['ordinances_resolutions','approved_municipal_documents','official_forms']);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  const sourceUrl = typeof body?.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
  const sourceKey = body?.sourceKey;
  if (!allowedSources.has(sourceKey) || !title || title.length > 500 || !content || content.length > 24000 || !sourceUrl || sourceUrl.length > 1000 || !/^\/(?!\/)/.test(sourceUrl) && !/^https:\/\//i.test(sourceUrl)) throw Object.assign(new Error('Enter a supported source, title, public URL, and document text.'), { status: 422 });
  const visibility = ['public','internal','private'].includes(body.visibility) ? body.visibility : 'public';
  const publicationStatus = ['draft','published','unpublished'].includes(body.publicationStatus) ? body.publicationStatus : 'draft';
  const approved = body.approved === true && visibility === 'public' && publicationStatus === 'published';
  const pool = await getCmsPool();
  if (id) {
    const [rows] = await pool.execute(`UPDATE ai_knowledge_manual_documents SET source_key=?,title=?,source_url=?,content=?,visibility=?,publication_status=?,approved=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING id`, [sourceKey,title,sourceUrl,content,visibility,publicationStatus,approved,actor.id,id]);
    if (!rows.length) throw Object.assign(new Error('Knowledge document was not found.'), { status: 404 });
  } else {
    await pool.execute(`INSERT INTO ai_knowledge_manual_documents (source_key,title,source_url,content,visibility,publication_status,approved,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?)`, [sourceKey,title,sourceUrl,content,visibility,publicationStatus,approved,actor.id,actor.id]);
  }
  await pool.execute(`INSERT INTO ai_audit_logs (id,user_id,action,module_key,details,ip_address) VALUES (?,?,'ai.knowledge.document.save','knowledge_base',?::jsonb,?)`, [crypto.randomUUID(), actor.id, JSON.stringify({ sourceKey, title, approved, visibility, publicationStatus }), actor.ip || '']);
}

export async function deleteManualKnowledgeDocument(id, actor) {
  const pool = await getCmsPool();
  const [rows] = await pool.execute('DELETE FROM ai_knowledge_manual_documents WHERE id=? RETURNING id,source_key,title', [id]);
  if (!rows.length) throw Object.assign(new Error('Knowledge document was not found.'), { status: 404 });
  await pool.execute(`INSERT INTO ai_audit_logs (id,user_id,action,module_key,details,ip_address) VALUES (?,?,'ai.knowledge.document.delete','knowledge_base',?::jsonb,?)`, [crypto.randomUUID(), actor.id, JSON.stringify({ sourceKey: rows[0].source_key, title: rows[0].title }), actor.ip || '']);
}

export async function retrieveKnowledge(query, history = []) {
  const pool = await getCmsPool();
  const contextualQuery = `${history.filter(item => item.role === 'user').map(item => item.content).join(' ')} ${query}`.slice(-4000);
  const tokens = [...new Set(contextualQuery.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].filter(word => !['the','and','for','how','what','where','when','who','can','could','would','with','from','about','please','this','that','are','you','getafe','municipality','unsa','ang','mga','paano','saan','gusto','ko','ba','ang'].includes(word));
  const found = new Map();
  let semanticUsed = false;
  if (tokens.length) {
    try {
      const [rows] = await pool.execute(`SELECT d.id,d.title,d.content,d.source_url AS "sourceUrl",s.label AS "sourceLabel",ts_rank_cd(d.search_vector,to_tsquery('simple',?)) AS score FROM ai_knowledge_documents d JOIN ai_knowledge_sources s USING(source_key) WHERE s.enabled=TRUE AND s.approved=TRUE AND s.visibility='public' AND d.approved=TRUE AND d.visibility='public' AND d.publication_status='published' AND d.indexing_status='indexed' AND d.search_vector @@ to_tsquery('simple',?) ORDER BY score DESC,d.updated_at DESC LIMIT 10`, [tokens.map(word => word.replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean).join(' | '), tokens.map(word => word.replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean).join(' | ')]);
      for (const row of rows) found.set(row.id, { title: row.title, text: row.content, url: row.sourceUrl, type: row.sourceLabel, score: Number(row.score) || 0 });
    } catch (error) { console.warn(JSON.stringify({ event: 'ai_knowledge_lexical_search_failed', code: error?.code || 'search_error' })); }
  }
  if (tokens.length && openAiApiKey() && await isAiOperationEnabled() && await isAiOperationEnabled('knowledge_base')) {
    try {
      const vectorReady = await vectorAvailable();
      if (vectorReady) {
        const embedding = await makeEmbeddings([contextualQuery]);
        if (embedding?.[0]) {
          const [rows] = await pool.execute(`SELECT d.id,d.title,d.content,d.source_url AS "sourceUrl",s.label AS "sourceLabel",1-(d.embedding <=> ?::vector) AS score FROM ai_knowledge_documents d JOIN ai_knowledge_sources s USING(source_key) WHERE d.embedding IS NOT NULL AND s.enabled=TRUE AND s.approved=TRUE AND s.visibility='public' AND d.approved=TRUE AND d.visibility='public' AND d.publication_status='published' AND d.indexing_status='indexed' ORDER BY d.embedding <=> ?::vector LIMIT 8`, [`[${embedding[0].join(',')}]`, `[${embedding[0].join(',')}]`]);
          for (const row of rows) {
            const prior = found.get(row.id);
            found.set(row.id, { title: row.title, text: row.content, url: row.sourceUrl, type: row.sourceLabel, score: Math.max(Number(row.score) || 0, prior?.score || 0) });
          }
          semanticUsed = rows.length > 0;
        }
      }
    } catch (error) { console.warn(JSON.stringify({ event: 'ai_knowledge_vector_search_unavailable', code: error?.code || 'vector_error' })); }
  }
  return Object.assign([...found.values()].sort((a,b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0,5).map(({ title,text,url,type }) => ({ title, text: text.slice(0,2400), url, type })), { semanticUsed });
}
