import { API_BASE_URL } from '../config.ts'
import type { Lang } from '../i18n/i18n.ts'

/**
 * Dwoggle's voice on the backend (ElevenLabs): his answers read aloud, and spoken questions turned into words.
 * When the backend has no voice it answers 503; `voiceOff` then remembers that, so the app falls back to the
 * browser's own voice without asking again.
 */
export class VoiceUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VoiceUnavailable'
  }
}

let voiceOff = false

export function serverVoiceOff(): boolean {
  return voiceOff
}

async function post(path: string, init: RequestInit): Promise<Response> {
  if (voiceOff) throw new VoiceUnavailable('voice is off')
  const response = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', ...init })
  if (response.status === 503 || response.status === 404) {
    voiceOff = true
    throw new VoiceUnavailable(`HTTP ${response.status}`)
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${path}`)
  return response
}

/** The answer read aloud, as an MP3 to play. */
export async function speakOnServer(text: string, lang: Lang, signal?: AbortSignal): Promise<Blob> {
  const response = await post('/voice/speak', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang }),
    signal,
  })
  return response.blob()
}

/** What was said in a recording. */
export async function listenOnServer(audio: Blob, lang: Lang): Promise<string> {
  const response = await post(`/voice/listen?lang=${lang}`, { headers: { 'Content-Type': audio.type || 'audio/webm' }, body: audio })
  const body: unknown = await response.json().catch(() => null)
  return typeof body === 'object' && body !== null && typeof (body as { text?: unknown }).text === 'string' ? (body as { text: string }).text : ''
}
