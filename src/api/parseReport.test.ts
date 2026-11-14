import { describe, expect, it } from 'vitest'
import mockReport from '../../mock/report.json'
import { parseReport, ReportFormatError } from './parseReport.ts'

type RawCheck = Record<string, unknown> & { series: Record<string, unknown>[] }

/** A deep copy of the mock with one check changed. */
function withCheck(id: string, change: (check: RawCheck) => void): unknown {
  const copy = structuredClone(mockReport) as unknown as { checks: RawCheck[] }
  const target = copy.checks.find((c) => c.id === id)
  if (!target) throw new Error(`mock has no ${id} check`)
  change(target)
  return copy
}

function parsedCheck(raw: unknown, id: string) {
  const check = parseReport(raw).checks.find((c) => c.id === id)
  if (!check) throw new Error(`no ${id} check`)
  return check
}

describe('parseReport', () => {
  it('reads the backend response: mood id, location, all five checks', () => {
    const report = parseReport(mockReport)
    expect(report.mood).toBe('whistling')
    expect(report.location).toEqual({
      lat: 42.824,
      lon: 74.604,
      radius_m: 300,
      place: {
        display: 'Microdistrict 10, Bishkek City',
        attribution: '© OpenStreetMap contributors',
        attribution_url: 'https://www.openstreetmap.org/copyright',
      },
    })
    expect(report.checks.map((c) => c.id)).toEqual(['flood', 'landslide', 'earthquake', 'heat', 'green'])
  })

  it('reads a report without a place name, or with one it cannot use, as no name', () => {
    const copy = structuredClone(mockReport) as unknown as { location: Record<string, unknown> }
    copy.location.place = null
    expect(parseReport(copy).location.place).toBeNull()
    copy.location.place = { display: '', name: 42 }
    expect(parseReport(copy).location.place).toBeNull()
    copy.location.place = { name: 'Asanbay' }
    expect(parseReport(copy).location.place).toMatchObject({ display: 'Asanbay', attribution: '© OpenStreetMap contributors' })
  })

  it('keeps message keys and params, never the backend text', () => {
    const flood = parsedCheck(mockReport, 'flood')
    expect(flood.messages[0]).toEqual({
      key: 'flood.water_years',
      params: { n: 11, total: 26, first: 2000, last: 2025, radius: 300 },
    })
    expect(JSON.stringify(flood)).not.toContain('Satellites saw water')
  })

  it('maps the first series to the chart, with its trend and line', () => {
    const heat = parsedCheck(mockReport, 'heat')
    expect(heat.trend?.series_id).toBe('lst')
    expect(heat.trend?.unit).toBe('°C')
    expect(heat.trend?.years).toHaveLength(heat.trend?.values.length ?? -1)
    expect(heat.trend?.stats).toMatchObject({ slope: 0.165, significant: true })
    expect(heat.trend?.stats?.line).toHaveLength(2)
  })

  it('charts a series without a trend (water seen) with stats null', () => {
    const flood = parsedCheck(mockReport, 'flood')
    expect(flood.trend?.series_id).toBe('water')
    expect(flood.trend?.stats).toBeNull()
  })

  it('takes resolution, sources and the NASA flag from the sources the grade is built from', () => {
    const flood = parsedCheck(mockReport, 'flood')
    expect(flood.sources.map((s) => s.id)).toEqual(['landsat_water', 'nasadem'])
    expect(flood).toMatchObject({ resolution_m: 30, is_nasa_data: true })
    expect(parsedCheck(mockReport, 'heat')).toMatchObject({ resolution_m: 1000, is_nasa_data: true })
    expect(parsedCheck(mockReport, 'heat').sources.map((s) => s.id)).toEqual(['modis_lst'])
    const earthquake = parsedCheck(mockReport, 'earthquake')
    expect(earthquake).toMatchObject({ resolution_m: 1000, is_nasa_data: false, trend: null })
    expect(earthquake.sources.map((s) => s.id)).toEqual(['gem_faults'])
    expect(parsedCheck(mockReport, 'landslide')).toMatchObject({ grade: null, resolution_m: 30, trend: null })
  })

  it('uses the coarsest source for the badge, e.g. the NASA susceptibility map on landslide', () => {
    const raw = withCheck('landslide', (c) => (c.source_ids = ['nasadem', 'landslide']))
    const landslide = parsedCheck(raw, 'landslide')
    expect(landslide.sources.map((s) => s.id)).toEqual(['nasadem', 'landslide'])
    expect(landslide.resolution_m).toBe(1000)
  })

  it('without source_ids, falls back to the chart’s source or the grading rules', () => {
    const heat = withCheck('heat', (c) => delete c.source_ids)
    expect(parsedCheck(heat, 'heat').sources.map((s) => s.id)).toEqual(['modis_lst'])
    const landslide = withCheck('landslide', (c) => {
      delete c.source_ids
      c.metrics = { susceptibility_class: 3 }
    })
    expect(parsedCheck(landslide, 'landslide').sources.map((s) => s.id)).toEqual(['nasadem', 'landslide'])
  })

  it('counts a source the backend does not list as non-NASA data', () => {
    const listed = withCheck('heat', (c) => (c.source_ids = ['giovanni_imerg']))
    expect(parsedCheck(listed, 'heat').is_nasa_data).toBe(true)
    const unknown = withCheck('heat', (c) => (c.source_ids = ['modis_lst', 'somebody_else']))
    expect(parsedCheck(unknown, 'heat').is_nasa_data).toBe(false)
  })

  it('keeps years without a value as gaps', () => {
    const raw = withCheck('green', (c) => {
      const points = c.series[0]?.points as { value: number | null }[]
      if (points[3]) points[3].value = null
    })
    expect(parsedCheck(raw, 'green').trend?.values[3]).toBeNull()
  })

  it('leaves out null params, so only that sentence falls back', () => {
    const raw = withCheck('earthquake', (c) => {
      const messages = c.messages as { params: Record<string, unknown> }[]
      if (messages[0]) messages[0].params = { km: 1.3, name: null }
    })
    expect(parsedCheck(raw, 'earthquake').messages[0]?.params).toEqual({ km: 1.3 })
  })

  it('skips a broken series or second opinion instead of failing the report', () => {
    const raw = withCheck('heat', (c) => {
      c.series = [{ id: 'lst' }]
      c.verification = [{ status: 'pending' }]
    })
    expect(parsedCheck(raw, 'heat')).toMatchObject({ trend: null, verification: [] })
  })

  it('rejects a grade outside A-D', () => {
    expect(() => parseReport(withCheck('heat', (c) => (c.grade = 'E')))).toThrow(ReportFormatError)
  })

  it('rejects a check without messages', () => {
    expect(() => parseReport(withCheck('heat', (c) => (c.messages = [])))).toThrow(/messages/)
  })

  it('rejects params that are objects', () => {
    const bad = withCheck('flood', (c) => (c.messages = [{ key: 'flood.low', params: { drop: { m: 7 } } }]))
    expect(() => parseReport(bad)).toThrow(/params\.drop/)
  })

  it('rejects an unknown mood', () => {
    expect(() => parseReport({ ...mockReport, mood: { id: 'sleepy' } })).toThrow(/mood\.id/)
  })

  it('rejects a body that is not a report', () => {
    expect(() => parseReport({ checks: 'not an array' })).toThrow(ReportFormatError)
  })
})
