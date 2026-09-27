import { getLocalDb, saveLocalDb, isGcp } from './postgresCompatibility.js';
import { getCmsPool } from '../services/cloudSql.js';
import { syncContentMedia } from './contentMediaRepository.js';
import { barangays } from '../../../src/data/barangays.js';

const defaults = barangays;
const defaultDetails = {
  alumar: `<h2>Demographics</h2><p>Alumar had a population of 1,203 in the 2020 Census, representing 3.60% of Getafe's total population. In the 2015 Census, its household population was 1,164 across 231 households, with an average household size of 5.04.</p><h3>Population trends</h3><p>The population grew from 413 in 1990 to 1,203 in 2020. The 2015 age profile recorded a median age of 18.84 years and a total dependency ratio of 82.16.</p><h2>Location</h2><p>Alumar is situated at approximately 10.1790, 124.2145, on Mahanay Island. Its elevation is estimated at 0.6 metres above mean sea level.</p><h2>Adjacent barangay</h2><p>Alumar shares a common border with Mahanay on Mahanay Island.</p><h2>Data notes</h2><p>Population and household figures are from the Philippine Statistics Authority. Location information is provided for community reference.</p>`
};
const mergeWithDefaults = (items) => items.map((item, index) => {
  const { details: legacyDetails, ...record } = item || {};
  return {
    ...defaults[index],
    ...record,
    more_information: item.more_information ?? legacyDetails ?? defaultDetails[item.id] ?? '',
    cover_image: item.cover_image || item.heroImage || defaults[index]?.cover_image || '',
    cover_image_alt: item.cover_image_alt || '',
    coords: { ...defaults[index]?.coords, ...item.coords },
  };
});
export async function getBarangays() {
  if (isGcp()) {
    const pool = await getCmsPool();
    const [rows] = await pool.execute('SELECT content FROM site_pages WHERE slug = ?', ['barangays']);
    if (!rows[0]) return mergeWithDefaults(defaults);
    try {
      const saved = JSON.parse(rows[0].content);
      return Array.isArray(saved) ? mergeWithDefaults(saved) : mergeWithDefaults(defaults);
    } catch (error) {
      console.error('Barangay CMS content is invalid JSON; using defaults:', error.message);
      return mergeWithDefaults(defaults);
    }
  }
  const db = await getLocalDb();
  return mergeWithDefaults(db.barangays || defaults);
}
export async function saveBarangays(content) {
  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute('INSERT INTO site_pages (slug, content, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (slug) DO UPDATE SET content=EXCLUDED.content, updated_at=EXCLUDED.updated_at', ['barangays', JSON.stringify(content)]);
    await syncContentMedia('site_page', 'barangays', {
      galleryImages: (Array.isArray(content) ? content : []).filter((item) => item?.cover_image).map((item, position) => ({ storage_path: item.cover_image, position, alt: item.cover_image_alt || '' })),
    });
    return content;
  }
  const db = await getLocalDb(); db.barangays = content; await saveLocalDb(db); return content;
}
