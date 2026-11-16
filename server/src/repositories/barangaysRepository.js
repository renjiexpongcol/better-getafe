import { getCmsPool } from '../services/database.js';
import { syncContentMedia } from './contentMediaRepository.js';
const normalizeRecords = items => {
  if (!Array.isArray(items)) throw new Error('Invalid saved barangay content.');
  return items.map(({ details, ...record }) => ({ ...record, more_information: record.more_information ?? details ?? '', cover_image: record.cover_image || record.heroImage || '', cover_image_alt: record.cover_image_alt || '' }));
};
export async function getBarangays(poolFactory = getCmsPool) {
    const pool = await poolFactory();
    const [rows] = await pool.execute('SELECT content FROM site_pages WHERE slug = ?', ['barangays']);
    if (!rows[0]) return [];
    try {
      const saved = typeof rows[0].content === 'string' ? JSON.parse(rows[0].content) : rows[0].content;
      return normalizeRecords(saved);
    } catch (error) {
      throw new Error('Saved barangay content is invalid.', { cause: error });
    }
}
export async function saveBarangays(content) {
    const pool = await getCmsPool();
    await pool.execute('INSERT INTO site_pages (slug, content, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (slug) DO UPDATE SET content=EXCLUDED.content, updated_at=EXCLUDED.updated_at', ['barangays', JSON.stringify(content)]);
    await syncContentMedia('site_page', 'barangays', {
      galleryImages: (Array.isArray(content) ? content : []).filter((item) => item?.cover_image).map((item, position) => ({ storage_path: item.cover_image, position, alt: item.cover_image_alt || '' })),
    });
    return content;
}
