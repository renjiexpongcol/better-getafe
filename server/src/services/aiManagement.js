import crypto from 'node:crypto';
import OpenAI from 'openai';
import { config } from '../config/index.js';
import { getCmsPool } from './database.js';
import { sanitizeRichText } from './sanitizeHtml.js';

export const AI_MODULE_KEYS = [
  'resident_assistant',
  'cms_content',
  'writing_assistant',
  'translation',
  'smart_search',
  'knowledge_base',
  'analytics_insights',
  'document_assistance',
  'accessibility_assistance',
  'moderation_assistance',
  'administrative_assistant',
  'workflow_automation',
];

export function openAiApiKey() {
  const configured = String(config.get('ai.openaiApiKey') || '').trim();
  return configured || String(process.env.OPENAI_API_KEY || '').trim();
}

export async function aiOverview() {
  const pool = await getCmsPool();
  const [settingsRows] = await pool.execute('SELECT * FROM ai_settings WHERE id = 1');
  const [moduleRows] = await pool.execute('SELECT module_key, enabled, model, configuration, updated_at FROM ai_modules');
  const [providerRows] = await pool.execute('SELECT * FROM ai_provider_config WHERE id = 1');
  const [usageRows] = await pool.execute(`
    SELECT COUNT(*)::int AS requests,
      COUNT(*) FILTER (WHERE status = 'success')::int AS successful,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
      COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
      COALESCE(SUM(estimated_cost_usd), 0)::numeric AS estimated_cost
    FROM ai_usage_events
    WHERE created_at >= date_trunc('month', CURRENT_TIMESTAMP)
  `);
  const [recentRows] = await pool.execute('SELECT id, module_key, status, model, duration_ms, error_code, created_at FROM ai_usage_events ORDER BY created_at DESC LIMIT 20');
  const settings = settingsRows[0] || { enabled: false, default_model: 'gpt-4.1-mini', monthly_budget_usd: 0 };
  const provider = providerRows[0] || { status: 'not_configured', status_detail: null };
  const modules = Object.fromEntries(AI_MODULE_KEYS.map(key => {
    const row = moduleRows.find(item => item.module_key === key);
    return [key, { enabled: Boolean(row?.enabled), model: row?.model || settings.default_model, configuration: row?.configuration || {}, updatedAt: row?.updated_at || null }];
  }));
  return {
    enabled: Boolean(settings.enabled),
    defaultModel: settings.default_model,
    monthlyBudgetUsd: Number(settings.monthly_budget_usd || 0),
    keyConfigured: Boolean(openAiApiKey()),
    provider,
    modules,
    usage: usageRows[0] || {},
    recentRequests: recentRows,
  };
}

