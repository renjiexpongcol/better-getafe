const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MUNICIPAL_ELECTIVE_POSITIONS = new Set([
  'municipal-mayor',
  'municipal-vice-mayor',
  'sangguniang-bayan-member',
]);
const ASSUMPTION_TYPES = new Set(['elected', 'appointed', 'succession', 'acting', 'ex_officio', 'unknown']);

export const asIsoDate = (value) => {
  if (!value) return null;
  const text = value instanceof Date
    ? (Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10))
    : String(value).slice(0, 10);
  if (!ISO_DATE.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) return null;
  return text;
};

export function assertDateRange(start, end, label = 'Date range') {
  const parsedStart = asIsoDate(start);
  const parsedEnd = asIsoDate(end);
  if (start && !parsedStart) throw new Error(`${label} start must be a valid date.`);
  if (end && !parsedEnd) throw new Error(`${label} end must be a valid date.`);
  if (parsedStart && parsedEnd && parsedEnd <= parsedStart) throw new Error(`${label} end must be after its start.`);
  return { start: parsedStart, end: parsedEnd };
}

export function resolveRegularMunicipalTerm({ electionYear, electionType, assumptionType = 'elected', jurisdictionType, positionSlug }) {
  const year = Number(electionYear);
  const regularElection = !electionType || /^(regular|local|national[- ]and[- ]local)$/i.test(String(electionType));
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || assumptionType !== 'elected' || jurisdictionType !== 'municipal' || !MUNICIPAL_ELECTIVE_POSITIONS.has(positionSlug) || !regularElection) return null;
  // Terms are represented as a half-open interval: a term ending 2028-06-30
  // is no longer current on that date.  The same convention is used below.
  return { start: `${year}-06-30`, end: `${year + 3}-06-30`, derived: true };
}

export function resolveTermDates(input) {
  const assumptionType = ASSUMPTION_TYPES.has(input?.assumptionType) ? input.assumptionType : 'unknown';
  const enteredTerm = assertDateRange(input?.termStart, input?.termEnd, 'Term');
  const enteredService = assertDateRange(input?.serviceStart, input?.serviceEnd, 'Service');
  const derived = !enteredTerm.start && !enteredTerm.end
    ? resolveRegularMunicipalTerm({ ...input, assumptionType })
    : null;
  return {
    termStart: enteredTerm.start || derived?.start || null,
    termEnd: enteredTerm.end || derived?.end || null,
    serviceStart: enteredService.start || null,
    serviceEnd: enteredService.end || null,
    termDerived: Boolean(derived),
    assumptionType,
  };
}

export function assignmentStatus(assignment, onDate = new Date()) {
  const today = asIsoDate(onDate instanceof Date ? onDate.toISOString() : onDate) || new Date().toISOString().slice(0, 10);
  const start = asIsoDate(assignment?.service_start ?? assignment?.serviceStart) || asIsoDate(assignment?.term_start ?? assignment?.termStart);
  const end = asIsoDate(assignment?.service_end ?? assignment?.serviceEnd) || asIsoDate(assignment?.term_end ?? assignment?.termEnd);
  if (start && start > today) return 'future';
  if (end && end <= today) return 'previous';
  if (!start) return 'unknown';
  return 'current';
}

export function isCurrentOfficeholder(assignment, onDate = new Date()) {
  return assignmentStatus(assignment, onDate) === 'current';
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  // Null starts/ends are treated as unbounded only for validation.  The CMS
  // still reports missing dates as a data-quality issue instead of assuming a
  // holder is current.
  const fromA = asIsoDate(aStart) || '0001-01-01';
  const toA = asIsoDate(aEnd) || '9999-12-31';
  const fromB = asIsoDate(bStart) || '0001-01-01';
  const toB = asIsoDate(bEnd) || '9999-12-31';
  return fromA < toB && fromB < toA;
}

export const validAssumptionType = (value) => ASSUMPTION_TYPES.has(value);
