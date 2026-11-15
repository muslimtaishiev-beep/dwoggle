import { describe, expect, it } from 'vitest'
import type { Trend } from '../../api/types.ts'
import { chartSvg } from './chartSvg.ts'

const trend = {
  series_id: 'lst_summer',
  unit: '°C',
  years: [2001, 2002, 2003, 2004, 2005, 2006],
  values: [30, 31, null, 32, 33, 34],
  stats: { line: [{ year: 2001, value: 30 }, { year: 2006, value: 34 }] },
} as unknown as Trend

describe('chartSvg', () => {
  it('draws a bar per year with a value, the trend line and the years', () => {
    const svg = chartSvg(trend)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.match(/<rect /g)).toHaveLength(5)
    expect(svg).toContain('stroke="#ce6142"')
    expect(svg).toContain('>2001<')
    expect(svg).toContain('>2006<')
    expect(svg).not.toContain('NaN')
  })

  it('copes with a flat series and no trend line', () => {
    const svg = chartSvg({ ...trend, values: [5, 5, 5, 5, 5, 5], stats: null } as unknown as Trend)
    expect(svg).not.toContain('NaN')
    expect(svg).not.toContain('Infinity')
  })
})
