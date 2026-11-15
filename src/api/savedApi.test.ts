import { describe, expect, it } from 'vitest'
import { parseSaved } from './savedApi.ts'

describe('parseSaved', () => {
  it('reads the list the backend sends', () => {
    expect(parseSaved({ areas: [{ lat: 42.824, lon: 74.604, name: 'Bishkek', saved_at: '2026-11-15T10:00:00+00:00' }] })).toEqual([
      { lat: 42.824, lon: 74.604, name: 'Bishkek', savedAt: Date.parse('2026-11-15T10:00:00+00:00') },
    ])
  })

  it('leaves out what it cannot read', () => {
    expect(parseSaved({ areas: [{ lat: '42' }, null, { lat: 40.5, lon: 72.8, name: '' }] })).toEqual([{ lat: 40.5, lon: 72.8, name: null, savedAt: 0 }])
    expect(parseSaved(null)).toEqual([])
  })
})