export async function updateAiSettings({ enabled, defaultModel, monthlyBudgetUsd }, actor) {
  const pool = await getCmsPool();
  const model = String(defaultModel || '').trim();
  if (!model) throw Object.assign(new Error('A default model is required.'), { status: 422 });
  if (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd < 0) throw Object.assign(new Error('Monthly budget must be zero or a positive number.'), { status: 422 });
  await pool.execute(
    `UPDATE ai_settings SET enabled = ?, default_model = ?, monthly_budget_usd = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
    [Boolean(enabled), model, monthlyBudgetUsd, actor.id],
  );
  await pool.execute(
    `INSERT INTO ai_audit_logs (id, user_id, action, details, ip_address) VALUES (?, ?, 'ai.settings.update', ?::jsonb, ?)`,
    [crypto.randomUUID(), actor.id, JSON.stringify({ enabled: Boolean(enabled), defaultModel: model, monthlyBudgetUsd }), actor.ip || ''],
  );
}

export async function updateAiModule(moduleKey, { enabled, model, configuration }, actor) {
  if (!AI_MODULE_KEYS.includes(moduleKey)) throw Object.assign(new Error('Unknown AI module.'), { status: 404 });
  const pool = await getCmsPool();
  await pool.execute(
    `UPDATE ai_modules SET enabled = ?, model = NULLIF(?, ''), configuration = ?::jsonb, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE module_key = ?`,
    [Boolean(enabled), String(model || '').trim(), JSON.stringify(configuration && typeof configuration === 'object' ? configuration : {}), actor.id, moduleKey],
  );
  await pool.execute(
    `INSERT INTO ai_audit_logs (id, user_id, action, module_key, details, ip_address) VALUES (?, ?, 'ai.module.update', ?, ?::jsonb, ?)`,
    [crypto.randomUUID(), actor.id, moduleKey, JSON.stringify({ enabled: Boolean(enabled), model: model || null }), actor.ip || ''],
  );
}

export async function generateCmsContent({ action, tone, facts, selectedText, title, excerpt, targetLanguage }, actor) {
  const allowlisted = new Set(['draft', 'titles', 'excerpt', 'improve', 'rewrite', 'expand', 'shorten', 'readability', 'bullets', 'seo', 'slug', 'translate', 'summary', 'faq', 'caption']);
  if (!allowlisted.has(action)) throw Object.assign(new Error('Unknown content action.'), { status: 422 });
  const moduleKey = action === 'translate' ? 'translation' : ['improve', 'rewrite', 'expand', 'shorten', 'readability', 'bullets'].includes(action) ? 'writing_assistant' : 'cms_content';
  if (!(await isAiOperationEnabled(moduleKey))) throw Object.assign(new Error('This AI module is disabled.'), { status: 403 });
  const key = openAiApiKey();
  if (!key) throw Object.assign(new Error('OpenAI is not configured.'), { status: 422 });
  const pool = await getCmsPool();
  const [moduleRows] = await pool.execute('SELECT model FROM ai_modules WHERE module_key = ?', [moduleKey]);
  const [settingsRows] = await pool.execute('SELECT default_model FROM ai_settings WHERE id = 1');
  const model = String(moduleRows[0]?.model || settingsRows[0]?.default_model || 'gpt-4.1-mini');
  const safeFacts = String(facts || '').slice(0, 12000);
  const safeText = String(selectedText || '').slice(0, 12000);
  const safeTitle = String(title || '').slice(0, 500);
  const safeExcerpt = String(excerpt || '').slice(0, 2000);
  const start = Date.now();
  try {
    const client = new OpenAI({ apiKey: key, timeout: 30000, maxRetries: 1 });
    const response = await client.responses.create({
      model,
      instructions: `You are a municipal CMS writing assistant. Never invent facts, dates, figures, quotations, officials, sponsors, fees, deadlines, or requirements. If information is missing, omit it. Use ${tone || 'Formal Government'} tone. Return only the requested structured fields. Use HTML-safe paragraphs and lists for content fields. Preserve the meaning and official names. Public text must not present AI output as an official decision.`,
      input: JSON.stringify({ action, targetLanguage: targetLanguage || 'English', facts: safeFacts, selectedText: safeText, title: safeTitle, excerpt: safeExcerpt }),
      max_output_tokens: 2500,
      text: {
        format: {
          type: 'json_schema',
          name: 'cms_assist',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              excerpt: { type: 'string' },
              content: { type: 'string' },
              slug: { type: 'string' },
              faq: { type: 'array', items: { type: 'string' } },
              caption: { type: 'string' },
              summary: { type: 'string' },
              output: { type: 'string' },
            },
            required: ['title', 'excerpt', 'content', 'slug', 'faq', 'caption', 'summary', 'output'],
          },
        },
      },
    });
    const parsed = JSON.parse(response.output_text || '{}');
    const result = {
      title: String(parsed.title || '').slice(0, 500),
      excerpt: String(parsed.excerpt || '').slice(0, 2000),
      content: sanitizeRichText(String(parsed.content || '').slice(0, 12000)),
      slug: String(parsed.slug || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200),
      faq: Array.isArray(parsed.faq) ? parsed.faq.slice(0, 20).map(value => String(value).slice(0, 500)) : [],
      caption: String(parsed.caption || '').slice(0, 1000),
      summary: String(parsed.summary || '').slice(0, 3000),
      output: String(parsed.output || '').slice(0, 12000),
    };
    const generationId = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO ai_usage_events (id, module_key, model, status, input_tokens, output_tokens, cached_tokens, duration_ms, request_id) VALUES (?, ?, ?, 'success', ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), moduleKey, response.model || model, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0, response.usage?.cached_input_tokens || 0, Date.now() - start, crypto.randomUUID()],
    );
    await pool.execute(
      `INSERT INTO ai_audit_logs (id, user_id, action, module_key, details, ip_address) VALUES (?, ?, 'ai.content.generated', ?, ?::jsonb, ?)`,
      [generationId, actor.id, moduleKey, JSON.stringify({ action, tone: tone || 'Formal Government', resultKind: 'cms_draft', published: false }), actor.ip || ''],
    );
    await pool.execute(
      `INSERT INTO ai_content_generations (id, user_id, action, tone, module_key, generation_status, publication_status) VALUES (?, ?, ?, ?, ?, 'generated', 'pending_review')`,
      [generationId, actor.id, action, tone || 'Formal Government', moduleKey],
    );
    return { ...result, generationId };
  } catch (error) {
    await pool.execute(
      `INSERT INTO ai_usage_events (id, module_key, model, status, duration_ms, error_code) VALUES (?, ?, ?, 'failed', ?, ?)`,
      [crypto.randomUUID(), moduleKey, model, Date.now() - start, error?.code || 'provider_error'],
    );
    throw Object.assign(new Error(error?.status ? `OpenAI returned HTTP ${error.status}` : 'AI content generation failed'), { status: 422 });
  }
}

export async function testOpenAiConnection(model, actor) {
  const key = openAiApiKey();
  if (!key) throw Object.assign(new Error('OpenAI is not configured.'), { status: 422 });
  const start = Date.now();
  const pool = await getCmsPool();
  try {
    const client = new OpenAI({ apiKey: key, timeout: 15000, maxRetries: 1 });
    const response = await client.responses.create({
      model: String(model || '').trim() || 'gpt-4.1-mini',
      input: 'Reply with the single word "Connected".',
      max_output_tokens: 10,
    });
    const text = String(response.output_text || '').trim();
    await pool.execute(
      `UPDATE ai_provider_config SET provider = 'openai', status = 'connected', status_detail = 'Authorized test request completed', last_success_at = CURRENT_TIMESTAMP, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
      [actor.id],
    );
    await pool.execute(
      `INSERT INTO ai_usage_events (id, module_key, model, status, input_tokens, output_tokens, duration_ms, request_id) VALUES (?, 'connection_test', ?, 'success', ?, ?, ?, ?)`,
      [crypto.randomUUID(), response.model || model, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0, Date.now() - start, crypto.randomUUID()],
    );
    return { status: 'connected', checkedAt: new Date().toISOString(), latencyMs: Date.now() - start, response: text };
  } catch (error) {
    const detail = error?.status ? `Provider returned HTTP ${error.status}` : 'The provider request failed';
    await pool.execute(
      `UPDATE ai_provider_config SET status = 'unavailable', status_detail = ?, last_failure_at = CURRENT_TIMESTAMP, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
      [detail, actor.id],
    );
    await pool.execute(
      `INSERT INTO ai_usage_events (id, module_key, model, status, duration_ms, error_code) VALUES (?, 'connection_test', ?, 'failed', ?, ?)`,
      [crypto.randomUUID(), model || 'gpt-4.1-mini', Date.now() - start, error?.code || 'provider_error'],
    );
    throw Object.assign(new Error(detail), { status: 422 });
  }
}

export async function isAiOperationEnabled(moduleKey) {
  const pool = await getCmsPool();
  const [settingsRows] = await pool.execute('SELECT enabled FROM ai_settings WHERE id = 1');
  if (!settingsRows[0]?.enabled) return false;
  if (!moduleKey) return true;
  const [moduleRows] = await pool.execute('SELECT enabled FROM ai_modules WHERE module_key = ?', [moduleKey]);
  return Boolean(moduleRows[0]?.enabled);
}
