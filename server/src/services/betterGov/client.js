import { getCmsPool } from '../cloudSql.js';

const ORIGIN = 'https://officials.bettergov.ph';
const API_ROOT = `${ORIGIN}/api/v1`;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`BetterGov returned an invalid ${label}.`);
  return value;
}

function validateMeta(value) {
  const meta = requireObject(value, 'metadata');
  return {
    api_version: typeof meta.api_version === 'string' ? meta.api_version : null,
    data_vintage: typeof meta.data_vintage === 'string' ? meta.data_vintage : null,
    elections: Array.isArray(meta.elections) ? meta.elections.filter(Number.isInteger) : [],
    source: typeof meta.source === 'string' ? meta.source : null,
    license: typeof meta.license === 'string' ? meta.license : null,
    docs: typeof meta.docs === 'string' && /^https:\/\//.test(meta.docs) ? meta.docs : null,
  };
}

function validateContest(raw) {
  const contest = requireObject(raw, 'contest');
  if (typeof contest.id !== 'string' || !Number.isInteger(contest.year) || typeof contest.position !== 'string' || !Array.isArray(contest.candidates)) throw new Error('BetterGov returned an incomplete contest.');
  return {
    id: contest.id,
    year: contest.year,
    position: contest.position,
    province: typeof contest.province === 'string' ? contest.province : '',
    city: typeof contest.city === 'string' ? contest.city : '',
    seats: Number.isInteger(contest.seats) ? contest.seats : null,
    candidates: contest.candidates.filter(candidate => candidate && typeof candidate === 'object' && typeof candidate.person_id === 'string' && typeof candidate.display_name === 'string').map(candidate => ({
      contest_id: typeof candidate.contest_id === 'string' ? candidate.contest_id : contest.id,
      person_id: candidate.person_id,
      display_name: candidate.display_name,
      party: typeof candidate.party === 'string' ? candidate.party : null,
      votes: Number.isInteger(candidate.votes) && candidate.votes >= 0 ? candidate.votes : null,
      rank: Number.isInteger(candidate.rank) ? candidate.rank : null,
      won: candidate.won === 1 || candidate.won === true,
      match_confidence: typeof candidate.match_confidence === 'string' ? candidate.match_confidence : null,
      vote_link: typeof candidate.vote_link === 'string' ? candidate.vote_link : null,
    })),
  };
}

async function cached(cacheKey, force) {
  if (force) return null;
  const pool = await getCmsPool();
  const [rows] = await pool.execute('SELECT payload, metadata FROM bettergov_cache WHERE cache_key = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1', [cacheKey]);
  if (!rows[0]) return null;
  return { payload: typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload, metadata: typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata) : rows[0].metadata, cached: true };
}

async function persist(cacheKey, payload, metadata) {
  const pool = await getCmsPool();
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS).toISOString();
  await pool.execute(
    'INSERT INTO bettergov_cache (cache_key,payload,metadata,fetched_at,expires_at,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT (cache_key) DO UPDATE SET payload=EXCLUDED.payload,metadata=EXCLUDED.metadata,fetched_at=EXCLUDED.fetched_at,expires_at=EXCLUDED.expires_at,updated_at=CURRENT_TIMESTAMP',
    [cacheKey, JSON.stringify(payload), JSON.stringify(metadata), new Date().toISOString(), expiresAt],
  );
}

async function request(path) {
  const target = new URL(`${API_ROOT}${path}`);
  if (target.origin !== ORIGIN || !target.pathname.startsWith('/api/v1/')) throw new Error('Blocked an unsafe BetterGov request.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(target, { headers: { Accept: 'application/json' }, signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error(`BetterGov request failed (${response.status}).`);
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error('BetterGov response was too large.');
    const body = await response.text();
    if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) throw new Error('BetterGov response was too large.');
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object') throw new Error('BetterGov returned invalid JSON.');
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export async function getGetafeContests({ year, position, force = false }) {
  const electionYear = Number(year);
  if (!Number.isInteger(electionYear) || electionYear < 1900 || electionYear > 2200) throw new Error('A valid election year is required.');
  if (!['mayor', 'vice mayor', 'councilor'].includes(position)) throw new Error('That office is not supported by BetterGov election enrichment.');
  const query = new URLSearchParams({ year: String(electionYear), province: 'bohol', town: 'getafe', position, candidates: '1', limit: '50' });
  const cacheKey = `contests:${query.toString()}`;
  let result = await cached(cacheKey, force);
  if (!result) {
    const envelope = await request(`/contests?${query}`);
    const metadata = validateMeta(envelope.meta);
    const contests = Array.isArray(envelope?.data?.contests) ? envelope.data.contests.map(validateContest) : [];
    // Do not accept a result solely because the API responded: retain only the
    // requested Getafe/Bohol contest context before matching any person.
    const scoped = contests.filter(contest => contest.year === electionYear && contest.province.toLowerCase() === 'bohol' && contest.city.toLowerCase() === 'getafe');
    result = { payload: { contests: scoped }, metadata, cached: false };
    await persist(cacheKey, result.payload, metadata);
  }
  return { ...result, contests: result.payload.contests.map(validateContest) };
}

export { ORIGIN as betterGovOrigin };
