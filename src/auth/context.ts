import { createContext, use } from 'react'
import type { ProfileAnswers, User } from './types.ts'

export type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'signedOut' }
  | { readonly status: 'signedIn'; readonly user: User }

/** Every action rejects with an AuthError (see errors.ts); saveProfile also with a ProfileFieldError. */
export interface AuthContextValue {
  readonly state: AuthState
  readonly signInWithGoogle: () => Promise<void>
  readonly signInWithEmail: (email: string, password: string) => Promise<void>
  readonly createAccount: (email: string, password: string) => Promise<void>
  readonly sendPasswordReset: (email: string) => Promise<void>
  /**
   * Sends the dig's answers to the backend. Resolves once they are saved, with a function that shows the saved
   * profile in the app (which then moves on to the map); rejects with a ProfileFieldError for a refused answer.
   */
  readonly saveProfile: (answers: ProfileAnswers) => Promise<() => void>
  /** Deletes the profile and the sign-in account, then signs out. */
  readonly deleteAccount: () => Promise<void>
  /** The signed-in user's ID token, for the backend's account calls. */
  readonly idToken: () => Promise<string>
  readonly signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = use(AuthContext)
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
