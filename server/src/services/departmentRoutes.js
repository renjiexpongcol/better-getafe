import { listDepartments, findDepartment, saveDepartment } from '../repositories/departmentsRepository.js';
import { validateDepartment } from './departmentValidation.js';
import { citizenServices, serviceLink } from '../../../src/data/citizenServices.js';
import { getOfficials } from '../repositories/officialsRepository.js';
import { getOfficialDirectory } from '../repositories/governmentOfficialsRepository.js';
import { toPublicOfficialsDirectory } from './publicApiDtos.js';
import { getNewsArticles } from '../repositories/newsRepository.js';
import { getMediaByStoragePath } from '../repositories/mediaRepository.js';
import { createDownloadUrl } from './storage.js';
import { syncContentMedia } from '../repositories/contentMediaRepository.js';

export function registerDepartmentRoutes(app, { admin, permission }) {
  const guard = [admin, permission('departments.manage')];
  const handle = work => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { await work(req, res); }
    catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'That slug or service is already assigned to another office.' });
      if (error.status === 422) return res.status(422).json({ error: error.message });
      console.error('Department request failed:', error.message);
      res.status(503).json({ error: 'Office information is temporarily unavailable. Please try again later.' });
    }
  };
  const officials = async () => toPublicOfficialsDirectory(await getOfficialDirectory(await getOfficials())).items;
  const decorate = async item => {
    const [people, news] = await Promise.all([item.officialSlug || item.slug === 'executive' ? officials() : [], item.newsIds?.length ? getNewsArticles() : []]);
    const documents = [];
    for (const path of item.documentPaths || []) {
      const media = await getMediaByStoragePath(path);
      if (media?.status === 'active') documents.push({ name: media.original_filename, url: await createDownloadUrl(media.storage_path, media.storage_bucket) });
    }
    const image = item.featuredImage ? await getMediaByStoragePath(item.featuredImage) : null;
    return {
      id: item.id, slug: item.slug, name: item.name, icon: item.icon || 'Building2', shortDescription: item.shortDescription || '', description: item.description || '',
      responsibilities: item.responsibilities || '', programs: item.programs || '',
      phone: item.phone || '', email: item.email || '', location: item.location || '', hours: item.hours || '', imageAlt: item.imageAlt || '',
      imageUrl: image?.status === 'active' ? await createDownloadUrl(image.storage_path, image.storage_bucket) : '',
      official: people.find(person => person.slug === item.officialSlug) || (!item.officialSlug && item.slug === 'executive' ? people.find(person => person.position?.slug === 'mayor' && ['current', 'unknown'].includes(person.term?.status)) : null) || null,
      services: citizenServices.filter(service => item.serviceIds.includes(service.id)).map(service => ({ ...service, department_id: item.id, href: serviceLink(service) })),
      announcements: news.filter(article => item.newsIds.includes(article.id) && article.status === 'published' && (!article.published_at || new Date(article.published_at) <= new Date())).sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at)).map(article => ({ id: article.id, title: article.title, excerpt: article.excerpt, slug: article.slug, publishedAt: article.published_at })),
      documents,
    };
  };
  app.get('/api/departments', handle(async (_req, res) => res.json({ items: (await listDepartments()).map(item => ({ id: item.id, slug: item.slug, name: item.name, shortDescription: item.shortDescription || '' })) })));
  app.get('/api/departments/:slug', handle(async (req, res) => {
    const item = await findDepartment(req.params.slug);
    if (!item) return res.status(404).json({ error: 'Office not found.' });
    res.json(await decorate(item));
  }));
  app.get('/api/admin/departments/options', ...guard, handle(async (_req, res) => {
    const [people, news, departments] = await Promise.all([officials(), getNewsArticles(), listDepartments(true)]);
    const offices = await Promise.all(departments.map(item => findDepartment(item.id, true)));
    res.json({ officials: people, news: news.map(item => ({ id: item.id, title: item.title, status: item.status })), services: citizenServices.map(service => ({ ...service, department_id: offices.find(office => office.serviceIds.includes(service.id))?.id || null })) });
  }));
  app.get('/api/admin/departments', ...guard, handle(async (_req, res) => res.json({ items: await listDepartments(true) })));
  app.get('/api/admin/departments/:id', ...guard, handle(async (req, res) => {
    const item = await findDepartment(req.params.id, true);
    if (!item) return res.status(404).json({ error: 'Office not found.' });
    res.json(item);
  }));
  const save = handle(async (req, res) => {
    let data;
    try {
      data = validateDepartment(req.body || {});
      if (['executive','engineering','zoning-planning','treasury','assessment','civil-registry','health','social-welfare'].includes(data.slug) && req.params.id !== data.slug) throw new Error('This URL is reserved for its existing municipal office.');
      if (data.featuredImage && data.published && !data.imageAlt) throw new Error('Add image alt text before publishing.');
      if (data.officialSlug && !(await officials()).some(person => person.slug === data.officialSlug)) throw new Error('Choose an existing official.');
      if (data.newsIds.length) {
        const news = await getNewsArticles();
        if (data.newsIds.some(id => !news.some(article => article.id === id))) throw new Error('Choose existing announcements.');
      }
      for (const path of [data.featuredImage, ...data.documentPaths].filter(Boolean)) {
        const media = await getMediaByStoragePath(path);
        if (!media || media.status !== 'active') throw new Error('Choose active Media Library files.');
        if (path === data.featuredImage && !['image/jpeg','image/png','image/webp','image/avif'].includes(media.content_type)) throw new Error('Choose an image for the office header.');
      }
    } catch (error) { error.status = 422; throw error; }
    const id = await saveDepartment(data, req.params.id);
    if (!id) return res.status(404).json({ error: 'Office not found.' });
    await syncContentMedia('department', id, { featuredImage: data.featuredImage, galleryImages: data.documentPaths.map(storage_path => ({ storage_path })) });
    res.status(req.params.id ? 200 : 201).json(await findDepartment(id, true));
  });
  app.post('/api/admin/departments', ...guard, save);
  app.put('/api/admin/departments/:id', ...guard, save);
}
