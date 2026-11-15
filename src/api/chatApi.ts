import { API_BASE_URL } from '../config.ts'
import type { Lang } from '../i18n/i18n.ts'
import type { ChatReport } from '../report/chatReport.ts'

/**
 * Dwoggle's live answers on the backend (Claude): the conversation so far and the open report go to POST /api/chat,
 * his answer comes back as text. When the backend has no key it answers 503; `chatOff` then remembers that, so the
 * app gives its prepared answers without asking again. Any other failure falls back for that one question only.
 */
export class ChatUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatUnavailable'
  }
}

export interface ChatMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

/** How long he may think before the prepared answer is given instead. */
const CHAT_TIMEOUT_MS = 20_000

let chatOff = false

export function serverChatOff(): boolean {
  return chatOff
}

/** His answer to the last message (a question) of the conversation. */
export async function askOnServer(messages: readonly ChatMessage[], lang: Lang, report: ChatReport | null, signal?: AbortSignal): Promise<string> {
  if (chatOff) throw new ChatUnavailable('chat is off')
  const timeout = AbortSignal.timeout(CHAT_TIMEOUT_MS)
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, lang, report }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (response.status === 503 || response.status === 404) {
    chatOff = true
    throw new ChatUnavailable(`HTTP ${response.status}`)
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} from /chat`)
  const body: unknown = await response.json().catch(() => null)
  const text = typeof body === 'object' && body !== null ? (body as { text?: unknown }).text : null
  if (typeof text !== 'string' || text.trim() === '') throw new Error('empty answer from /chat')
  return text.trim()
}
