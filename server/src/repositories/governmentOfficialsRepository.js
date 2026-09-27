import { getCmsPool } from '../services/cloudSql.js';
import { id } from '../services/identifiers.js';
import { asIsoDate, assignmentStatus, isCurrentOfficeholder, overlaps, resolveTermDates, validAssumptionType } from '../services/officials/termResolver.js';
import { isContestWinner, nameMatch, toPositionQuery } from '../services/betterGov/normalization.js';
import { getGetafeContests } from '../services/betterGov/client.js';

const GROUPS = ['mayor', 'viceMayor', 'abcPresident', 'sbMembers', 'punongBarangays', 'deptHeads'];
const structuredTables = "to_regclass('public.government_office_assignments') IS NOT NULL";
const asJson = (value, fallback = null) => {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};
const iso = value => asIsoDate(value);
// Keep the pre-existing public URL rule exactly: accented characters become a
// separator. Name matching uses a different, accent-insensitive normalizer.
const slugify = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function fallbackPosition(group, person) {
  if (group === 'mayor') return { slug: 'municipal-mayor', name: 'Municipal Mayor', jurisdictionType: 'municipal', cardinality: 'single' };
  if (group === 'viceMayor') return { slug: 'municipal-vice-mayor', name: 'Municipal Vice Mayor', jurisdictionType: 'municipal', cardinality: 'single' };
  if (group === 'sbMembers') return { slug: 'sangguniang-bayan-member', name: 'Sangguniang Bayan Member', jurisdictionType: 'municipal', cardinality: 'multiple' };
  if (group === 'abcPresident') return { slug: 'abc-president', name: 'ABC President', jurisdictionType: 'municipal', cardinality: 'single' };
  if (group === 'punongBarangays') return { slug: 'punong-barangay', name: 'Punong Barangay', jurisdictionType: 'barangay', jurisdictionId: slugify(person?.role), cardinality: 'single' };
  const role = String(person?.role || 'Municipal Official').trim();
  return { slug: `municipal-${slugify(role) || 'official'}`, name: role, jurisdictionType: 'municipal', cardinality: 'single' };
}

function legacyEntries(content = {}) {
  return GROUPS.flatMap(group => {
    const values = Array.isArray(content[group]) ? content[group] : content[group] ? [content[group]] : [];
    return values.filter(person => person && typeof person === 'object' && String(person.name || '').trim()).map((person, ordinal) => ({
      group,
      ordinal,
      person,
      legacyKey: person.assignment_id ? `assignment:${person.assignment_id}` : `legacy:${group}:${ordinal}`,
      stableLegacyKey: `legacy:${group}:${ordinal}`,
      fallbackPosition: fallbackPosition(group, person),
    }));
  });
}

async function tablesAvailable() {
  const pool = await getCmsPool();
  const [rows] = await pool.execute(`SELECT ${structuredTables} AS available`);
  return rows[0]?.available === true;
}

function rowTerm(row) {
  const term = { start: iso(row.term_start), end: iso(row.term_end), status: assignmentStatus(row), assumption_type: row.assumption_type || 'unknown' };
  if (row.service_start || row.service_end) term.service = { start: iso(row.service_start), end: iso(row.service_end) };
  return term;
}

function publicElection(row) {
  // Election data is public only after a local administrator has verified the
  // link and BetterGov identifies this candidate as the winner.
  if (row.verification_status !== 'verified' || row.election_result !== 'winner' || !row.source_person_id || !row.source_contest_id) return null;
  const election = { year: row.election_year, external_person_id: row.source_person_id, external_contest_id: row.source_contest_id, result: 'winner' };
  if (row.election_type) election.type = row.election_type;
  if (row.election_party) election.party = row.election_party;
  if (Number.isInteger(row.election_votes)) election.votes = row.election_votes;
  if (row.election_vote_link) election.vote_link = row.election_vote_link;
  return election;
}

