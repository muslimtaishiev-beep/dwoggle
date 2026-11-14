import { isLang } from '../i18n/i18n.ts'
import type { AccountProfile } from './accountApi.ts'
import { EMPTY_PROFILE, isConcern, isPurpose, type Concern, type Profile } from './types.ts'

/**
 * What this browser keeps about the signed-in user: a copy of the profile the backend holds, without the phone
 * number, so the app opens in the right language and country at once, before the backend has answered, and
 * still works when the backend is out of reach. The backend's answer always wins.
 */
const CACHE_KEY = 'dwoggle.profile'

/** Everything the device keeps for one account. */
export interface CachedProfile extends Omit<Profile, 'phone'> {
  readonly complete: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Anything not recognised counts as not answered yet, so a bad copy can never break the app. */
export function parseCached(value: unknown): CachedProfile {
  const record = isRecord(value) ? value : {}
  const country = typeof record.country === 'string' && /^[A-Z]{2}$/.test(record.country) ? record.country : null
  return {
    language: isLang(record.language) ? record.language : null,
    country,
    purpose: isPurpose(record.purpose) ? record.purpose : null,
    purposeNote: typeof record.purposeNote === 'string' && record.purposeNote !== '' ? record.purposeNote : null,
    concerns: Array.isArray(record.concerns) ? record.concerns.filter((item): item is Concern => isConcern(item)) : null,
    complete: record.complete === true,
  }
}

/** The profile as the app sees it, from what the backend keeps. */
export function profileFromAccount(account: AccountProfile): Profile {
  return {
    language: account.language,
    country: account.country,
    phone: account.phone,
    purpose: account.purpose,
    purposeNote: account.purposeNote,
    concerns: account.concerns,
  }
}

/** The profile from the device's copy alone, for when the backend cannot be reached. */
export function profileFromCache(cached: CachedProfile | null): Profile {
  if (cached === null) return EMPTY_PROFILE
  const { language, country, purpose, purposeNote, concerns } = cached
  return { language, country, phone: null, purpose, purposeNote, concerns }
}

export function readCachedProfile(userId: string): CachedProfile | null {
  try {
    const cached: unknown = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? 'null')
    if (!isRecord(cached) || cached.id !== userId) return null
    return parseCached(cached)
  } catch {
    return null
  }
}

/**
 * Keeps the profile on this device, without the phone number. It holds one account at a time, is read only for
 * that account, and is forgotten on sign-out and when the account is deleted.
 */
export function cacheProfile(userId: string, profile: Profile, complete: boolean): void {
  const cached: CachedProfile & { id: string } = {
    id: userId,
    language: profile.language,
    country: profile.country,
    purpose: profile.purpose,
    purposeNote: profile.purposeNote,
    concerns: profile.concerns,
    complete,
  }
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    // Storage can be unavailable (private mode); the profile is then fetched on every visit.
  }
}

/** Forgets the device's copy: on sign-out and when the account is deleted. */
export function forgetProfile(): void {
  try {
    window.localStorage.removeItem(CACHE_KEY)
  } catch {
    // Nothing was stored.
  }
}
