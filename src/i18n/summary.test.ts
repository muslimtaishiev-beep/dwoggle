import { describe, expect, it } from 'vitest'
import mockReport from '../../mock/report.json'
import { parseReport } from '../api/parseReport.ts'
import type { Check, CheckId } from '../api/types.ts'
import { buildMessage, buildSummary } from './summary.ts'

const report = parseReport(mockReport)

function check(id: CheckId, overrides: Partial<Check> = {}): Check {
  const found = report.checks.find((c) => c.id === id)
  if (!found) throw new Error(`mock has no ${id} check`)
  return { ...found, ...overrides }
}

describe('buildSummary', () => {
  it('builds every sentence of the check from its message keys, in order', () => {
    expect(buildSummary(check('flood'), 'en')).toEqual({
      text:
        'Satellites saw water within 300 m of here in 11 of 26 years (2000–2025). ' +
        'This area is 7 m lower than the land around it. ' +
        'Steep slopes rise above this area. A mudflow could come down this way.',
      translated: true,
    })
  })

  it('formats numbers for the chosen language', () => {
    expect(buildSummary(check('heat'), 'ru').text).toContain('4,1')
    expect(buildSummary(check('earthquake'), 'ru').text).toContain('1,3 км')
  })

  it('builds the sentence in the reader\'s language, not the backend\'s text', () => {
    expect(buildSummary(check('landslide'), 'ky')).toEqual({ text: 'Спутник маалыматтары жетишсиз.', translated: true })
  })

  it('shows the raw params of an unknown key, and keeps the other sentences', () => {
    const flood = check('flood', {
      messages: [
        { key: 'flood.unknown', params: { n: 6, total: 25 } },
        { key: 'flood.low', params: { drop: 7 } },
      ],
    })
    expect(buildSummary(flood, 'en')).toEqual({
      text: 'n: 6, total: 25 This area is 7 m lower than the land around it.',
      translated: false,
    })
  })

  it('shows the key itself when an unknown key has no params, so the row is never empty', () => {
    expect(buildMessage({ key: 'eq.unknown', params: {} }, 'en')).toEqual({ text: 'eq.unknown', translated: false })
  })

  it('shows the raw params when a param the sentence needs is missing', () => {
    expect(buildMessage({ key: 'eq.near', params: { km: 1.3 } }, 'en')).toEqual({ text: 'km: 1.3', translated: false })
  })

  it('translates params that are message keys themselves ("@susc.3")', () => {
    expect(buildMessage({ key: 'landslide.susc', params: { cls: '@susc.3' } }, 'en').text).toBe(
      "NASA's landslide map rates the risk here as moderate.",
    )
    expect(buildMessage({ key: 'landslide.susc', params: { cls: '@susc.9' } }, 'en')).toEqual({
      text: 'cls: @susc.9',
      translated: false,
    })
  })
})