function publicSource(row) {
  if (!row.source_provider && !row.source_type) return null;
  const source = { provider: row.source_provider || (row.source_type === 'cms' ? 'Municipality of Getafe CMS' : null) };
  if (row.source_data_vintage) source.data_vintage = row.source_data_vintage;
  if (row.source_last_synced_at) source.last_synced_at = row.source_last_synced_at;
  if (row.source_api_version) source.api_version = row.source_api_version;
  return source;
}

function assignmentToOfficial(row) {
  return {
    id: row.assignment_id,
    person_id: row.person_id,
    slug: row.profile_slug,
    name: row.display_name,
    biography: row.biography || '',
    photo: row.photo || '',
    role: row.position_name,
    position: { id: row.position_id, name: row.position_name, slug: row.position_slug, cardinality: row.cardinality },
    jurisdiction: { type: row.jurisdiction_type, id: row.jurisdiction_id || null },
    term: rowTerm(row),
    election: publicElection(row),
    source: publicSource(row),
    verification: { status: row.verification_status, manually_verified: Boolean(row.is_manually_verified) },
    legacy_source_key: row.legacy_source_key,
  };
}

function fallbackOfficial(entry) {
  return {
    id: entry.person.assignment_id || entry.stableLegacyKey,
    slug: entry.person.official_slug || slugify(entry.person.name), name: entry.person.name, biography: entry.person.biography || '', photo: entry.person.photo || '', role: entry.person.role || entry.fallbackPosition.name,
    position: { name: entry.fallbackPosition.name, slug: entry.fallbackPosition.slug, cardinality: entry.fallbackPosition.cardinality },
    jurisdiction: { type: entry.fallbackPosition.jurisdictionType, id: entry.fallbackPosition.jurisdictionId || null },
    term: { start: null, end: null, status: 'unknown', assumption_type: 'unknown' }, election: null, source: { provider: 'Municipality of Getafe CMS' }, verification: { status: 'verified', manually_verified: true }, legacy_source_key: entry.stableLegacyKey,
  };
}

async function assignmentRows(where = '', params = []) {
  const pool = await getCmsPool();
  const [rows] = await pool.execute(`
    SELECT a.id AS assignment_id, a.*, p.id AS person_id, p.display_name, p.profile_slug, p.biography, p.photo,
      positions.id AS position_id, positions.name AS position_name, positions.slug AS position_slug, positions.cardinality
    FROM government_office_assignments a
    JOIN government_people p ON p.id = a.person_id
    JOIN government_positions positions ON positions.id = a.position_id
    ${where}
    ORDER BY COALESCE(a.service_start, a.term_start) DESC NULLS LAST, a.created_at DESC`, params);
  return rows;
}

export async function getOfficialDirectory(legacyContent, { status = 'all', barangayId = null } = {}) {
  const entries = legacyEntries(legacyContent);
  if (!await tablesAvailable()) {
    const items = entries.map(fallbackOfficial);
    return { items: filterItems(items, status, barangayId), available: false, meta: { election_data: null } };
  }
  const rows = await assignmentRows();
  const structured = rows.map(assignmentToOfficial);
  const knownLegacyKeys = new Set(structured.map(item => item.legacy_source_key).filter(Boolean));
  // A partial/failed historic import must never hide the existing CMS roster.
  // It stays visible as CMS-only data until an administrator completes it.
  const items = [...structured, ...entries.filter(entry => !knownLegacyKeys.has(entry.stableLegacyKey)).map(fallbackOfficial)];
  const provider = rows.find(row => row.source_provider === 'BetterGov');
  return {
    items: filterItems(items, status, barangayId),
    available: true,
    meta: { election_data: provider ? { provider: 'BetterGov / Open Halalan', data_vintage: provider.source_data_vintage || null, last_synced_at: provider.source_last_synced_at || null } : null },
  };
}

