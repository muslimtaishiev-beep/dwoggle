import type { CheckId } from '../api/types.ts'
import type { Lang } from '../i18n/i18n.ts'

/**
 * Accounts.
 *
 * Signing in is done by Firebase Auth in the browser (see firebase.ts): Google, or email and password.
 * The map and the report never need an account; signing in only adds the profile below.
 *
 * The profile is the answers to the questions of the dig. Country, phone and purpose are kept by the backend
 * (GET /api/me, PUT /api/me/profile; backend/AUTH.md), which alone decides when a profile is complete.
 * Language and concerns are kept on this device until the backend stores them too.
 */

/** Why someone came to Dwoggle: the backend's list, in its order. "other" needs a short note. */
export const PURPOSES = ['buy_land', 'build', 'own_home', 'realtor', 'government', 'research', 'curious', 'other'] as const
export type Purpose = (typeof PURPOSES)[number]

/** The longest purpose note the backend accepts. */
export const PURPOSE_NOTE_MAX = 300

/** The checks someone can say they worry about, in the designer's order. Greenery is context, not a hazard. */
export const CONCERNS = ['flood', 'landslide', 'earthquake', 'heat'] as const satisfies readonly CheckId[]
export type Concern = (typeof CONCERNS)[number]

/** The answers to the questions of the dig. null means not answered yet. */
export interface Profile {
  /** Kept on this device. */
  readonly language: Lang | null
  /** ISO 3166-1 alpha-2, e.g. "KG". */
  readonly country: string | null
  /** As the backend stored it, in international form: "+996555123456". Never kept on the device. */
  readonly phone: string | null
  readonly purpose: Purpose | null
  /** In the visitor's own words; required when the purpose is "other". */
  readonly purposeNote: string | null
  /** Kept on this device. An empty list means "nothing in particular". */
  readonly concerns: readonly Concern[] | null
}

export interface User extends Profile {
  /** The Firebase user id. */
  readonly id: string
  readonly name: string | null
  readonly email: string | null
  /** The backend's verdict: country, phone and purpose are saved. Until then the dig asks for them. */
  readonly profileComplete: boolean
}

/** What the dig sends when the last question is answered. */
export interface ProfileAnswers {
  readonly language: Lang
  readonly country: string
  readonly phone: string
  readonly purpose: Purpose
  readonly purposeNote: string | null
  readonly concerns: readonly Concern[]
}

export const EMPTY_PROFILE: Profile = {
  language: null,
  country: null,
  phone: null,
  purpose: null,
  purposeNote: null,
  concerns: null,
}

export function isPurpose(value: unknown): value is Purpose {
  return (PURPOSES as readonly unknown[]).includes(value)
}

export function isConcern(value: unknown): value is Concern {
  return (CONCERNS as readonly unknown[]).includes(value)
}
