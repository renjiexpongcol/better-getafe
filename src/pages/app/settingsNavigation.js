export const DEFAULT_SETTINGS_CATEGORY = 'account'

export const SETTINGS_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'account', labelKey: 'account', descriptionKey: 'accountDescription', headingKey: 'accountSettings', introKey: 'manageAccount', fallback: 'Account' }),
  Object.freeze({ id: 'security', labelKey: 'security', descriptionKey: 'securityDescription', headingKey: 'securitySettings', introKey: 'manageSecurity', fallback: 'Security' }),
  Object.freeze({ id: 'notifications', labelKey: 'notifications', descriptionKey: 'notificationsDescription', headingKey: 'notificationSettings', introKey: 'notificationsIntro', fallback: 'Notifications' }),
  Object.freeze({ id: 'privacy', labelKey: 'privacy', descriptionKey: 'privacyDescription', headingKey: 'privacySettings', introKey: 'managePrivacy', fallback: 'Privacy & Data' }),
  Object.freeze({ id: 'appearance', labelKey: 'appearance', descriptionKey: 'appearanceDescription', headingKey: 'appearanceSettings', introKey: 'appearanceIntro', fallback: 'Appearance' }),
  Object.freeze({ id: 'language', labelKey: 'languageRegion', descriptionKey: 'languageRegionDescription', headingKey: 'languageRegionSettings', introKey: 'languageIntro', fallback: 'Language & Region' }),
])

const categoryIds = new Set(SETTINGS_CATEGORIES.map(category => category.id))

export function normalizeSettingsCategory(value) {
  return categoryIds.has(value) ? value : DEFAULT_SETTINGS_CATEGORY
}

export function getSettingsCategory(value) {
  return SETTINGS_CATEGORIES.find(category => category.id === normalizeSettingsCategory(value))
}
