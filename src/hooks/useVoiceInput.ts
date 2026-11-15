import { useCallback, useEffect, useRef, useState } from 'react'
import { listenOnServer, serverVoiceOff } from '../api/voiceApi.ts'
import type { Lang } from '../i18n/i18n.ts'

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

function canRecord(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

/** Whether this browser can take a spoken question at all. */
export function canListen(): boolean {
  return canRecord() || recognitionClass() !== null
}

/** A recording stops by itself after this long, or after this much quiet once the visitor has started speaking. */
const MAX_RECORDING_MS = 8000
const QUIET_MS = 1500
/** Louder than this (0–1, average over the sound) counts as speaking. */
const SPEAKING_LEVEL = 0.04

export type VoiceInputState = 'idle' | 'listening' | 'hearing'

/**
 * Speaking instead of typing. The question is recorded and turned into words by the backend (ElevenLabs), which
 * hears Kyrgyz too; where the backend has no voice, the browser's own recognizer listens. A second press stops
 * the recording, and so does a moment of quiet after the visitor has spoken.
 * `state` is 'listening' while recording and 'hearing' while the words are worked out.
 */
export function useVoiceInput(lang: Lang, onText: (text: string) => void) {
  const [state, setState] = useState<VoiceInputState>('idle')
  const stopRecording = useRef<(() => void) | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const heard = useRef(onText)
  useEffect(() => {
    heard.current = onText
  })

  useEffect(
    () => () => {
      stopRecording.current?.()
      recognition.current?.abort()
    },
    [],
  )

  const listenInBrowser = useCallback(() => {
    const Recognizer = recognitionClass()
    if (!Recognizer) {
      setState('idle')
      return
    }
    const recognizer = new Recognizer()
    recognizer.lang = lang
    recognizer.interimResults = false
    recognizer.maxAlternatives = 1
    recognizer.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript.trim()
      if (text) heard.current(text)
    }
    recognizer.onend = () => {
      recognition.current = null
      setState('idle')
    }
    recognizer.onerror = recognizer.onend
    recognition.current = recognizer
    setState('listening')
    recognizer.start()
  }, [lang])

  const record = useCallback(async () => {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setState('idle')
      return
    }
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)

    // Stop after a moment of quiet: watch how loud the microphone is.
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    context.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    let spoke = false
    let quietSince = performance.now()
    const started = performance.now()
    const watch = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples)
      const level = samples.reduce((sum, v) => sum + Math.abs(v - 128), 0) / samples.length / 128
      const now = performance.now()
      if (level > SPEAKING_LEVEL) {
        spoke = true
        quietSince = now
      }
      if ((spoke && now - quietSince > QUIET_MS) || now - started > MAX_RECORDING_MS) stop()
    }, 100)

    function stop() {
      window.clearInterval(watch)
      stopRecording.current = null
      if (recorder.state !== 'inactive') recorder.stop()
    }
    stopRecording.current = stop

    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
      const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      if (!spoke) {
        setState('idle')
        return
      }
      setState('hearing')
      listenOnServer(audio, lang).then(
        (text) => {
          setState('idle')
          if (text.trim()) heard.current(text.trim())
        },
        () => {
          // No voice on the backend: the browser's recognizer, which asks the visitor to speak again.
          if (serverVoiceOff()) listenInBrowser()
          else setState('idle')
        },
      )
    }
    setState('listening')
    recorder.start()
  }, [lang, listenInBrowser])

  /** Start listening, or, while listening, stop and hear what was said. */
  const listen = useCallback(() => {
    if (stopRecording.current) {
      stopRecording.current()
      return
    }
    if (recognition.current || state !== 'idle') return
    if (canRecord() && !serverVoiceOff()) void record()
    else listenInBrowser()
  }, [state, record, listenInBrowser])

  return { supported: canListen(), listening: state === 'listening', hearing: state === 'hearing', listen }
}
