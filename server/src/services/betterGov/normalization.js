const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

export function normalizeName(value) {
  const clean = String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr)\.?\b/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const tokens = clean.split(/\s+/).filter(Boolean);
  const suffix = tokens.length && SUFFIXES.has(tokens.at(-1)) ? tokens.pop() : null;
  return { value: tokens.join(' '), tokens, suffix, surname: tokens.at(-1) || '', given: tokens[0] || '' };
}

export function nameMatch(localName, externalName) {
  const local = normalizeName(localName), external = normalizeName(externalName);
  if (!local.value || !external.value) return { confidence: 'new', score: 0 };
  if (local.value === external.value && (!local.suffix || !external.suffix || local.suffix === external.suffix)) return { confidence: 'exact', score: 100 };
  const localGiven = local.given, externalGiven = external.given;
  const surnameMatches = local.surname && local.surname === external.surname;
  const givenMatches = localGiven === externalGiven || localGiven.startsWith(externalGiven) || externalGiven.startsWith(localGiven);
  const initialMatches = localGiven[0] && localGiven[0] === externalGiven[0];
  const overlap = local.tokens.filter(token => external.tokens.includes(token)).length;
  if (surnameMatches && givenMatches) return { confidence: 'strong', score: 86 + Math.min(9, overlap * 3) };
  if (surnameMatches && initialMatches) return { confidence: 'strong', score: 76 + Math.min(8, overlap * 4) };
  if (surnameMatches || overlap >= 2) return { confidence: 'weak', score: 45 + Math.min(20, overlap * 8) };
  return { confidence: 'new', score: Math.min(35, overlap * 12) };
}

export function toPositionQuery(positionSlug) {
  return ({
    'municipal-mayor': 'mayor',
    'municipal-vice-mayor': 'vice mayor',
    'sangguniang-bayan-member': 'councilor',
  })[positionSlug] || null;
}

// Election participation alone never establishes a term. This small helper is
// deliberately shared by the matching UI/service and tested independently.
export const isContestWinner = candidate => candidate?.won === true || candidate?.won === 1;