function filterItems(items, status, barangayId) {
  return items.filter(item => {
    if (barangayId && !(item.jurisdiction.type === 'barangay' && item.jurisdiction.id === barangayId)) return false;
    return status === 'all' || item.term.status === status;
  });
}

export async function decorateLegacyOfficials(legacyContent) {
  const directory = await getOfficialDirectory(legacyContent);
  if (!directory.available) return { ...legacyContent, directory };
  const byLegacyKey = new Map(directory.items.filter(item => item.legacy_source_key).map(item => [item.legacy_source_key, item]));
  const content = { ...legacyContent };
  for (const entry of legacyEntries(legacyContent)) {
    const record = byLegacyKey.get(entry.stableLegacyKey);
    if (!record) continue;
    const value = {
      ...entry.person,
      assignment_id: record.id,
      person_id: record.person_id,
      official_slug: record.slug,
      position_slug: record.position?.slug,
      jurisdiction_id: record.jurisdiction?.id || null,
      role: entry.person.role || record.role,
      termStart: record.term.start,
      termEnd: record.term.end,
      serviceStart: record.term.service?.start || null,
      serviceEnd: record.term.service?.end || null,
      termStatus: record.term.status,
      assumptionType: record.term.assumption_type,
      electionYear: record.election?.year || null,
      verificationStatus: record.verification.status,
      election: record.election,
      source: record.source,
    };
    if (Array.isArray(content[entry.group])) content[entry.group] = content[entry.group].map((person, index) => index === entry.ordinal ? value : person);
    else content[entry.group] = value;
  }
  return { ...content, directory };
}

async function findAssignment(pool, entry) {
  if (entry.person.assignment_id) {
    const [rows] = await pool.execute('SELECT * FROM government_office_assignments WHERE id = ? LIMIT 1', [entry.person.assignment_id]);
    if (rows[0]) return rows[0];
  }
  const [rows] = await pool.execute('SELECT * FROM government_office_assignments WHERE legacy_source_key = ? LIMIT 1', [entry.stableLegacyKey]);
  return rows[0] || null;
}

