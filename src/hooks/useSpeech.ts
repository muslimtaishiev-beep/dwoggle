import { useCallback, useEffect, useRef, useState } from 'react'

/** The browser's voice for a language ("ru" matches "ru-RU"), if it has one. */
function voiceFor(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(lang) && voice.localService) ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(lang)) ?? null
}

/**
 * Reading a text aloud in the given language. `supported` is false where the browser has no voice for it
 * (most have none for Kyrgyz), and then nothing is offered rather than a voice that mispronounces it.
 */
export function useSpeech(lang: string) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(() => voiceFor(lang))
  const [speaking, setSpeaking] = useState(false)
  const current = useRef<SpeechSynthesisUtterance | null>(null)

  // Browsers load their voices after the page; ask again when they arrive, and when the language changes.
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const refresh = () => setVoice(voiceFor(lang))
    refresh()
    window.speechSynthesis.addEventListener('voiceschanged', refresh)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh)
  }, [lang])

  const stop = useCallback(() => {
    current.current = null
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  useEffect(() => stop, [stop])

  const speak = useCallback(
    (text: string) => {
      if (voice === null) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = voice
      utterance.lang = voice.lang
      const finished = () => {
        if (current.current !== utterance) return
        current.current = null
        setSpeaking(false)
      }
      utterance.onend = finished
      utterance.onerror = finished
      current.current = utterance
      setSpeaking(true)
      window.speechSynthesis.speak(utterance)
    },
    [voice],
  )

  return { supported: voice !== null, speaking, speak, stop }
}
