import { Headphones, Pause, Play, Square } from 'lucide-react'
import useSpeechSynthesis from '../hooks/useSpeechSynthesis'

export default function NarrationControl({ text, language = 'en-PH' }) {
  const { status, error, supported, start, pause, resume, stop } = useSpeechSynthesis()

  if (!supported) {
    return <p className="narration-unavailable" role="status">Read aloud is not supported by this browser.</p>
  }

  const isSpeaking = status === 'speaking'
  const isPaused = status === 'paused'

  return <div className="narration-control" role="group" aria-label="Article narration">
    {isSpeaking && <button type="button" className="narration-control-button" onClick={pause} aria-label="Pause reading" title="Pause reading">
      <Pause size={18} aria-hidden="true" />
    </button>}
    {isPaused && <button type="button" className="narration-control-button" onClick={resume} aria-label="Resume reading" title="Resume reading">
      <Play size={18} aria-hidden="true" />
    </button>}
    {!isSpeaking && !isPaused && <button type="button" className="narration-control-button" onClick={() => start(text, { language })} aria-label="Read article aloud" title="Read article aloud">
      <Headphones size={18} aria-hidden="true" />
    </button>}
    {(isSpeaking || isPaused) && <button type="button" className="narration-control-button narration-stop-button" onClick={stop} aria-label="Stop reading" title="Stop reading">
      <Square size={17} aria-hidden="true" />
    </button>}
    {error && <span className="narration-error" role="status">{error}</span>}
  </div>
}
