import { getLocalDb, saveLocalDb, isGcp } from './postgresCompatibility.js';
import { getCmsPool } from '../services/cloudSql.js';
import { syncContentMedia } from './contentMediaRepository.js';
import { barangays } from '../../../src/data/barangays.js';

const DEFAULT_OFFICIALS = {
  mayor: { name: 'Cary M. Camacho, MPM', role: 'Municipal Mayor' },
  viceMayor: { name: 'Casey Shaun M. Camacho', role: 'Municipal Vice-Mayor' },
  sbMembers: [
    ['Ramil T. Botero', 'SB Member'], ['Eduardo A. Torremocha', 'SB Member'], ['Marcelino C. Mejias', 'SB Member'], ['Jonas T. Socias', 'SB Member'],
    ['Mario P. Monillas', 'SB Member'], ['Prince Dayaw G. Lugod', 'SB Member'], ['Felipe S. Pogoy', 'SB Member'], ['Norberto B. Cabañero', 'SB Member'],
  ].map(([name, role]) => ({ name, role })),
  abcPresident: { name: 'Cydon Cariso M. Camacho II', role: 'ABC President' },
  punongBarangays: barangays.map(({ name, captain }) => ({ name: captain, role: name })),
  deptHeads: [
    ['Diana Y. Camacho, RN', 'Municipal Administrator'], ['Arlene T. Renegado', 'Municipal Treasurer'], ['Ma. Luchie L. Valcorza', 'Municipal Assessor'],
    ['Atty. Jairus T. Socias, CPA', 'Municipal Accountant'], ['Elvira L. Ego-ogan', 'Municipal Budget Officer'], ['Engr. Amadeus T. Masecampo', 'Municipal Engineer'],
    ['Wilma J. Monillas', "Municipal Planning & Dev't. Coordinator"], ['Erlinda Deryl Estrella', 'Local Civil Registrar'], ['Dr. Raye Angeli Abella', 'Municipal Health Officer'],
    ['Jessa Mae V. Balaba', 'Municipal Social Welfare Officer'], ['Jesfer N. Camacho, RN', 'Secretary to the Sangguniang Bayan'],
  ].map(([name, role]) => ({ name, role })),
};

export async function getOfficials() {
  if (isGcp()) {
    const pool = await getCmsPool();
    const [rows] = await pool.execute('SELECT content FROM site_pages WHERE slug = ?', ['officials']);
    let saved = {};
    if (rows[0]) {
      try {
        const parsed = JSON.parse(rows[0].content);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
      } catch (error) {
        console.error('Officials CMS content is invalid JSON; using defaults:', error.message);
      }
    }
    // Older CMS saves may contain only the three primary officials. Merge
    // missing groups back into the complete roster so a partial save cannot
    // make council members, barangay captains, or department heads disappear.
    const mergePrimary = (fallback, candidate) => {
      const value = candidate && typeof candidate === 'object' ? candidate : {};
      return {
        ...fallback,
        ...value,
        name: String(value.name || '').trim() ? value.name : fallback.name,
        role: String(value.role || '').trim() ? value.role : fallback.role,
      };
    };
    return {
      ...DEFAULT_OFFICIALS,
      ...saved,
      mayor: mergePrimary(DEFAULT_OFFICIALS.mayor, saved.mayor),
      viceMayor: mergePrimary(DEFAULT_OFFICIALS.viceMayor, saved.viceMayor),
      abcPresident: mergePrimary(DEFAULT_OFFICIALS.abcPresident, saved.abcPresident),
      sbMembers: Array.isArray(saved.sbMembers) && saved.sbMembers.length ? saved.sbMembers : DEFAULT_OFFICIALS.sbMembers,
      punongBarangays: Array.isArray(saved.punongBarangays) && saved.punongBarangays.length ? saved.punongBarangays : DEFAULT_OFFICIALS.punongBarangays,
      deptHeads: Array.isArray(saved.deptHeads) && saved.deptHeads.length ? saved.deptHeads : DEFAULT_OFFICIALS.deptHeads,
    };
  }
  const db = await getLocalDb();
  return db.officials || DEFAULT_OFFICIALS;
}

export async function saveOfficials(content) {
  if (isGcp()) {
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
  const db = await getLocalDb();
  db.officials = content;
  await saveLocalDb(db);
  return content;
}
