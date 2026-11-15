import { describe, expect, it } from 'vitest'
import { isOutsideCoverage } from './client.ts'

describe('isOutsideCoverage', () => {
  it("recognises the backend's refusal for a place without data", () => {
    expect(isOutsideCoverage({ detail: { code: 'outside_coverage', message: 'There is data only for Kyrgyzstan for now.' } })).toBe(true)
  })

  it('is false for other errors', () => {
    for (const body of [null, 'text', {}, { detail: 'Bekem only knows Kyrgyzstan' }, { detail: [{ loc: ['query', 'lat'] }] }, { detail: { code: 'x' } }]) {
      expect(isOutsideCoverage(body)).toBe(false)
    }
  })
})
