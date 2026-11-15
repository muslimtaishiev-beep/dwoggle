import { describe, expect, it } from 'vitest'
import mockReport from '../../mock/report.json'
import { parseReportCheck, ReportError, reportIdOf } from './reportsApi.ts'

const summary = {
  id: 'DW-2026-AB12CD',
  created_at: '2026-11-15T10:00:00+00:00',
  lat: 42.824,
  lon: 74.604,
  place: 'Bishkek',
  grades: { heat: 'C', flood: null, green: 'Z' },
  fingerprint: 'abc123',
}

describe('parseReportCheck', () => {
  it('reads the public summary, without data for someone else', () => {
    const check = parseReportCheck(summary)
    expect(check).toMatchObject({ id: 'DW-2026-AB12CD', createdAt: '2026-11-15T10:00:00+00:00', place: 'Bishkek', fingerprint: 'abc123', record: null })
    // Unknown grades are left out; "no grade" stays.
    expect(check.grades).toEqual({ heat: 'C', flood: null })
  })

  it("gives the owner the report's data", () => {
    const check = parseReportCheck({ ...summary, report: mockReport })
    expect(check.record?.id).toBe('DW-2026-AB12CD')
    expect(check.record?.report.checks.length).toBeGreaterThan(0)
  })

  it('refuses an answer without a number', () => {
    expect(() => parseReportCheck({ fingerprint: 'x' })).toThrow(ReportError)
    expect(() => parseReportCheck(null)).toThrow(ReportError)
  })
})

describe('reportIdOf', () => {
  it('finds the number in the address', () => {
    expect(reportIdOf('/r/DW-2026-AB12CD')).toBe('DW-2026-AB12CD')
    expect(reportIdOf('/r/dw-2026-ab12cd/')).toBe('DW-2026-AB12CD')
  })

  it('ignores anything else', () => {
    expect(reportIdOf('/r/')).toBeNull()
    expect(reportIdOf('/r/DW-26-AB12CD')).toBeNull()
    expect(reportIdOf('/r/%E0%A4%A')).toBeNull()
  })
})
