import { describe, expect, it } from 'vitest'
import { normalizeEmail } from './validate.ts'

describe('normalizeEmail', () => {
  it('accepts an address and trims it', () => {
    expect(normalizeEmail('  aigul@example.kg ')).toBe('aigul@example.kg')
  })

  it.each(['', 'aigul', 'aigul@', '@example.kg', 'aigul@example', 'a b@example.kg'])('rejects %j', (input) => {
    expect(normalizeEmail(input)).toBeNull()
  })
})
