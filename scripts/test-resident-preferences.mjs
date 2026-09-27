import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveApiRoutePolicy } from '../server/src/services/apiRoutePolicy.js'
import {
  RESIDENT_PREFERENCE_DEFAULTS,
  normalizePreferences,
  validatePreferencePatch,
} from '../server/src/services/residentPreferences.js'
import {
  normalizeResidentPreferences,
  residentPreferencesPatch,
} from '../src/services/residentPreferences.js'

test('missing resident preferences normalize to the canonical defaults', () => {
  assert.deepEqual(normalizePreferences(), {
    appearance: { ...RESIDENT_PREFERENCE_DEFAULTS.appearance },
    locale: { ...RESIDENT_PREFERENCE_DEFAULTS.locale },
  })
})

test('appearance patches are valid without replacing locale preferences', () => {
  assert.equal(validatePreferencePatch({ appearance: { theme: 'dark', reduceMotion: true } }), null)
  assert.deepEqual(normalizePreferences({
    appearance: { theme: 'dark', reduceMotion: true },
    locale: { language: 'ceb', timeFormat: '24h' },
  }), {
    appearance: { ...RESIDENT_PREFERENCE_DEFAULTS.appearance, theme: 'dark', reduceMotion: true },
    locale: { ...RESIDENT_PREFERENCE_DEFAULTS.locale, language: 'ceb', timeFormat: '24h' },
  })
})

test('unsupported preference fields and values are rejected', () => {
  assert.match(validatePreferencePatch({ appearance: { theme: 'sepia' } }), /invalid/i)
  assert.match(validatePreferencePatch({ appearance: { role: 'admin' } }), /unsupported/i)
  assert.match(validatePreferencePatch({ appearance: { reduceMotion: 'yes' } }), /boolean/i)
  assert.match(validatePreferencePatch({ appearance: null }), /json object/i)
})

test('the client sends only changed preference sections', () => {
  const saved = normalizeResidentPreferences({ appearance: { theme: 'dark' }, locale: { language: 'en' } })
  const draft = normalizeResidentPreferences({ ...saved, locale: { ...saved.locale, language: 'ceb' } })
  assert.deepEqual(residentPreferencesPatch(saved, draft), { locale: { language: 'ceb' } })
  assert.deepEqual(residentPreferencesPatch(saved, { ...saved, appearance: { ...saved.appearance, contrast: 'high' } }), { appearance: { contrast: 'high' } })
})

test('the canonical preference endpoints are explicitly allowlisted', () => {
  const get = resolveApiRoutePolicy('GET', '/api/users/me/preferences')
  const patch = resolveApiRoutePolicy('PATCH', '/api/users/me/preferences')
  assert.equal(get?.id, 'resident.preferences')
  assert.equal(get?.access, 'RESIDENT')
  assert.equal(get?.methodAllowed, true)
  assert.equal(patch?.methodAllowed, true)
  assert.equal(resolveApiRoutePolicy('GET', '/api/users/me/appearance'), null)
})
