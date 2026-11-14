import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { FIREBASE_CONFIG } from '../config.ts'
import { toAuthError } from './errors.ts'

/**
 * Everything that talks to Firebase: signing in (Google, email and password) and the ID token the backend
 * checks on every account call. The profile itself is kept by the backend (accountApi.ts). This file is loaded
 * on demand (see AuthProvider), so the Firebase SDK never delays the first paint. Every function throws an AuthError.
 */
const auth = getAuth(initializeApp(FIREBASE_CONFIG))

export type { FirebaseUser }

/** Emails and SMS from Firebase are written in this language. */
export function setLanguage(lang: string): void {
  auth.languageCode = lang
}

/** Calls back with the signed-in user, or null, now and whenever that changes. */
export function watchUser(onChange: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, onChange)
}

async function attempt<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    throw toAuthError(error)
  }
}

export function signInWithGoogle(): Promise<FirebaseUser> {
  return attempt(async () => (await signInWithPopup(auth, new GoogleAuthProvider())).user)
}

export function signInWithEmail(email: string, password: string): Promise<FirebaseUser> {
  return attempt(async () => (await signInWithEmailAndPassword(auth, email, password)).user)
}

/** Creates the account and asks Firebase to send the address a verification link. */
export function createAccount(email: string, password: string): Promise<FirebaseUser> {
  return attempt(async () => {
    const { user } = await createUserWithEmailAndPassword(auth, email, password)
    // The account works without it; a missing email must not undo the sign-up.
    await sendEmailVerification(user).catch(() => undefined)
    return user
  })
}

export function sendPasswordReset(email: string): Promise<void> {
  return attempt(() => sendPasswordResetEmail(auth, email))
}

/** The signed-in user's ID token for the backend; Firebase refreshes it when it is about to expire. */
export function idToken(): Promise<string> {
  return attempt(async () => {
    const user = auth.currentUser
    if (user === null) throw new Error('Not signed in')
    return user.getIdToken()
  })
}

export function signOut(): Promise<void> {
  return attempt(() => firebaseSignOut(auth))
}
