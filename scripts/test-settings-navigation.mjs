import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  DEFAULT_SETTINGS_CATEGORY,
  getSettingsCategory,
  normalizeSettingsCategory,
  SETTINGS_CATEGORIES,
} from '../src/pages/app/settingsNavigation.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const settingsSource = readFileSync(join(root, 'src/pages/app/Settings.jsx'), 'utf8')
const layoutSource = readFileSync(join(root, 'src/components/CitizenLayout.jsx'), 'utf8')

test('resident settings categories use stable, locale-independent IDs', () => {
  assert.deepEqual(SETTINGS_CATEGORIES.map(category => category.id), [
    'account', 'security', 'notifications', 'privacy', 'appearance', 'language',
  ])
  assert.equal(DEFAULT_SETTINGS_CATEGORY, 'account')
  assert.equal(normalizeSettingsCategory('language'), 'language')
  assert.equal(normalizeSettingsCategory('Language & Region'), DEFAULT_SETTINGS_CATEGORY)
  assert.equal(getSettingsCategory('appearance').headingKey, 'appearanceSettings')
})

test('settings navigation is state-only and cannot submit a surrounding form', () => {
  assert.match(settingsSource, /activeCategory = DEFAULT_SETTINGS_CATEGORY/)
  assert.match(settingsSource, /<button\s+type="button"[\s\S]*onClick=\{\(\) => chooseCategory\(id\)\}/)
  assert.match(settingsSource, /await saveEditing\(\); setSaveMessage/)
  assert.doesNotMatch(settingsSource, /await saveEditing\(\); onClose\(\)/)
  assert.doesNotMatch(settingsSource, /window\.location\.(?:href|assign|replace|reload)/)
  assert.doesNotMatch(settingsSource, /<SettingsModal\s+key=\{(?:activeTab|category|activeCategory)/)
})

test('resident Settings trigger opens the overlay without a route link', () => {
  assert.match(layoutSource, /onClick=\{\(\) => openSettings\(DEFAULT_SETTINGS_CATEGORY\)\}/)
  assert.match(layoutSource, /activeCategory=\{accountCategory\}/)
  assert.match(layoutSource, /openSettingsModal/)
  assert.doesNotMatch(layoutSource, /to=\{ROUTES\.app\.settings\}/)
})
