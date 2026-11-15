import { useCallback, useEffect, useRef, useState } from 'react'
import { serverVoiceOff, speakOnServer } from '../api/voiceApi.ts'
import type { Lang } from '../i18n/i18n.ts'

/** The browser's voice for a language ("ru" matches "ru-RU"), if it has one. */
function browserVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(lang) && voice.localService) ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(lang)) ?? null
}

/**
 * Reading a text aloud: in Dwoggle's own voice from the backend (ElevenLabs), which speaks all three languages;
 * where the backend has no voice, in the browser's, if it has one for the language (most have none for Kyrgyz).
 * `speaking` is true for as long as the sound plays, so his mouth moves with it.
 */
export function useSpeech(lang: Lang) {
  const [fallback, setFallback] = useState<SpeechSynthesisVoice | null>(() => browserVoice(lang))
  const [serverOn, setServerOn] = useState(() => !serverVoiceOff())
  const [speaking, setSpeaking] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const request = useRef<AbortController | null>(null)
  const utterance = useRef<SpeechSynthesisUtterance | null>(null)

  // Browsers load their voices after the page; ask again when they arrive, and when the language changes.
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const refresh = () => setFallback(browserVoice(lang))
    refresh()
    window.speechSynthesis.addEventListener('voiceschanged', refresh)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh)
  }, [lang])

  const stop = useCallback(() => {
    request.current?.abort()
    request.current = null
    if (audio.current) {
      audio.current.pause()
      URL.revokeObjectURL(audio.current.src)
      audio.current = null
    }
    utterance.current = null
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  useEffect(() => stop, [stop])

  const speakInBrowser = useCallback(
    (text: string) => {
      if (fallback === null) {
        setSpeaking(false)
        return
      }
      const said = new SpeechSynthesisUtterance(text)
      said.voice = fallback
      said.lang = fallback.lang
      const finished = () => {
        if (utterance.current !== said) return
        utterance.current = null
        setSpeaking(false)
      }
      said.onend = finished
      said.onerror = finished
      utterance.current = said
      window.speechSynthesis.speak(said)
    },
    [fallback],
  )

  const speak = useCallback(
    (text: string) => {
      stop()
      setSpeaking(true)
      if (serverVoiceOff()) {
        speakInBrowser(text)
        return
      }
      const controller = new AbortController()
      request.current = controller
      speakOnServer(text, lang, controller.signal).then(
        (blob) => {
          if (controller.signal.aborted) return
          const player = new Audio(URL.createObjectURL(blob))
          audio.current = player
          const finished = () => {
            if (audio.current !== player) return
            URL.revokeObjectURL(player.src)
            audio.current = null
            setSpeaking(false)
          }
          player.onended = finished
          player.onerror = finished
          player.play().catch(finished)
        },
        () => {
          if (controller.signal.aborted) return
          // No voice on the backend (or it failed this time): the browser's own, if it has one.
          setServerOn(!serverVoiceOff())
          speakInBrowser(text)
        },
      )
    },
    [lang, stop, speakInBrowser],
  )

  return { supported: serverOn || fallback !== null, speaking, speak, stop }
}
