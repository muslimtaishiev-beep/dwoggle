import { useCallback, useEffect, useRef, useState } from 'react'

/** The part of the browser's speech recognition this app uses (Chrome and Safari ship it, prefixed). */
interface Recognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  abort: () => void
}

type RecognitionConstructor = new () => Recognition

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as Record<string, RecognitionConstructor | undefined>
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

/** Speaking instead of typing, in the given language. `supported` is false where the browser cannot listen. */
export function useVoiceInput(lang: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const current = useRef<Recognition | null>(null)
  const supported = recognitionClass() !== null

  useEffect(() => () => current.current?.abort(), [])

  const listen = useCallback(() => {
    const Recognizer = recognitionClass()
    if (!Recognizer || current.current) return
    const recognition = new Recognizer()
    recognition.lang = lang
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript.trim()
      if (text) onText(text)
    }
    recognition.onend = () => {
      current.current = null
      setListening(false)
    }
    recognition.onerror = recognition.onend
    current.current = recognition
    setListening(true)
    recognition.start()
  }, [lang, onText])

  return { supported, listening, listen }
}
