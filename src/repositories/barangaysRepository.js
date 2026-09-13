import { getLocalDb, saveLocalDb, isGcp } from './localDb.js';
import { getCmsPool } from '../services/cloudSql.js';
import { barangays } from '../data/barangays.js';

const defaults = barangays;
const defaultDetails = {
  alumar: `<h2>Demographics</h2><p>Alumar had a population of 1,203 in the 2020 Census, representing 3.60% of Getafe's total population. In the 2015 Census, its household population was 1,164 across 231 households, with an average household size of 5.04.</p><h3>Population trends</h3><p>The population grew from 413 in 1990 to 1,203 in 2020. The 2015 age profile recorded a median age of 18.84 years and a total dependency ratio of 82.16.</p><h2>Location</h2><p>Alumar is situated at approximately 10.1790, 124.2145, on Mahanay Island. Its elevation is estimated at 0.6 metres above mean sea level.</p><h2>Adjacent barangay</h2><p>Alumar shares a common border with Mahanay on Mahanay Island.</p><h2>Data notes</h2><p>Population and household figures are from the Philippine Statistics Authority. Location information is provided for community reference.</p>`
};
const mergeWithDefaults = (items) => items.map((item, index) => ({
  ...defaults[index],
  ...item,
  details: item.details ?? defaultDetails[item.id] ?? '',
  coords: { ...defaults[index]?.coords, ...item.coords },
}));
export async function getBarangays() {
  if (isGcp()) {
    const pool = await getCmsPool();
    const [rows] = await pool.execute('SELECT content FROM site_pages WHERE slug = ?', ['barangays']);
    return rows[0] ? mergeWithDefaults(JSON.parse(rows[0].content)) : mergeWithDefaults(defaults);
  }
  const db = await getLocalDb();
  return mergeWithDefaults(db.barangays || defaults);
}
export async function saveBarangays(content) {
  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute('INSERT INTO site_pages (slug, content, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE content=VALUES(content), updated_at=NOW()', ['barangays', JSON.stringify(content)]);
    return content;
  }
  const db = await getLocalDb(); db.barangays = content; await saveLocalDb(db); return content;
}
