import type { Check, Message } from '../api/types.ts'
import { interpolate, lookupMessage, type Lang, type MessageParams } from './i18n.ts'

export interface Summary {
  readonly text: string
  /** false when at least one sentence could not be built and its raw params are shown instead. */
  readonly translated: boolean
}

/** Units come from the backend; a translation is used when one exists, otherwise the unit is shown as sent. */
export function translateUnit(lang: Lang, unit: string): string {
  return lookupMessage(lang, `unit.${unit}`) ?? unit
}

/** Backend message keys live under `api.` in the translations file, next to the app's own keys. */
export function apiMessage(lang: Lang, key: string): string | undefined {
  return lookupMessage(lang, `api.${key}`)
}

/** "@susc.3" is a message key itself ("moderate"); other params are used as they are. */
function resolveParams(lang: Lang, params: MessageParams): MessageParams | null {
  const resolved: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('@')) {
      const text = apiMessage(lang, value.slice(1))
      if (text === undefined) return null
      resolved[name] = text
    } else {
      resolved[name] = value
    }
  }
  return resolved
}

function rawMessage(message: Message): string {
  const entries = Object.entries(message.params)
  if (entries.length === 0) return message.key
  return entries.map(([name, value]) => `${name}: ${value}`).join(', ')
}

/**
 * One sentence from `api.<key>` and its params. The backend's own rendered text is never used: it is only in
 * English, Russian and Kyrgyz and does not follow the app's wording rules. If the key or a param is missing,
 * the raw params are shown instead, so a sentence is never silently dropped.
 */
export function buildMessage(message: Message, lang: Lang): Summary {
  const template = apiMessage(lang, message.key)
  const params = resolveParams(lang, message.params)
  const text = template === undefined || params === null ? null : interpolate(template, params, lang)
  return text === null ? { text: rawMessage(message), translated: false } : { text, translated: true }
}

/** The row sentence: every message of the check, in the backend's order. */
export function buildSummary(check: Check, lang: Lang): Summary {
  const parts = check.messages.map((message) => buildMessage(message, lang))
  return { text: parts.map((part) => part.text).join(' '), translated: parts.every((part) => part.translated) }
}
