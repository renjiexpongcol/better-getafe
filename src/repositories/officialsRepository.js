import { getLocalDb, saveLocalDb, isGcp } from './localDb.js';
import { getCmsPool } from '../services/cloudSql.js';
import { barangays } from '../data/barangays.js';

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
    return rows[0] ? JSON.parse(rows[0].content) : DEFAULT_OFFICIALS;
  }
  const db = await getLocalDb();
  return db.officials || DEFAULT_OFFICIALS;
}

export async function saveOfficials(content) {
  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute('INSERT INTO site_pages (slug, content, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE content=VALUES(content), updated_at=NOW()', ['officials', JSON.stringify(content)]);
    return content;
  }
  const db = await getLocalDb();
  db.officials = content;
  await saveLocalDb(db);
  return content;
}
