import { describe, expect, it } from 'vitest'
import mockReport from '../../mock/report.json'
import { LANGS } from './i18n.ts'
import translations from './translations.json'

/**
 * Wording rules: never call a place "safe" or "dangerous", never say "plot" (say "this area").
 * The English words are checked in every language and in every key; each language also has its own words.
 * Case-insensitive substring match, so "Unsafe", "SAFETY" and "plots" fail too.
 */
const FORBIDDEN_EVERYWHERE = ['safe', 'dangerous', 'plot']

const FORBIDDEN_BY_LANGUAGE: Readonly<Record<string, readonly string[]>> = {
  ru: ['безопасн', 'опасн', 'участок', 'участк'],
  ky: ['коопсуз', 'коркунучтуу', 'участок', 'жер тилкеси'],
}

type Catalogs = Record<string, Record<string, string>>
const catalogs: Catalogs = translations

/** Every string in a JSON value, keys included, with a path for the failure message. */
function collectStrings(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }]
  if (Array.isArray(value)) return value.flatMap((item, i) => collectStrings(item, `${path}[${i}]`))
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => {
      const itemPath = path ? `${path}.${key}` : key
      return [{ path: `${itemPath} (key)`, text: key }, ...collectStrings(item, itemPath)]
    })
  }
  return []
}

function findForbidden(value: unknown, words: readonly string[]): string[] {
  return collectStrings(value).flatMap(({ path, text }) =>
    words.filter((word) => text.toLowerCase().includes(word.toLowerCase())).map((word) => `"${word}" in ${path}`),
  )
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('translations.json wording rules', () => {
  it('contains no forbidden English word in any language', () => {
    expect(findForbidden(translations, FORBIDDEN_EVERYWHERE)).toEqual([])
  })

  it.each(Object.keys(FORBIDDEN_BY_LANGUAGE))('contains no forbidden %s word', (lang) => {
    expect(findForbidden({ [lang]: catalogs[lang] }, FORBIDDEN_BY_LANGUAGE[lang] ?? [])).toEqual([])
  })

  it('has forbidden words for every language except English', () => {
    expect(Object.keys(FORBIDDEN_BY_LANGUAGE).sort()).toEqual(LANGS.filter((lang) => lang !== 'en').sort())
  })

  it('catches forbidden words in values, keys and nested strings', () => {
    expect(findForbidden({ en: { ok: 'Unsafe here' } }, FORBIDDEN_EVERYWHERE)).toEqual(['"safe" in en.ok'])
    expect(findForbidden({ ru: { 'plot.title': '' } }, FORBIDDEN_EVERYWHERE)).toEqual(['"plot" in ru.plot.title (key)'])
    expect(findForbidden({ ky: { list: ['DANGEROUS'] } }, FORBIDDEN_EVERYWHERE)).toEqual(['"dangerous" in ky.list[0]'])
    expect(findForbidden({ ru: { a: 'Безопасное место' } }, FORBIDDEN_BY_LANGUAGE.ru ?? [])).toContain('"безопасн" in ru.a')
  })
})

describe('translations.json structure', () => {
  const englishKeys = Object.keys(translations.en).sort()

  it('has every language the app offers, and no other', () => {
    expect(Object.keys(translations).sort()).toEqual([...LANGS].sort())
  })

  it.each([...LANGS])('%s has exactly the English keys', (lang) => {
    expect(Object.keys(catalogs[lang] ?? {}).sort()).toEqual(englishKeys)
  })

  it.each([...LANGS])('%s has a text for every key', (lang) => {
    const empty = Object.entries(catalogs[lang] ?? {})
      .filter(([, text]) => text.trim() === '')
      .map(([key]) => key)
    expect(empty).toEqual([])
  })

  it.each([...LANGS])('%s keeps the placeholders of every English text', (lang) => {
    const broken = Object.entries(translations.en)
      .filter(([key, text]) => placeholders(catalogs[lang]?.[key] ?? '').join() !== placeholders(text).join())
      .map(([key]) => key)
    expect(broken).toEqual([])
  })

  it('names every language the same way in every language', () => {
    for (const lang of LANGS) {
      for (const code of LANGS) {
        expect(catalogs[lang]?.[`lang.${code}`], `${lang} lang.${code}`).toBe(catalogs.en?.[`lang.${code}`])
      }
    }
  })

  it('has an English sentence for every message key in the mock, and for keys used as params ("@susc.3")', () => {
    const keys = mockReport.checks.flatMap((check) =>
      [...check.messages, ...check.verification].flatMap((message) => [
        message.key,
        ...Object.values(message.params as Record<string, unknown>)
          .filter((value): value is string => typeof value === 'string' && value.startsWith('@'))
          .map((value) => value.slice(1)),
      ]),
    )
    const missing = keys.map((key) => `api.${key}`).filter((key) => !(englishKeys as string[]).includes(key))
    expect(missing).toEqual([])
  })
})
