import { listDestinations, findDestination, findDestinationById, findLegacyDestination, saveDestination, deleteDestination } from '../repositories/destinationsRepository.js';
import { getMediaByStoragePath } from '../repositories/mediaRepository.js';
import { createDownloadUrl } from './storage.js';
import { getCmsPool } from './cloudSql.js';
import { validateDestination } from './destinationValidation.js';
import { syncContentMedia } from '../repositories/contentMediaRepository.js';
const decorate = async item => {
  const media = item.featuredImage ? await getMediaByStoragePath(item.featuredImage) : null;
  return { ...item, featuredMediaId: media?.id || null, imageUrl: media ? await createDownloadUrl(media.storage_path, media.storage_bucket) : '' };
};
const publicView = item => ({
  id: item.id,
  title: item.title,
  slug: item.slug,
  shortDescription: item.shortDescription,
  fullDescription: item.fullDescription,
  imageAlt: item.imageAlt,
  location: item.location,
  category: item.category,
  published: item.published,
  featured: item.featured,
  displayOrder: item.displayOrder,
  imageUrl: item.imageUrl,
});
export function registerDestinationRoutes(app, { admin, permission }) {
  const guard = [admin, permission('content.news.manage')];
  const handle = work => async (req, res) => {
    try { await work(req, res); }
    catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'That destination slug is already in use.' });
      console.error('Discover Getafe request failed:', error.message);
      res.status(503).json({ error: 'Destination information is temporarily unavailable.' });
    }
  };
  app.get('/api/discover', handle(async (req, res) => {
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    const result = await listDestinations({ featured: req.query.featured === 'true', limit: req.query.featured === 'true' ? 3 : 100, offset });
    res.json({ ...result, items: (await Promise.all(result.items.map(decorate))).map(publicView) });
  }));
  app.get('/api/discover/legacy/:key', handle(async (req, res) => {
    const item = await findLegacyDestination(req.params.key);
    if (!item) return res.status(404).json({ error: 'Destination not found.' });
    res.json(await decorate(item));
  }));
  app.get('/api/discover/:slug', handle(async (req, res) => {
    const item = await findDestination(req.params.slug);
    if (!item) return res.status(404).json({ error: 'Destination not found.' });
    res.json(publicView(await decorate(item)));
  }));
  app.get('/api/admin/destinations', ...guard, handle(async (req, res) => res.json(await listDestinations({ admin: true, limit: 100, offset: Math.max(0, Number.parseInt(req.query.offset, 10) || 0) }))));
  app.get('/api/admin/destinations/:id', ...guard, handle(async (req, res) => {
    const item = await findDestinationById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Destination not found.' });
    res.json(publicView(await decorate(item)));
  }));
  const save = handle(async (req, res) => {
    let data;
    try { data = validateDestination(req.body || {}); }
    catch (error) { return res.status(422).json({ error: error.message }); }
    if (data.featuredImage) {
      const media = await getMediaByStoragePath(data.featuredImage);
      if (!media || !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(media.content_type)) return res.status(422).json({ error: 'Choose an existing Media Library image.' });
    }
    const item = await saveDestination(data, req.params.id);
    if (!item) return res.status(404).json({ error: 'Destination not found.' });
    await syncContentMedia('destination', item.id, { featuredImage: item.featuredImage });
    res.status(req.params.id ? 200 : 201).json(item);
  });
  app.post('/api/admin/destinations', ...guard, save);
  app.put('/api/admin/destinations/:id', ...guard, save);
  app.delete('/api/admin/destinations/:id', ...guard, handle(async (req, res) => {
    if (!(await deleteDestination(req.params.id))) return res.status(404).json({ error: 'Destination not found.' });
    const pool = await getCmsPool();
    await pool.execute('DELETE FROM content_media WHERE content_type = ? AND content_id = ?', ['destination', req.params.id]);
    res.status(204).end();
  }));
}
