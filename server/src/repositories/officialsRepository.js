import { getCmsPool } from '../services/database.js';
import { syncContentMedia } from './contentMediaRepository.js';
export async function getOfficials(poolFactory = getCmsPool) {
  const pool = await poolFactory();
  const [rows] = await pool.execute('SELECT content FROM site_pages WHERE slug = ?', ['officials']);
  if (!rows[0]) return {};
  const saved = typeof rows[0].content === 'string' ? JSON.parse(rows[0].content) : rows[0].content;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid saved officials content.');
  return saved;
}

export async function saveOfficials(content) {
    const pool = await getCmsPool();
    await pool.execute('INSERT INTO site_pages (slug, content, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (slug) DO UPDATE SET content=EXCLUDED.content, updated_at=EXCLUDED.updated_at', ['officials', JSON.stringify(content)]);
    const photos = [];
    const collectPhotos = (value) => {
      if (Array.isArray(value)) return value.forEach(collectPhotos);
      if (!value || typeof value !== 'object') return;
      if (typeof value.photo === 'string' && value.photo.trim()) photos.push({ storage_path: value.photo.trim(), position: photos.length });
      Object.entries(value).forEach(([key, child]) => { if (key !== 'photo') collectPhotos(child); });
    };
    collectPhotos(content);
    await syncContentMedia('site_page', 'officials', { galleryImages: photos });
    return content;
}
