import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n/context.ts'
import type { Lang } from '../i18n/i18n.ts'
import { withTransition } from '../motion/pageTransition.ts'
import { deleteAccount, fetchAccount, saveAccount } from './accountApi.ts'
import { AuthContext, type AuthContextValue, type AuthState } from './context.ts'
import { AuthError, toAuthError } from './errors.ts'
import { cacheProfile, forgetProfile, profileFromAccount, readCachedProfile, resolveProfile } from './profile.ts'
import type { FirebaseUser } from './firebase.ts'
import type { Profile, ProfileStatus, User } from './types.ts'

type Firebase = typeof import('./firebase.ts')

// The Firebase SDK is fetched once, in the background, after the page has rendered.
let firebaseLoading: Promise<Firebase> | null = null
function loadFirebase(): Promise<Firebase> {
  firebaseLoading ??= import('./firebase.ts').catch((error: unknown) => {
    firebaseLoading = null
    throw toAuthError(error)
  })
  return firebaseLoading
}

function toUser(account: FirebaseUser, profile: Profile, profileStatus: ProfileStatus): User {
  return {
    id: account.uid,
    name: account.displayName,
    email: account.email,
    profileStatus,
    ...profile,
  }
}

/** The profile from the backend; if the backend is out of reach, the copy this device kept of it. */
async function loadProfile(firebase: Firebase, account: FirebaseUser, lang: Lang): Promise<ReturnType<typeof resolveProfile>> {
  try {
    const remote = await fetchAccount(await firebase.idToken(), lang)
    cacheProfile(account.uid, profileFromAccount(remote), remote.complete)
    return resolveProfile(remote, null)
  } catch {
    return resolveProfile(null, readCachedProfile(account.uid))
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { lang, setLang } = useI18n()
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const account = useRef<FirebaseUser | null>(null)
  // The sign-in watcher below runs once; it reads the current language and sign-in state from here.
  const langRef = useRef(lang)
  const statusRef = useRef(state.status)
  useEffect(() => {
    langRef.current = lang
    statusRef.current = state.status
  }, [lang, state.status])

  // Firebase restores a returning visitor's session by itself and reports every sign-in and sign-out here.
  useEffect(() => {
    let cancelled = false
    let stopWatching: (() => void) | undefined
    loadFirebase().then(
      (firebase) => {
        if (cancelled) return
        stopWatching = firebase.watchUser((next) => {
          account.current = next
          if (next === null) {
            setState({ status: 'signedOut' })
            return
          }
          void loadProfile(firebase, next, langRef.current).then(({ profile, status }) => {
            // Ignore the answer if someone else signed in, or the user signed out, while it was on its way.
            if (cancelled || account.current?.uid !== next.uid) return
            const show = () => {
              // The language chosen in the dig opens the app in that language again.
              if (profile.language !== null) setLang(profile.language)
              setState({ status: 'signedIn', user: toUser(next, profile, status) })
            }
            // Someone has just signed in on the sign-up page: the form gives way to the dig, or to the map.
            // A session restored when the page opens just appears.
            if (statusRef.current === 'signedOut') withTransition(status === 'incomplete' ? 'enter-dig' : 'surface', show)
            else show()
          })
        })
      },
      () => {
        // Sign-in is an extra: if its library cannot load, the rest of the app still works.
        if (!cancelled) setState({ status: 'signedOut' })
      },
    )
    return () => {
      cancelled = true
      stopWatching?.()
    }
  }, [setLang])

  // Firebase's own emails (verification, password reset) in the visitor's language.
  useEffect(() => {
    void loadFirebase().then(
      (firebase) => firebase.setLanguage(lang),
      () => undefined,
    )
  }, [lang])

  const value = useMemo<AuthContextValue>(() => {
    // After a sign-in the watcher above takes over; these only have to start it and report failures.
    const withFirebase =
      <Args extends unknown[]>(action: (firebase: Firebase, ...args: Args) => Promise<unknown>) =>
      async (...args: Args): Promise<void> => {
        await action(await loadFirebase(), ...args)
      }

    const signedInAccount = (): FirebaseUser => {
      if (account.current === null) throw new AuthError('expired', 'Not signed in')
      return account.current
    }

    return {
      state,
      signInWithGoogle: withFirebase((firebase) => firebase.signInWithGoogle()),
      signInWithEmail: withFirebase((firebase, email: string, password: string) => firebase.signInWithEmail(email, password)),
      createAccount: withFirebase((firebase, email: string, password: string) => firebase.createAccount(email, password)),
      sendPasswordReset: withFirebase((firebase, email: string) => firebase.sendPasswordReset(email)),
      signOut: withFirebase((firebase) => {
        // A shared device should not keep the last user's answers.
        forgetProfile()
        return firebase.signOut()
      }),

      async saveProfile(answers) {
        const current = signedInAccount()
        const firebase = await loadFirebase()
        const remote = await saveAccount(await firebase.idToken(), {
          country: answers.country,
          phone: answers.phone,
          purpose: answers.purpose,
          purpose_note: answers.purpose === 'other' ? answers.purposeNote : null,
          concerns: answers.concerns,
          lang: answers.language,
        })
        // What the backend kept (the phone comes back in international form).
        const saved = profileFromAccount(remote)
        const profile: Profile = {
          ...saved,
          language: saved.language ?? answers.language,
          concerns: saved.concerns ?? answers.concerns,
        }
        cacheProfile(current.uid, profile, remote.complete)
        // The caller decides when the app moves on (the dig first finishes its last layer).
        return () => {
          if (account.current?.uid === current.uid) {
            setState({ status: 'signedIn', user: toUser(current, profile, remote.complete ? 'complete' : 'incomplete') })
          }
        }
      },

      async idToken() {
        signedInAccount()
        return (await loadFirebase()).idToken()
      },

      async deleteAccount() {
        signedInAccount()
        const firebase = await loadFirebase()
        // The backend deletes the profile and the sign-in account; then this browser forgets both.
        await deleteAccount(await firebase.idToken(), lang)
        forgetProfile()
        await firebase.signOut().catch(() => undefined)
      },
    }
  }, [state, lang])

  return <AuthContext value={value}>{children}</AuthContext>
}
