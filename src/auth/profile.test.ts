import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  cacheProfile,
  forgetProfile,
  hasCachedProfile,
  parseCached,
  profileFromAccount,
  profileFromCache,
  readCachedProfile,
  resolveProfile,
} from './profile.ts'
import type { Profile } from './types.ts'

const answers: Profile = {
  language: 'ky',
  country: 'KG',
  phone: '+996555123456',
  purpose: 'other',
  purposeNote: 'School project',
  concerns: ['flood', 'heat'],
}

describe('parseCached', () => {
  it('keeps the answers it knows and drops the rest', () => {
    expect(
      parseCached({ language: 'klingon', country: 'Kyrgyzstan', purpose: 'treasure', concerns: ['flood', 'zombies', 'green'] }),
    ).toEqual({ language: null, country: null, purpose: null, purposeNote: null, concerns: ['flood'], complete: false })
  })

  it('treats anything that is not an object as nothing saved', () => {
    expect(parseCached(null)).toEqual(parseCached({}))
    expect(parseCached('profile').complete).toBe(false)
  })
})

describe('profileFromAccount', () => {
  it('takes every answer from what the backend keeps', () => {
    const remote = {
      language: 'ky' as const,
      country: 'KG',
      phone: '+996555123456',
      purpose: 'buy_land' as const,
      purposeNote: null,
      concerns: ['heat' as const],
      complete: true,
    }
    expect(profileFromAccount(remote)).toEqual({
      language: 'ky',
      country: 'KG',
      phone: '+996555123456',
      purpose: 'buy_land',
      purposeNote: null,
      concerns: ['heat'],
    })
  })
})

describe('resolveProfile', () => {
  const remote = { language: 'ru' as const, country: 'KG', phone: '+996555123456', purpose: 'build' as const, purposeNote: null, concerns: [] }
  const device = parseCached({ language: 'ky', country: 'KG', purpose: 'build', concerns: [], complete: true })

  it('takes the verdict of the backend when it answers', () => {
    expect(resolveProfile({ ...remote, complete: true }, null).status).toBe('complete')
    expect(resolveProfile({ ...remote, phone: null, complete: false }, device).status).toBe('incomplete')
  })

  it('never calls the profile incomplete when the backend could not be asked', () => {
    // A returning user must not be sent through the dig again because the backend was out of reach.
    expect(resolveProfile(null, null)).toEqual({ profile: profileFromCache(null), status: 'unknown' })
    expect(resolveProfile(null, { ...device, complete: false }).status).toBe('unknown')
  })

  it('trusts a complete copy on this device while the backend is out of reach', () => {
    const resolved = resolveProfile(null, device)
    expect(resolved.status).toBe('complete')
    expect(resolved.profile).toMatchObject({ language: 'ky', country: 'KG', phone: null })
  })
})

describe('the device copy', () => {
  // Tests run in Node: a localStorage kept in memory stands in for the browser's.
  const store = new Map<string, string>()
  beforeAll(() => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    })
  })
  afterAll(() => vi.unstubAllGlobals())

  it('is kept per account, without the phone number', () => {
    cacheProfile('u1', answers, true)
    expect(store.get('dwoggle.profile')).not.toContain('555')
    expect(readCachedProfile('u2')).toBeNull()
    const cached = readCachedProfile('u1')
    expect(cached?.complete).toBe(true)
    expect(profileFromCache(cached)).toEqual({ ...answers, phone: null })
  })

  it('is gone once forgotten', () => {
    cacheProfile('u1', answers, true)
    expect(hasCachedProfile()).toBe(true)
    forgetProfile()
    expect(readCachedProfile('u1')).toBeNull()
    expect(hasCachedProfile()).toBe(false)
  })
})