async function ensurePosition(pool, fallback) {
  const [existing] = await pool.execute('SELECT * FROM government_positions WHERE slug = ? LIMIT 1', [fallback.slug]);
  if (existing[0]) return existing[0];
  const position = { id: id(), name: fallback.name, slug: fallback.slug, jurisdictionType: fallback.jurisdictionType, cardinality: fallback.cardinality || 'single' };
  await pool.execute('INSERT INTO government_positions (id,name,slug,jurisdiction_type,cardinality,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [position.id, position.name, position.slug, position.jurisdictionType, position.cardinality, new Date().toISOString(), new Date().toISOString()]);
  return { id: position.id, name: position.name, slug: position.slug, jurisdiction_type: position.jurisdictionType, cardinality: position.cardinality };
}

function inputHasTermDetails(person) {
  return ['termStart', 'termEnd', 'serviceStart', 'serviceEnd', 'electionYear', 'electionType', 'assumptionType', 'notes'].some(key => Object.hasOwn(person, key));
}

async function assertNoExclusiveOverlap(pool, assignment, position, dates) {
  if (position.cardinality !== 'single' || !dates.serviceStart && !dates.termStart) return;
  const start = dates.serviceStart || dates.termStart;
  const end = dates.serviceEnd || dates.termEnd;
  const [rows] = await pool.execute(
    'SELECT id, service_start, service_end, term_start, term_end FROM government_office_assignments WHERE position_id=? AND jurisdiction_type=? AND COALESCE(jurisdiction_id, \'\')=COALESCE(?, \'\') AND id<>?',
    [position.id, assignment?.jurisdiction_type || position.jurisdiction_type, assignment?.jurisdiction_id || null, assignment?.id || ''],
  );
  const conflict = rows.find(row => {
    const otherStart = iso(row.service_start) || iso(row.term_start);
    const otherEnd = iso(row.service_end) || iso(row.term_end);
    return otherStart && overlaps(start, end, otherStart, otherEnd);
  });
  if (conflict) throw new Error('This office already has an overlapping holder. Review the term or service dates before saving.');
}

export async function syncLegacyOfficials(legacyContent, actorId = null) {
  if (!await tablesAvailable()) return legacyContent;
  const pool = await getCmsPool();
  for (const entry of legacyEntries(legacyContent)) {
    const existing = await findAssignment(pool, entry);
    const position = await ensurePosition(pool, entry.fallbackPosition);
    const hasTerms = inputHasTermDetails(entry.person);
    const previous = existing || {};
    const assumptionType = entry.person.assumptionType || previous.assumption_type || 'unknown';
    if (!validAssumptionType(assumptionType)) throw new Error('Choose a valid way the official assumed office.');
    const dates = hasTerms ? resolveTermDates({
      termStart: entry.person.termStart, termEnd: entry.person.termEnd, serviceStart: entry.person.serviceStart, serviceEnd: entry.person.serviceEnd,
      electionYear: entry.person.electionYear, electionType: entry.person.electionType, assumptionType,
      jurisdictionType: entry.fallbackPosition.jurisdictionType, positionSlug: position.slug,
    }) : {
      termStart: iso(previous.term_start), termEnd: iso(previous.term_end), serviceStart: iso(previous.service_start), serviceEnd: iso(previous.service_end), assumptionType: previous.assumption_type || assumptionType,
    };
    const manualTermChange = hasTerms && (
      dates.termStart !== iso(previous.term_start) || dates.termEnd !== iso(previous.term_end)
      || dates.serviceStart !== iso(previous.service_start) || dates.serviceEnd !== iso(previous.service_end)
      || dates.assumptionType !== (previous.assumption_type || 'unknown')
      || (entry.person.electionYear ? Number(entry.person.electionYear) : null) !== (previous.election_year || null)
    );
    await assertNoExclusiveOverlap(pool, previous, position, dates);
    const personId = previous.person_id || id();
    const personName = String(entry.person.name).trim();
    if (previous.person_id) {
      await pool.execute('UPDATE government_people SET display_name=?,normalized_name=?,biography=?,photo=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [personName, personName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), entry.person.biography || null, entry.person.photo || null, personId]);
    } else {
      await pool.execute('INSERT INTO government_people (id,display_name,normalized_name,profile_slug,biography,photo,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', [personId, personName, personName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), slugify(personName) || id(), entry.person.biography || null, entry.person.photo || null, new Date().toISOString(), new Date().toISOString()]);
    }
    const assignmentId = previous.id || id();
    const jurisdictionType = entry.fallbackPosition.jurisdictionType;
    const jurisdictionId = entry.fallbackPosition.jurisdictionId || null;
    const electionYear = hasTerms && entry.person.electionYear ? Number(entry.person.electionYear) : previous.election_year || null;
    if (electionYear && (!Number.isInteger(electionYear) || electionYear < 1900 || electionYear > 2200)) throw new Error('Election year must be a valid four-digit year.');
    const parameters = [
      assignmentId, personId, position.id, jurisdictionType, jurisdictionId, dates.termStart, dates.termEnd, dates.serviceStart, dates.serviceEnd,
      electionYear, hasTerms ? (entry.person.electionType || null) : previous.election_type || null, dates.assumptionType,
      previous.source_type || 'cms', previous.source_reference || entry.stableLegacyKey, previous.source_provider || null, previous.source_person_id || null, previous.source_contest_id || null,
      previous.external_match_confidence || null, previous.local_match_confidence || null, previous.verification_status || 'verified', manualTermChange ? true : Boolean(previous.is_manually_verified),
      previous.election_result || null, previous.election_party || null, previous.election_votes ?? null, previous.election_vote_link || null,
      previous.source_data_vintage || null, previous.source_api_version || null, previous.source_last_synced_at || null,
      manualTermChange && actorId ? new Date().toISOString() : previous.source_verified_at || null, manualTermChange && actorId ? actorId : previous.source_verified_by || null,
      hasTerms ? (entry.person.notes || null) : previous.notes || null, entry.stableLegacyKey,
    ];
    await pool.execute(`INSERT INTO government_office_assignments (
      id,person_id,position_id,jurisdiction_type,jurisdiction_id,term_start,term_end,service_start,service_end,election_year,election_type,assumption_type,
      source_type,source_reference,source_provider,source_person_id,source_contest_id,external_match_confidence,local_match_confidence,verification_status,is_manually_verified,
      election_result,election_party,election_votes,election_vote_link,source_data_vintage,source_api_version,source_last_synced_at,source_verified_at,source_verified_by,notes,legacy_source_key,created_at,updated_at
    ) VALUES (
      ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
      ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
      CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    )
    ON CONFLICT (id) DO UPDATE SET person_id=EXCLUDED.person_id,position_id=EXCLUDED.position_id,jurisdiction_type=EXCLUDED.jurisdiction_type,jurisdiction_id=EXCLUDED.jurisdiction_id,
      term_start=EXCLUDED.term_start,term_end=EXCLUDED.term_end,service_start=EXCLUDED.service_start,service_end=EXCLUDED.service_end,election_year=EXCLUDED.election_year,
      election_type=EXCLUDED.election_type,assumption_type=EXCLUDED.assumption_type,is_manually_verified=EXCLUDED.is_manually_verified,notes=EXCLUDED.notes,updated_at=CURRENT_TIMESTAMP`, parameters);
  }
  return legacyContent;
}

export async function syncBarangayTerms(records, actorId = null) {
  if (!await tablesAvailable()) return;
  const pool = await getCmsPool();
  const [positions] = await pool.execute('SELECT * FROM government_positions WHERE slug=? LIMIT 1', ['punong-barangay']);
  const position = positions[0];
  if (!position) return;
  for (const barangay of records || []) {
    if (!barangay?.captain || (!Object.hasOwn(barangay, 'termStart') && !Object.hasOwn(barangay, 'termEnd'))) continue;
    const dates = resolveTermDates({ termStart: barangay.termStart, termEnd: barangay.termEnd, jurisdictionType: 'barangay', positionSlug: position.slug, assumptionType: 'unknown' });
    const jurisdictionId = slugify(barangay.id || barangay.name);
    const [found] = await pool.execute(`SELECT a.* FROM government_office_assignments a JOIN government_people p ON p.id=a.person_id WHERE a.position_id=? AND a.jurisdiction_type='barangay' AND a.jurisdiction_id=? AND lower(p.display_name)=lower(?) ORDER BY a.created_at DESC LIMIT 1`, [position.id, jurisdictionId, barangay.captain]);
    const existing = found[0];
    await assertNoExclusiveOverlap(pool, existing, position, dates);
    if (existing) {
      await pool.execute('UPDATE government_office_assignments SET term_start=?,term_end=?,is_manually_verified=TRUE,source_verified_at=?,source_verified_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [dates.termStart, dates.termEnd, new Date().toISOString(), actorId, existing.id]);
    }
  }
}

async function fullAssignment(idValue) {
  const directRows = await assignmentRows('WHERE a.id = ?', [idValue]);
  if (directRows[0]) return directRows[0];
  // Keep older CMS documents working after the normalized officials tables
  // were introduced. Their stable legacy key is not itself a writable
  // assignment ID, so resolve it before any election operation proceeds.
  if (typeof idValue === 'string' && /^legacy:[a-zA-Z][a-zA-Z0-9]*:[0-9]{1,6}$/.test(idValue)) {
    const legacyRows = await assignmentRows('WHERE a.legacy_source_key = ?', [idValue]);
    return legacyRows[0] || null;
  }
  return null;
}

export async function getOfficeholder(idValue) {
  if (!await tablesAvailable()) return null;
  const row = await fullAssignment(idValue);
  return row ? assignmentToOfficial(row) : null;
}

export async function findElectionMatches(assignmentId, { year, force = false } = {}) {
  if (!await tablesAvailable()) throw new Error('Officials migration has not been applied.');
  const assignment = await fullAssignment(assignmentId);
  if (!assignment) throw new Error('Official assignment not found.');
  if (assignment.jurisdiction_type !== 'municipal') throw new Error('BetterGov election enrichment is not used for barangay officials.');
  const position = toPositionQuery(assignment.position_slug);
  if (!position) throw new Error('This municipal office is not supported by BetterGov election enrichment.');
  const electionYear = Number(year || assignment.election_year);
  const result = await getGetafeContests({ year: electionYear, position, force });
  const matches = result.contests.flatMap(contest => contest.candidates.map(candidate => {
    const match = nameMatch(assignment.display_name, candidate.display_name);
    return {
      ...candidate, contest: { id: contest.id, year: contest.year, position: contest.position, province: contest.province, city: contest.city },
      local_match_confidence: match.confidence, local_match_score: match.score,
    };
  })).sort((a, b) => b.local_match_score - a.local_match_score || Number(b.won) - Number(a.won));
  return { assignment: assignmentToOfficial(assignment), matches, meta: result.metadata, cached: result.cached };
}

async function review(pool, assignmentId, observed) {
  await pool.execute('INSERT INTO official_external_sync_reviews (id,assignment_id,status,observed_data,created_at) VALUES (?,?,\'pending\',?,CURRENT_TIMESTAMP)', [id(), assignmentId, JSON.stringify(observed)]);
}

export async function connectElectionRecord(assignmentId, { personId, contestId, year }, actorId) {
  const candidates = await findElectionMatches(assignmentId, { year, force: true });
  const candidate = candidates.matches.find(item => item.person_id === personId && item.contest.id === contestId);
  if (!candidate) throw new Error('The selected BetterGov record no longer matches the requested Getafe contest.');
  if (!isContestWinner(candidate)) throw new Error('Only a contest winner can be linked as an elected officeholder. A candidacy is not proof of officeholding.');
  const assignment = await fullAssignment(assignmentId);
  if (!assignment) throw new Error('Official assignment not found.');
  const canonicalAssignmentId = assignment.assignment_id;
  const pool = await getCmsPool();
  if (assignment.source_person_id && assignment.source_person_id !== candidate.person_id && assignment.verification_status === 'verified') {
    await review(pool, canonicalAssignmentId, candidate);
    const error = new Error('A different BetterGov person was found. The existing verified record was left unchanged for review.');
    error.status = 409;
    throw error;
  }
  const dates = resolveTermDates({ termStart: iso(assignment.term_start), termEnd: iso(assignment.term_end), serviceStart: iso(assignment.service_start), serviceEnd: iso(assignment.service_end), electionYear: candidate.contest.year, electionType: assignment.election_type || 'regular', assumptionType: assignment.assumption_type === 'unknown' ? 'elected' : assignment.assumption_type, jurisdictionType: assignment.jurisdiction_type, positionSlug: assignment.position_slug });
  await pool.execute(`UPDATE government_office_assignments SET term_start=COALESCE(term_start,?),term_end=COALESCE(term_end,?),election_year=?,election_type=COALESCE(election_type,'regular'),assumption_type=?,source_type='mixed',source_provider='BetterGov',source_person_id=?,source_contest_id=?,external_match_confidence=?,local_match_confidence=?,verification_status='verified',election_result='winner',election_party=?,election_votes=?,election_vote_link=?,source_data_vintage=?,source_api_version=?,source_last_synced_at=CURRENT_TIMESTAMP,source_verified_at=CURRENT_TIMESTAMP,source_verified_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    dates.termStart, dates.termEnd, candidate.contest.year, dates.assumptionType, candidate.person_id, candidate.contest.id, candidate.match_confidence, candidate.local_match_confidence,
    candidate.party, candidate.votes, candidate.vote_link, candidates.meta.data_vintage, candidates.meta.api_version, actorId, canonicalAssignmentId,
  ]);
  return getOfficeholder(assignmentId);
}

export async function disconnectElectionRecord(assignmentId) {
  if (!await tablesAvailable()) throw new Error('Officials migration has not been applied.');
  const assignment = await fullAssignment(assignmentId);
  if (!assignment) throw new Error('Official assignment not found.');
  const pool = await getCmsPool();
  await pool.execute(`UPDATE government_office_assignments SET source_provider=NULL,source_person_id=NULL,source_contest_id=NULL,external_match_confidence=NULL,local_match_confidence=NULL,verification_status='unlinked',election_result=NULL,election_party=NULL,election_votes=NULL,election_vote_link=NULL,source_data_vintage=NULL,source_api_version=NULL,source_last_synced_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [assignment.assignment_id]);
  return getOfficeholder(assignment.assignment_id);
}

export async function rejectElectionRecord(assignmentId, { personId, contestId, year }, actorId) {
  const candidates = await findElectionMatches(assignmentId, { year, force: true });
  const candidate = candidates.matches.find(item => item.person_id === personId && item.contest.id === contestId);
  if (!candidate) throw new Error('The selected BetterGov record no longer matches the requested Getafe contest.');
  const assignment = await fullAssignment(assignmentId);
  if (!assignment) throw new Error('Official assignment not found.');
  const pool = await getCmsPool();
  await pool.execute(`UPDATE government_office_assignments SET source_type='mixed',source_provider='BetterGov',source_person_id=?,source_contest_id=?,external_match_confidence=?,local_match_confidence=?,verification_status='rejected',election_result=NULL,election_party=NULL,election_votes=NULL,election_vote_link=NULL,source_data_vintage=?,source_api_version=?,source_last_synced_at=CURRENT_TIMESTAMP,source_verified_at=CURRENT_TIMESTAMP,source_verified_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    candidate.person_id, candidate.contest.id, candidate.match_confidence, candidate.local_match_confidence, candidates.meta.data_vintage, candidates.meta.api_version, actorId, assignment.assignment_id,
  ]);
  return getOfficeholder(assignment.assignment_id);
}

export async function refreshElectionRecord(assignmentId) {
  const assignment = await fullAssignment(assignmentId);
  if (!assignment?.source_person_id || !assignment?.source_contest_id || !assignment?.election_year) throw new Error('No BetterGov record is connected to this official.');
  const candidates = await findElectionMatches(assignmentId, { year: assignment.election_year, force: true });
  const candidate = candidates.matches.find(item => item.person_id === assignment.source_person_id && item.contest.id === assignment.source_contest_id);
  const pool = await getCmsPool();
  if (!candidate || !isContestWinner(candidate)) {
    await review(pool, assignment.assignment_id, { reason: 'linked-winner-not-present', person_id: assignment.source_person_id, contest_id: assignment.source_contest_id, retrieved_at: new Date().toISOString() });
    return { review_required: true, official: await getOfficeholder(assignment.assignment_id) };
  }
  await pool.execute('UPDATE government_office_assignments SET external_match_confidence=?,election_party=?,election_votes=?,election_vote_link=?,source_data_vintage=?,source_api_version=?,source_last_synced_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?', [candidate.match_confidence, candidate.party, candidate.votes, candidate.vote_link, candidates.meta.data_vintage, candidates.meta.api_version, assignment.assignment_id]);
  return { review_required: false, official: await getOfficeholder(assignment.assignment_id) };
}

export async function officialsDataQuality() {
  if (!await tablesAvailable()) return { available: false, municipal_officials: 0, current: 0, missing_term_dates: 0, bettergov_connected: 0, unverified_matches: 0, historical_records: 0, review_required: 0 };
  const rows = await assignmentRows();
  const pool = await getCmsPool();
  const [reviews] = await pool.execute("SELECT COUNT(*)::INTEGER AS count FROM official_external_sync_reviews WHERE status='pending'");
  const municipal = rows.filter(row => row.jurisdiction_type === 'municipal');
  return {
    available: true,
    municipal_officials: municipal.length,
    current: municipal.filter(isCurrentOfficeholder).length,
    missing_term_dates: municipal.filter(row => !row.term_start && !row.service_start).length,
    bettergov_connected: rows.filter(row => row.source_provider === 'BetterGov' && row.source_person_id).length,
    unverified_matches: rows.filter(row => row.source_provider === 'BetterGov' && row.verification_status === 'suggested').length,
    historical_records: rows.filter(row => assignmentStatus(row) === 'previous').length,
    review_required: Number(reviews[0]?.count || 0),
  };
}

export async function getCurrentOfficeholder(positionSlug, jurisdictionType = 'municipal', jurisdictionId = null, date = new Date()) {
  if (!await tablesAvailable()) return [];
  const rows = await assignmentRows('WHERE positions.slug=? AND a.jurisdiction_type=? AND COALESCE(a.jurisdiction_id, \'\')=COALESCE(?, \'\')', [positionSlug, jurisdictionType, jurisdictionId]);
  return rows.filter(row => isCurrentOfficeholder(row, date)).map(assignmentToOfficial);
}

export async function createHistoricalOfficeAssignment(input, actorId) {
  if (!await tablesAvailable()) throw new Error('Officials migration has not been applied.');
  const personId = typeof input?.personId === 'string' ? input.personId : '';
  const positionSlug = typeof input?.positionSlug === 'string' ? input.positionSlug : '';
  const jurisdictionType = input?.jurisdictionType === 'barangay' ? 'barangay' : 'municipal';
  const jurisdictionId = jurisdictionType === 'barangay' ? slugify(input?.jurisdictionId) : null;
  const assumptionType = validAssumptionType(input?.assumptionType) ? input.assumptionType : 'unknown';
  const pool = await getCmsPool();
  const [people] = await pool.execute('SELECT id FROM government_people WHERE id=? LIMIT 1', [personId]);
  const [positions] = await pool.execute('SELECT * FROM government_positions WHERE slug=? LIMIT 1', [positionSlug]);
  if (!people[0] || !positions[0] || positions[0].jurisdiction_type !== jurisdictionType) throw new Error('Choose a valid existing person and office.');
  const dates = resolveTermDates({ termStart: input.termStart, termEnd: input.termEnd, serviceStart: input.serviceStart, serviceEnd: input.serviceEnd, assumptionType, jurisdictionType, positionSlug });
  if (!dates.termStart && !dates.serviceStart) throw new Error('A historical assignment needs a term or service start date.');
  if (assignmentStatus({ term_start: dates.termStart, term_end: dates.termEnd, service_start: dates.serviceStart, service_end: dates.serviceEnd }) !== 'previous') throw new Error('Use this action only for a completed historical assignment.');
  const candidate = { id: id(), jurisdiction_type: jurisdictionType, jurisdiction_id: jurisdictionId };
  await assertNoExclusiveOverlap(pool, candidate, positions[0], dates);
  await pool.execute(`INSERT INTO government_office_assignments (id,person_id,position_id,jurisdiction_type,jurisdiction_id,term_start,term_end,service_start,service_end,election_year,election_type,assumption_type,source_type,source_reference,verification_status,is_manually_verified,source_verified_at,source_verified_by,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [
    candidate.id, personId, positions[0].id, jurisdictionType, jurisdictionId, dates.termStart, dates.termEnd, dates.serviceStart, dates.serviceEnd,
    Number.isInteger(Number(input.electionYear)) ? Number(input.electionYear) : null, input.electionType || null, assumptionType,
    'cms', 'cms:historical', 'verified', true, new Date().toISOString(), actorId || null, input.notes || null,
  ]);
  return getOfficeholder(candidate.id);
}
