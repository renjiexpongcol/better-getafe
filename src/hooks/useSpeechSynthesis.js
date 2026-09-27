import { useEffect, useState } from 'react'
import speechNarrationService from '../services/speechNarrationService'

export default function useSpeechSynthesis() {
  const [state, setState] = useState(() => speechNarrationService.getState())

  useEffect(() => speechNarrationService.subscribe(setState), [])

  return {
    ...state,
    supported: speechNarrationService.isSupported(),
    start: speechNarrationService.start.bind(speechNarrationService),
    pause: speechNarrationService.pause.bind(speechNarrationService),
    resume: speechNarrationService.resume.bind(speechNarrationService),
    stop: speechNarrationService.stop.bind(speechNarrationService),
  }
}
