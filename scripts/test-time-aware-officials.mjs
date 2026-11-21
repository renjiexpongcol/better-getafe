import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentStatus, isCurrentOfficeholder, overlaps, resolveTermDates } from '../server/src/services/officials/termResolver.js';
import { isContestWinner, nameMatch, normalizeName, toPositionQuery } from '../server/src/services/betterGov/normalization.js';

test('derives only an ordinary municipal elected term', () => {
  assert.deepEqual(resolveTermDates({ electionYear: 2025, electionType: 'regular', assumptionType: 'elected', jurisdictionType: 'municipal', positionSlug: 'municipal-mayor' }), {
    termStart: '2025-06-30', termEnd: '2028-06-30', serviceStart: null, serviceEnd: null, termDerived: true, assumptionType: 'elected',
  });
  assert.equal(resolveTermDates({ electionYear: 2025, assumptionType: 'elected', jurisdictionType: 'barangay', positionSlug: 'punong-barangay' }).termStart, null);
  assert.equal(resolveTermDates({ electionYear: 2025, assumptionType: 'appointed', jurisdictionType: 'municipal', positionSlug: 'municipal-mayor' }).termEnd, null);
});

test('uses half-open service and term ranges for official status', () => {
  assert.equal(assignmentStatus({ term_start: '2025-06-30', term_end: '2028-06-30' }, '2026-01-01'), 'current');
  assert.equal(assignmentStatus({ term_start: '2025-06-30', term_end: '2028-06-30' }, '2028-06-30'), 'previous');
  assert.equal(assignmentStatus({ service_start: '2027-01-01' }, '2026-12-31'), 'future');
  assert.equal(isCurrentOfficeholder({ service_start: '2025-06-30', service_end: '2026-01-01' }, '2026-01-01'), false);
  assert.equal(overlaps('2025-06-30', '2028-06-30', '2028-06-30', '2031-06-30'), false);
});

test('normalizes names and keeps BetterGov enrichment scoped to supported offices', () => {
  assert.equal(normalizeName('Cabañero, Juan M. Jr.').value, 'cabanero juan m');
  assert.equal(nameMatch('Cary M. Camacho', 'Caryboy Monillas Camacho').confidence, 'strong');
  assert.equal(nameMatch('Juan Dela Cruz', 'Maria Santos').confidence, 'new');
  assert.equal(toPositionQuery('municipal-mayor'), 'mayor');
  assert.equal(toPositionQuery('punong-barangay'), null);
  assert.equal(isContestWinner({ won: false }), false);
  assert.equal(isContestWinner({ won: 1 }), true);
});
