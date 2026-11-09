/**
 * Voice typing with the browser's Web Speech API (SpeechRecognition, or webkitSpeechRecognition in
 * Chrome and Safari): continuous, with interim results, for up to `maxMs` of talking in total.
 * The words show up while you talk. The browser does the recognition itself; Aura only gets the
 * text when the person presses "Build my world".
 *
 *   const speech = useSpeech({ text, onText: setText, maxMs: 60_000 })
 *   speech.start()   // listens and appends to `text` through onText
 *   speech.stop()
 */
import { useEffect, useRef, useState } from 'react'

/** The parts of SpeechRecognition we use (TypeScript's DOM types have its events but not the class). */
interface Recognizer {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognizerClass = new () => Recognizer

function recognizerClass(): RecognizerClass | null {
  if (typeof window === 'undefined' || !window.isSecureContext) return null // needs https (or localhost)
  const scope = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

/** Why listening stopped on its own: the mic is blocked, missing, or the speech service is unreachable. */
export type SpeechError = 'denied' | 'no-mic' | 'network' | 'failed'

const ERRORS: Partial<Record<SpeechRecognitionErrorCode, SpeechError>> = {
  'not-allowed': 'denied',
  'service-not-allowed': 'denied',
  'audio-capture': 'no-mic',
  network: 'network',
}

/** "I love the gym" + "and anime" -> "I love the gym and anime". */
function joinText(before: string, after: string): string {
  const a = before.trim()
  const b = after.trim()
  return a && b ? `${a} ${b}` : a || b
}

interface SpeechOptions {
  /** The transcript so far (the parent owns it, so typing and talking edit the same text). */
  text: string
  onText: (text: string) => void
  maxMs: number
}

export function useSpeech({ text, onText, maxMs }: SpeechOptions) {
  const [supported] = useState(() => recognizerClass() !== null)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [usedMs, setUsedMs] = useState(0)
  const [error, setError] = useState<SpeechError | null>(null)

  const recognizer = useRef<Recognizer | null>(null)
  /** true while the person wants to listen: the browser ends sessions after a pause, so we start another. */
  const wanted = useRef(false)
  /** The transcript before the current recognition session; its words get added after it. */
  const base = useRef('')
  const sessionText = useRef('')
  const used = useRef(0)
  const latest = useRef({ text, onText })
  latest.current = { text, onText }

  function startSession() {
    const Recognition = recognizerClass()
    if (!Recognition) return
    const session = new Recognition()
    session.continuous = true
    session.interimResults = true
    session.lang = navigator.language || 'en-US'
    sessionText.current = ''
    session.onresult = (event) => {
      let final = ''
      let pending = ''
      for (let index = 0; index < event.results.length; index++) {
        const result = event.results[index]
        if (result.isFinal) final = joinText(final, result[0].transcript)
        else pending = joinText(pending, result[0].transcript)
      }
      sessionText.current = final
      latest.current.onText(joinText(base.current, final))
      setInterim(pending)
    }
    session.onerror = (event) => {
      const problem = ERRORS[event.error] ?? (event.error === 'no-speech' || event.error === 'aborted' ? null : 'failed')
      if (problem) {
        wanted.current = false
        setError(problem)
      }
    }
    session.onend = () => {
      base.current = joinText(base.current, sessionText.current)
      setInterim('')
      if (wanted.current && used.current < maxMs) startSession()
      else {
        recognizer.current = null
        setListening(false)
      }
    }
    recognizer.current = session
    try {
      session.start()
    } catch {
      wanted.current = false
      setListening(false)
      setError('failed')
    }
  }

  function start() {
    if (!supported || listening || used.current >= maxMs) return
    setError(null)
    base.current = latest.current.text
    wanted.current = true
    setListening(true)
    startSession()
  }

  function stop() {
    wanted.current = false
    recognizer.current?.stop() // the last words still arrive, then onend finishes up
  }

  /** Forget the talk time used (after "Start over"). */
  function resetTime() {
    used.current = 0
    setUsedMs(0)
  }

  // The clock only runs while listening; at the limit it stops by itself.
  useEffect(() => {
    if (!listening) return
    let last = performance.now()
    const timer = window.setInterval(() => {
      const time = performance.now()
      used.current = Math.min(maxMs, used.current + (time - last))
      last = time
      setUsedMs(used.current)
      if (used.current >= maxMs) stop()
    }, 100)
    return () => window.clearInterval(timer)
  }, [listening, maxMs])

  // Leaving the page stops the microphone right away.
  useEffect(() => () => {
    wanted.current = false
    recognizer.current?.abort()
  }, [])

  return { supported, listening, interim, usedMs, error, start, stop, resetTime }
}
