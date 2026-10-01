import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { residentPreferencesApi, residentPreferencesError } from '../services/citizenData'
import { translate } from '../i18n/translations'
import {
  RESIDENT_PREFERENCE_DEFAULTS,
  normalizeResidentPreferences,
  residentPreferencesPatch,
  setActiveResidentPreferences,
} from '../services/residentPreferences'

const ResidentPreferencesContext = createContext(null)
const cacheKey = userId => `getafe-resident-preferences:${userId}`
const copyPreferences = value => normalizeResidentPreferences(JSON.parse(JSON.stringify(value)))
const mergePreferences = (base, patch) => normalizeResidentPreferences({
  ...base,
  ...patch,
  appearance: { ...base.appearance, ...patch?.appearance },
  locale: { ...base.locale, ...patch?.locale },
})

function readCache(userId) {
  try {
    const cached = JSON.parse(window.localStorage.getItem(cacheKey(userId)) || 'null')
    return cached?.preferences ? normalizeResidentPreferences(cached.preferences) : null
  } catch {
    return null
  }
}

function writeCache(userId, preferences) {
  try { window.localStorage.setItem(cacheKey(userId), JSON.stringify({ preferences, cachedAt: Date.now() })) } catch {}
}

function applyResidentDom(preferences, inResidentApp, baseline) {
  const root = document.documentElement
  if (!inResidentApp) {
    setActiveResidentPreferences(RESIDENT_PREFERENCE_DEFAULTS)
    if (baseline) {
      const restoreAttribute = (name, value) => value == null ? root.removeAttribute(name) : root.setAttribute(name, value)
      restoreAttribute('data-resident-theme', baseline.theme)
      restoreAttribute('data-resident-theme-choice', baseline.themeChoice)
      restoreAttribute('data-resident-contrast', baseline.contrast)
      restoreAttribute('data-resident-reduce-motion', baseline.reduceMotion)
      if (baseline.textScale == null) root.style.removeProperty('--accessibility-text-scale')
      else root.style.setProperty('--accessibility-text-scale', baseline.textScale)
      if (baseline.lang == null) root.removeAttribute('lang')
      else root.setAttribute('lang', baseline.lang)
    }
    return () => {}
  }
  const appearance = preferences.appearance
  const choice = appearance.theme || 'system'
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  const apply = () => {
    const theme = choice === 'system' ? (media?.matches ? 'dark' : 'light') : choice
    root.setAttribute('data-resident-theme', theme)
    root.setAttribute('data-resident-theme-choice', choice)
    root.setAttribute('data-resident-contrast', appearance.contrast || 'standard')
    root.setAttribute('data-resident-reduce-motion', appearance.reduceMotion ? 'true' : 'false')
    root.style.setProperty('--accessibility-text-scale', appearance.textScale === 'small' ? '0.9375' : appearance.textScale === 'large' ? '1.125' : '1')
    root.setAttribute('lang', preferences.locale.language === 'ceb' ? 'ceb' : 'en')
    setActiveResidentPreferences(preferences)
  }
  apply()
  media?.addEventListener?.('change', apply)
  return () => media?.removeEventListener?.('change', apply)
}

export function ResidentPreferencesProvider({ children }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const residentId = user?.role === 'resident' ? user.id : null
  const inResidentApp = Boolean(residentId && (pathname === '/app' || pathname.startsWith('/app/')))
  const [preferences, setPreferences] = useState(() => normalizeResidentPreferences())
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(Boolean(residentId))
  const [loaded, setLoaded] = useState(!residentId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const baselineRef = useRef(null)
  const loadSequenceRef = useRef(0)
  const preferencesRef = useRef(preferences)
  preferencesRef.current = preferences

  useEffect(() => {
    const root = document.documentElement
    baselineRef.current = {
      theme: root.getAttribute('data-resident-theme'),
      themeChoice: root.getAttribute('data-resident-theme-choice'),
      contrast: root.getAttribute('data-resident-contrast'),
      reduceMotion: root.getAttribute('data-resident-reduce-motion'),
      textScale: root.style.getPropertyValue('--accessibility-text-scale') || null,
      lang: root.getAttribute('lang'),
    }
    return () => applyResidentDom(RESIDENT_PREFERENCE_DEFAULTS, false, baselineRef.current)
  }, [])

  const loadPreferences = useCallback(async () => {
    const sequence = ++loadSequenceRef.current
    setDraft(null)
    setError('')
    setLoaded(false)
    setLoading(true)
    if (!residentId) {
      const defaults = normalizeResidentPreferences()
      setPreferences(defaults)
      setLoaded(true)
      setLoading(false)
      return
    }
    const cached = readCache(residentId)
    if (cached) setPreferences(cached)
    try {
      const body = await residentPreferencesApi.get()
      if (sequence !== loadSequenceRef.current) return
      const next = normalizeResidentPreferences(body?.preferences || body)
      setPreferences(next)
      writeCache(residentId, next)
      setLoaded(true)
    } catch (cause) {
      if (sequence === loadSequenceRef.current) setError(residentPreferencesError(cause))
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false)
    }
  }, [residentId])

  useEffect(() => {
    loadPreferences()
    return () => { ++loadSequenceRef.current }
  }, [loadPreferences])

  const effective = draft || preferences
  const dirty = Boolean(draft && Object.keys(residentPreferencesPatch(preferences, draft)).length)
  useEffect(() => applyResidentDom(effective, inResidentApp, baselineRef.current), [effective, inResidentApp])

  const beginEditing = useCallback(() => {
    setDraft(current => current || copyPreferences(preferencesRef.current))
  }, [])
  const updateDraft = useCallback(patch => {
    setDraft(current => mergePreferences(current || preferencesRef.current, patch))
  }, [])
  const resetDraft = useCallback(() => setDraft(normalizeResidentPreferences()), [])
  const cancelEditing = useCallback(() => setDraft(null), [])
  const saveEditing = useCallback(async () => {
    const savedPreferences = preferencesRef.current
    const nextDraft = draft || savedPreferences
    const patch = residentPreferencesPatch(savedPreferences, nextDraft)
    setSaving(true)
    setError('')
    try {
      const body = await residentPreferencesApi.update(patch)
      const next = normalizeResidentPreferences(body?.preferences || body)
      setPreferences(next)
      setDraft(null)
      if (residentId) writeCache(residentId, next)
      return next
    } catch (cause) {
      setError(residentPreferencesError(cause, 'update'))
      throw cause
    } finally {
      setSaving(false)
    }
  }, [draft, residentId])
  const t = useCallback((key, fallback) => translate(effective.locale.language, key, fallback), [effective.locale.language])
  const value = useMemo(() => ({
    preferences, draft, effective, dirty, loading, loaded, saving, error, t,
    beginEditing, updateDraft, resetDraft, cancelEditing, saveEditing, reload: loadPreferences,
  }), [preferences, draft, effective, dirty, loading, loaded, saving, error, t, beginEditing, updateDraft, resetDraft, cancelEditing, saveEditing, loadPreferences])

  return <ResidentPreferencesContext.Provider value={value}>{children}</ResidentPreferencesContext.Provider>
}

export function useResidentPreferences() {
  const context = useContext(ResidentPreferencesContext)
  if (!context) throw new Error('useResidentPreferences must be used within ResidentPreferencesProvider')
  return context
}
