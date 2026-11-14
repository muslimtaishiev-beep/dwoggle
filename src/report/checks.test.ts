import { describe, expect, it } from 'vitest'
import mockReport from '../../mock/report.json'
import { parseReport } from '../api/parseReport.ts'
import { hasNoData, sortChecks } from './checks.ts'

const report = parseReport(mockReport)

describe('sortChecks', () => {
  it('orders checks from the surface down, whatever order the API used', () => {
    expect(report.checks.map((c) => c.id)[0]).toBe('flood')
    expect(sortChecks(report.checks).map((c) => c.id)).toEqual(['green', 'heat', 'flood', 'landslide', 'earthquake'])
  })
})

describe('hasNoData', () => {
  it('is false when at least one check has a grade', () => {
    expect(hasNoData(report)).toBe(false)
  })

  it('is true for no checks or only null grades', () => {
    expect(hasNoData({ ...report, checks: [] })).toBe(true)
    expect(hasNoData({ ...report, checks: report.checks.map((c) => ({ ...c, grade: null })) })).toBe(true)
  })
})
