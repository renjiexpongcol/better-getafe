import { managedContentRepository } from '../repositories/managedContentRepository.js'
import { sanitizeRichText } from './sanitizeHtml.js'

const kinds = new Set(['page','hotlines','navigation','actions','home','help'])
const keyPattern = /^[a-z0-9][a-z0-9-]{0,119}$/
function validateShape(content, kind) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value)
  const strings = (value, fields, required = []) => {
    if (!object(value) || fields.some(field => value[field] !== undefined && typeof value[field] !== 'string') || required.some(field => !value[field]?.trim())) throw new Error('Enter valid text for each content field.')
  }
  const rows = (value, check) => { if (value === undefined) return; if (!Array.isArray(value)) throw new Error('Content lists must contain individual items.'); value.forEach(check) }
  if (kind === 'page') {
    strings(content, ['title','subtitle','body'])
    rows(content.sections, item => strings(item, ['id','title','body'], ['title']))
    if (content.service !== undefined) {
      const service = content.service
      strings(service, ['kicker','title','subtitle','intro','backLabel','requirementsTitle','stepsTitle','variant'])
      rows(service.services, item => {
        strings(item, ['name','desc'], ['name'])
        if (!Array.isArray(item.requirements) || !item.requirements.every(text => typeof text === 'string')) throw new Error('Enter individual requirement labels.')
      })
      rows(service.steps, item => { strings(item, ['text'], ['text']); if (item.n !== undefined && !Number.isInteger(item.n)) throw new Error('Enter a valid step number.') })
      if (service.office !== undefined) strings(service.office, ['name','location','hours'])
      if (service.contact !== undefined) strings(service.contact, ['phone','email'])
      rows(service.related, item => strings(item, ['name','desc','url','email','img'], ['name','url']))
    }
  }
  if (kind === 'home') strings(content, ['title','description','image','mayorMessage','aboutTitle','aboutBody','helpTitle','helpBody'])
  if (kind === 'hotlines') {
    if (content.emergency !== undefined) strings(content.emergency, ['number','label','tel'])
    rows(content.items, item => {
      strings(item, ['id','name','category','description','icon'], ['id','name','category'])
      if (!Array.isArray(item.numbers) || !item.numbers.every(number => typeof number === 'string' && number.trim())) throw new Error('Each hotline needs valid contact numbers.')
      if (item.urgent !== undefined && typeof item.urgent !== 'boolean') throw new Error('Choose a valid urgency state.')
    })
    rows(content.quickDial, item => strings(item, ['number','name','note','tel'], ['number','name','tel']))
    rows(content.tips, item => strings(item, ['title','text','icon'], ['title','text']))
  }
  if (kind === 'navigation') {
    rows(content.menus, menu => { strings(menu, ['key','label'], ['key','label']); rows(menu.items, item => strings(item, ['name','url','description','icon'], ['name','url'])) })
    for (const group of ['explore','government','judiciary','social']) rows(content[group], item => strings(item, ['name','url'], ['name','url']))
  }
  if (kind === 'actions') rows(content.items, item => strings(item, ['title','description','url','icon'], ['title','url']))
  if (kind === 'help') rows(content.items, item => strings(item, ['title','body'], ['title','body']))
}
function clean(value, depth = 0) {
  if (depth > 12) throw new Error('Content is nested too deeply.')
  if (typeof value === 'string') return sanitizeRichText(value)
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (Array.isArray(value)) { if (value.length > 1000) throw new Error('Too many content items.'); return value.map(item => clean(item, depth + 1)) }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (['__proto__','constructor','prototype'].includes(key)) throw new Error('Invalid content field.')
    if (['href','url','tel','image','img','photo'].includes(key) && item && !/^(?:\/(?!\/)|https?:\/\/|tel:[+0-9]|mailto:)/i.test(item)) throw new Error('Enter a valid link or contact destination.')
    return [key, clean(item, depth + 1)]
  }))
  throw new Error('Invalid content value.')
}
export function validateManagedContent(data) {
  if (!data || !kinds.has(data.kind) || !String(data.title || '').trim() || !Number.isInteger(data.version) || data.version < 0 || typeof data.published !== 'boolean' || !data.content || typeof data.content !== 'object' || Array.isArray(data.content)) throw new Error('Enter a title, content, publishing state, and current version.')
  if (JSON.stringify(data.content).length > 500000) throw new Error('Content is too large.')
  const content = clean(data.content)
  validateShape(content, data.kind)
  if (data.kind === 'hotlines') {
    for (const item of content.items || []) if (!item.id || !item.name || !item.category || !Array.isArray(item.numbers) || !item.numbers.every(number => typeof number === 'string')) throw new Error('Each hotline needs an ID, name, category, and contact numbers.')
  }
  return { title: String(data.title).trim().slice(0, 200), kind: data.kind, version: data.version, published: data.published, content }
}
export function registerManagedContentRoutes(app, { admin, permission, repository = managedContentRepository() }) {
  const handle = work => async (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      if (req.params.key && !keyPattern.test(req.params.key)) return res.status(400).json({ error: 'Invalid content identifier.' })
      await work(req, res)
    } catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Content is temporarily unavailable. Please try again.' }) }
  }
  app.get('/api/public/content/:key', handle(async (req, res) => res.json({ item: await repository.find(req.params.key) })))
  const guard = [admin, permission('content.news.manage')]
  app.get('/api/admin/public-content', ...guard, handle(async (_req, res) => res.json({ items: await repository.list() })))
  app.get('/api/admin/public-content/:key', ...guard, handle(async (req, res) => res.json({ item: await repository.find(req.params.key, true) })))
  app.put('/api/admin/public-content/:key', ...guard, handle(async (req, res) => {
    let data
    try {
      data = validateManagedContent(req.body)
      const expected = req.params.key.startsWith('page-') ? 'page' : ['hotlines','navigation','actions','home','help'].includes(req.params.key) ? req.params.key : null
      if (expected && data.kind !== expected) throw new Error('Choose the content type assigned to this page.')
    } catch (error) { error.status = 422; throw error }
    const actorId = req.admin?.id
    if (!actorId) return res.status(403).json({ error: 'An authenticated editor is required.' })
    res.json({ item: await repository.save(req.params.key, data, actorId) })
  }))
}
