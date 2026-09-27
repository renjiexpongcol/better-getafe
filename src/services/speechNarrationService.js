const VOICE_PREFERENCE_KEY = 'getafe-portal:narration-voice'
const RATE_PREFERENCE_KEY = 'getafe-portal:narration-rate'
const PITCH_PREFERENCE_KEY = 'getafe-portal:narration-pitch'

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'DT', 'DD', 'FIGCAPTION',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'OL', 'P', 'PRE', 'SECTION', 'TABLE',
  'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL',
])

const IGNORED_SELECTORS = [
  'script', 'style', 'noscript', 'nav', 'button', 'input', 'textarea', 'select',
  'option', 'svg', 'video', 'audio', '[aria-hidden="true"]', '[role="button"]',
]

const readStoredValue = (key) => {
  try { return window.localStorage.getItem(key) || '' } catch { return '' }
}

const readStoredNumber = (key, fallback, min, max) => {
  const value = Number(readStoredValue(key))
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

const saveStoredValue = (key, value) => {
  try { window.localStorage.setItem(key, String(value)) } catch { /* storage may be unavailable */ }
}

const normalizeText = (value) => String(value || '')
  .replace(/[\t\r ]+/g, ' ')
  .replace(/ *\n+ */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

export function htmlToSpeechText(html) {
  if (typeof DOMParser === 'undefined') return String(html || '').replace(/<[^>]+>/g, ' ')

  const documentFragment = new DOMParser().parseFromString(`<div>${String(html || '')}</div>`, 'text/html')
  const root = documentFragment.body.firstElementChild
  if (!root) return ''

  root.querySelectorAll(IGNORED_SELECTORS.join(',')).forEach(element => element.remove())
  root.querySelectorAll('br').forEach(element => element.replaceWith('\n'))
  root.querySelectorAll('*').forEach(element => {
    if (BLOCK_TAGS.has(element.tagName)) element.append('\n')
  })

  return normalizeText(root.textContent)
}

export function buildArticleNarrationText({ title, excerpt, content }) {
  const parts = [String(title || '').trim()]
  const cleanExcerpt = normalizeText(excerpt)
  const cleanContent = htmlToSpeechText(content)

  if (cleanExcerpt && cleanExcerpt !== cleanContent) parts.push(cleanExcerpt)
  if (cleanContent) parts.push(cleanContent)
  return parts.filter(Boolean).join('\n\n')
}

export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && 'SpeechSynthesisUtterance' in window
}

const languageParts = (language) => String(language || 'en-PH').toLowerCase().split('-')

function voiceMatchesLanguage(voice, language) {
  const requested = languageParts(language)
  const voiceLanguage = languageParts(voice.lang)
  return voiceLanguage[0] === requested[0]
}

function pickVoice(voices, language, preferredVoiceURI) {
  if (!voices.length) return null
  if (preferredVoiceURI) {
    const preferredVoice = voices.find(voice => voice.voiceURI === preferredVoiceURI)
    if (preferredVoice) return preferredVoice
  }

  const requested = String(language || 'en-PH').toLowerCase()
  const [baseLanguage] = languageParts(requested)
  const preferredLocales = baseLanguage === 'fil'
    ? ['fil-ph', 'fil']
    : baseLanguage === 'ceb'
      ? ['ceb-ph', 'ceb']
      : ['en-ph', 'en-us', 'en-gb']
  const exactVoice = preferredLocales
    .map(locale => voices.find(voice => String(voice.lang).toLowerCase() === locale))
    .find(Boolean)
  if (exactVoice) return exactVoice

  const compatibleVoice = voices.find(voice => voiceMatchesLanguage(voice, requested))
  if (compatibleVoice) return compatibleVoice

  // Some systems expose no Filipino or Cebuano voice. Use a real compatible
  // voice when one exists, otherwise leave voice selection to the browser.
  return voices.find(voice => ['en-ph', 'en-us', 'en-gb'].includes(String(voice.lang).toLowerCase()))
    || voices.find(voice => voice.default)
    || null
}

let speechSynthesisInstance = null
let currentRequest = 0
let voiceListener = null
let subscribers = new Set()
let state = { status: 'idle', error: '', voices: [] }

function notify() {
  subscribers.forEach(listener => listener(state))
}

function setState(nextState) {
  state = { ...state, ...nextState }
  notify()
}

function refreshVoices() {
  if (!speechSynthesisInstance) return
  setState({ voices: speechSynthesisInstance.getVoices() || [] })
}

function detachVoiceListener() {
  if (!speechSynthesisInstance || !voiceListener) return
  if (typeof speechSynthesisInstance.removeEventListener === 'function') {
    speechSynthesisInstance.removeEventListener('voiceschanged', voiceListener)
  } else if (speechSynthesisInstance.onvoiceschanged === voiceListener) {
    speechSynthesisInstance.onvoiceschanged = null
  }
  voiceListener = null
}

function ensureSpeechSynthesis() {
  if (!isSpeechSynthesisSupported()) return null
  if (speechSynthesisInstance) {
    if (!voiceListener) {
      voiceListener = refreshVoices
      if (typeof speechSynthesisInstance.addEventListener === 'function') {
        speechSynthesisInstance.addEventListener('voiceschanged', voiceListener)
      } else {
        speechSynthesisInstance.onvoiceschanged = voiceListener
      }
    }
    refreshVoices()
    return speechSynthesisInstance
  }

  speechSynthesisInstance = window.speechSynthesis
  voiceListener = refreshVoices
  if (typeof speechSynthesisInstance.addEventListener === 'function') {
    speechSynthesisInstance.addEventListener('voiceschanged', voiceListener)
  } else {
    speechSynthesisInstance.onvoiceschanged = voiceListener
  }
  refreshVoices()
  return speechSynthesisInstance
}

function resetAfterRequest(requestId, error = '') {
  if (requestId !== currentRequest) return
  setState({ status: 'idle', error })
}

export const speechNarrationService = {
  subscribe(listener) {
    subscribers.add(listener)
    ensureSpeechSynthesis()
    listener(state)
    return () => {
      subscribers.delete(listener)
      if (!subscribers.size) detachVoiceListener()
    }
  },

  getState() {
    ensureSpeechSynthesis()
    return state
  },

  isSupported() {
    return isSpeechSynthesisSupported()
  },

  getPreferences() {
    return {
      voiceURI: readStoredValue(VOICE_PREFERENCE_KEY),
      rate: readStoredNumber(RATE_PREFERENCE_KEY, 1, 0.5, 2),
      pitch: readStoredNumber(PITCH_PREFERENCE_KEY, 1, 0, 2),
    }
  },

  setPreferences({ voiceURI, rate, pitch } = {}) {
    if (voiceURI !== undefined) saveStoredValue(VOICE_PREFERENCE_KEY, voiceURI)
    if (rate !== undefined) saveStoredValue(RATE_PREFERENCE_KEY, Math.min(2, Math.max(0.5, Number(rate) || 1)))
    if (pitch !== undefined) saveStoredValue(PITCH_PREFERENCE_KEY, Math.min(2, Math.max(0, Number(pitch) || 1)))
  },

  start(text, { language = 'en-PH', voiceURI, rate, pitch } = {}) {
    const synth = ensureSpeechSynthesis()
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
      setState({ status: 'idle', error: 'Read aloud is not supported by this browser.' })
      return false
    }

    const cleanText = normalizeText(text)
    if (!cleanText) return false

    const preferences = this.getPreferences()
    const requestId = ++currentRequest
    synth.cancel()

    const utterance = new window.SpeechSynthesisUtterance(cleanText)
    const selectedVoice = pickVoice(state.voices, language, voiceURI || preferences.voiceURI)
    utterance.lang = selectedVoice?.lang || language
    if (selectedVoice) utterance.voice = selectedVoice
    utterance.rate = rate ?? preferences.rate
    utterance.pitch = pitch ?? preferences.pitch

    utterance.onstart = () => {
      if (requestId === currentRequest) setState({ status: 'speaking', error: '' })
    }
    utterance.onpause = () => {
      if (requestId === currentRequest) setState({ status: 'paused' })
    }
    utterance.onresume = () => {
      if (requestId === currentRequest) setState({ status: 'speaking' })
    }
    utterance.onend = () => resetAfterRequest(requestId)
    utterance.onerror = event => {
      if (requestId !== currentRequest) return
      const wasCancelled = event.error === 'canceled' || event.error === 'interrupted'
      resetAfterRequest(requestId, wasCancelled ? '' : 'Read aloud is not available right now. Please try again.')
    }

    setState({ status: 'speaking', error: '' })
    try {
      synth.speak(utterance)
      return true
    } catch {
      resetAfterRequest(requestId, 'Read aloud is not available right now. Please try again.')
      return false
    }
  },

  pause() {
    const synth = ensureSpeechSynthesis()
    if (!synth || state.status !== 'speaking') return
    try {
      synth.pause()
      setState({ status: 'paused' })
    } catch {
      setState({ status: 'idle', error: 'Read aloud is not available right now. Please try again.' })
    }
  },

  resume() {
    const synth = ensureSpeechSynthesis()
    if (!synth || state.status !== 'paused') return
    try {
      synth.resume()
      setState({ status: 'speaking', error: '' })
    } catch {
      setState({ status: 'idle', error: 'Read aloud is not available right now. Please try again.' })
    }
  },

  stop() {
    currentRequest += 1
    try { speechSynthesisInstance?.cancel() } catch { /* browser speech engines can fail during teardown */ }
    setState({ status: 'idle', error: '' })
  },
}

export default speechNarrationService
