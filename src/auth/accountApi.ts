import { API_BASE_URL } from '../config.ts'
import { isLang, type Lang } from '../i18n/i18n.ts'
import { AuthError } from './errors.ts'
import { isConcern, isPurpose, type Concern, type Purpose } from './types.ts'

/**
 * The backend's account endpoints (backend/AUTH.md): the profile it keeps for the signed-in user, and deleting
 * the account. Every call carries the user's Firebase ID token; the backend checks it.
 */

/** What the backend keeps for an account: every answer of the dig. */
export interface AccountProfile {
  readonly language: Lang | null
  readonly country: string | null
  readonly phone: string | null
  readonly purpose: Purpose | null
  readonly purposeNote: string | null
  /** An empty list means "nothing in particular"; null when there is no profile yet. */
  readonly concerns: readonly Concern[] | null
  /** The backend's own verdict: country, phone and purpose are all saved. */
  readonly complete: boolean
}

/** The fields PUT /api/me/profile can refuse. */
export const PROFILE_FIELDS = ['country', 'phone', 'purpose', 'purpose_note', 'concerns'] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]

/** The backend refused one answer (HTTP 422): which one, and why, e.g. phone / phone_invalid. */
export class ProfileFieldError extends Error {
  readonly field: ProfileField
  readonly code: string

  constructor(field: ProfileField, code: string) {
    super(`${field}: ${code}`)
    this.name = 'ProfileFieldError'
    this.field = field
    this.code = code
  }
}

export interface ProfileBody {
  readonly country: string
  readonly phone: string
  readonly purpose: Purpose
  readonly purpose_note: string | null
  readonly concerns: readonly Concern[]
  /** Any of the app's languages; the backend answers its own texts in the nearest of en, ru, ky. */
  readonly lang: Lang
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/** GET /api/me and PUT /api/me/profile answer alike: { user, profile, profile_complete }. */
export function parseAccount(body: unknown): AccountProfile {
  const outer = isRecord(body) ? body : {}
  const profile = isRecord(outer.profile) ? outer.profile : {}
  const country = text(profile.country)
  return {
    language: isLang(profile.lang) ? profile.lang : null,
    country: country !== null && /^[A-Z]{2}$/.test(country) ? country : null,
    phone: text(profile.phone),
    purpose: isPurpose(profile.purpose) ? profile.purpose : null,
    purposeNote: text(profile.purpose_note),
    concerns: Array.isArray(profile.concerns) ? profile.concerns.filter((item): item is Concern => isConcern(item)) : null,
    complete: outer.profile_complete === true,
  }
}

/** The { field, code } the backend sends with a 422, if that is what it sent. */
export function parseFieldError(body: unknown): ProfileFieldError | null {
  const detail = isRecord(body) ? body.detail : null
  if (!isRecord(detail)) return null
  const { field, code } = detail
  if (!(PROFILE_FIELDS as readonly unknown[]).includes(field) || typeof code !== 'string') return null
  return new ProfileFieldError(field as ProfileField, code)
}

async function call(path: string, token: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
  } catch (error) {
    throw new AuthError('network', String(error))
  }
  const body: unknown = await response.json().catch(() => null)
  if (response.ok) return body
  if (response.status === 401) throw new AuthError('expired', `HTTP 401 from ${path}`)
  const refused = response.status === 422 ? parseFieldError(body) : null
  if (refused) throw refused
  throw new AuthError('server', `HTTP ${response.status} from ${path}`)
}

export async function fetchAccount(token: string, lang: Lang): Promise<AccountProfile> {
  return parseAccount(await call(`/me?lang=${lang}`, token))
}

/** Saves the answers; resolves with what the backend kept (the phone comes back in international form). */
export async function saveAccount(token: string, body: ProfileBody): Promise<AccountProfile> {
  return parseAccount(await call(`/me/profile?lang=${body.lang}`, token, { method: 'PUT', body: JSON.stringify(body) }))
}

/** Deletes the profile and the sign-in account itself. */
export async function deleteAccount(token: string, lang: Lang): Promise<void> {
  await call(`/me?lang=${lang}`, token, { method: 'DELETE' })
}
