import { describe, expect, it } from 'vitest'
import { isInKyrgyzstan } from './coverage.ts'

describe('isInKyrgyzstan', () => {
  it('accepts places in Kyrgyzstan', () => {
    expect(isInKyrgyzstan({ lat: 42.8746, lon: 74.5698 })).toBe(true) // Bishkek
    expect(isInKyrgyzstan({ lat: 40.5283, lon: 72.7985 })).toBe(true) // Osh
  })

  it('refuses places the backend has no data for', () => {
    expect(isInKyrgyzstan({ lat: 43.2389, lon: 76.8897 })).toBe(true) // Almaty lies inside the backend's box
    expect(isInKyrgyzstan({ lat: 41.2995, lon: 69.2401 })).toBe(true) // so does Tashkent, just
    expect(isInKyrgyzstan({ lat: 51.1694, lon: 71.4491 })).toBe(false) // Astana
    expect(isInKyrgyzstan({ lat: 55.7558, lon: 37.6173 })).toBe(false) // Moscow
  })
})
