import { describe, expect, it } from 'vitest'
import mockReport from '../../mock/report.json'
import { parseReport } from '../api/parseReport.ts'
import { formatNumber, LANGS, translate, type Lang, type MessageKey, type MessageParams } from '../i18n/i18n.ts'
import { chatReport } from './chatReport.ts'
import { PANEL_ORDER } from './facts.ts'

const report = parseReport(mockReport)
const i18n = (lang: Lang) => ({
  lang,
  t: (key: MessageKey, params?: MessageParams) => translate(lang, key, params),
  formatNumber: (n: number, options?: Intl.NumberFormatOptions) => formatNumber(lang, n, options),
})

describe('chatReport', () => {
  it.each(LANGS)('writes the report out in %s, small enough for the backend', (lang) => {
    const facts = chatReport(report, i18n(lang))
    expect(facts.checks.map((check) => check.id)).toEqual(PANEL_ORDER.filter((id) => report.checks.some((check) => check.id === id)))
    expect(facts.checks.every((check) => check.found !== '' && check.grade_meaning !== '')).toBe(true)
    expect(facts.summary).not.toBe('')
    expect(JSON.stringify(facts).length).toBeLessThan(40_000)
  })

  it('is the same every time for the same report, so the backend cache holds', () => {
    expect(JSON.stringify(chatReport(report, i18n('ru')))).toBe(JSON.stringify(chatReport(parseReport(mockReport), i18n('ru'))))
  })

  it('keeps the yearly series short: first and last year, and the trend', () => {
    const heat = chatReport(report, i18n('en')).checks.find((check) => check.id === 'heat')
    expect(heat?.series.length).toBeGreaterThan(0)
    const lst = heat?.series[0]
    expect(lst?.first?.year).toBeLessThan(lst?.last?.year ?? 0)
  })
})
