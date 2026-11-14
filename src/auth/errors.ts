/** What can go wrong with an account action, in terms the sign-in page can explain. */
export type AuthErrorKind =
  | 'network'
  | 'server'
  | 'cancelled'
  | 'popup_blocked'
  | 'not_enabled'
  | 'wrong_password'
  | 'email_in_use'
  | 'weak_password'
  | 'invalid_email'
  | 'invalid_phone'
  | 'wrong_code'
  | 'expired'
  | 'too_many'

export class AuthError extends Error {
  readonly kind: AuthErrorKind

  constructor(kind: AuthErrorKind, message: string) {
    super(message)
    this.name = 'AuthError'
    this.kind = kind
  }
}

const FIREBASE_CODES: Readonly<Record<string, AuthErrorKind>> = {
  'auth/network-request-failed': 'network',
  'auth/popup-closed-by-user': 'cancelled',
  'auth/cancelled-popup-request': 'cancelled',
  'auth/user-cancelled': 'cancelled',
  'auth/popup-blocked': 'popup_blocked',
  'auth/operation-not-allowed': 'not_enabled',
  'auth/admin-restricted-operation': 'not_enabled',
  // Firebase does not say which of the two was wrong, so that an address cannot be probed for an account.
  'auth/invalid-credential': 'wrong_password',
  'auth/wrong-password': 'wrong_password',
  'auth/user-not-found': 'wrong_password',
  'auth/email-already-in-use': 'email_in_use',
  'auth/weak-password': 'weak_password',
  'auth/invalid-email': 'invalid_email',
  'auth/invalid-phone-number': 'invalid_phone',
  'auth/missing-phone-number': 'invalid_phone',
  'auth/invalid-verification-code': 'wrong_code',
  'auth/missing-verification-code': 'wrong_code',
  'auth/code-expired': 'expired',
  'auth/too-many-requests': 'too_many',
  'auth/quota-exceeded': 'too_many',
}

/** Turns whatever Firebase threw into an AuthError the page can explain. */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : String(error)
  return new AuthError(FIREBASE_CODES[code] ?? 'server', code ? `${code}: ${message}` : message)
}
