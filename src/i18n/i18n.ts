import translations from './translations.json'

/**
 * The languages Dwoggle speaks, in the order they are offered: Kyrgyz and Russian, the languages of Kyrgyzstan,
 * which is the one country its data covers, and English.
 */
export const LANGS = ['ky', 'ru', 'en'] as const
export type Lang = (typeof LANGS)[number]

/**
 * The first of the browser's preferred languages that Dwoggle speaks ("ru-KG" gives ru). A browser that speaks
 * none of them gets Russian: in Kyrgyzstan it is the language such a visitor is most likely to read.
 */
export function browserLang(): Lang {
  const preferred = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split('-')[0]
    if (isLang(primary)) return primary
  }
  return 'ru'
}

export type MessageKey = keyof typeof translations.en
export type MessageParams = Readonly<Record<string, string | number>>

// Every language must list every English key. An empty string means "not translated yet" and falls back to English.
const catalogs: Record<Lang, Record<MessageKey, string>> = translations

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(catalogs.en, key)
}

/** For keys only known at runtime, such as a summary_key from the API. */
export function lookupMessage(lang: Lang, key: string): string | undefined {
  if (!isMessageKey(key)) return undefined
  return catalogs[lang][key] || catalogs.en[key] || undefined
}

export function formatNumber(lang: Lang, value: number, options?: Intl.NumberFormatOptions): string {
  // No grouping, so years read "2000" rather than "2,000".
  return new Intl.NumberFormat(lang, { useGrouping: false, maximumFractionDigits: 4, ...options }).format(value)
}

/** Fills {name} placeholders. Returns null if the template needs a param that was not given. */
export function interpolate(template: string, params: MessageParams, lang: Lang): string | null {
  let missing = false
  const text = template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name]
    if (value === undefined) {
      missing = true
      return ''
    }
    return typeof value === 'number' ? formatNumber(lang, value) : value
  })
  return missing ? null : text
}

export function translate(lang: Lang, key: MessageKey, params: MessageParams = {}): string {
  const template = catalogs[lang][key] || catalogs.en[key]
  return interpolate(template, params, lang) ?? template
}
