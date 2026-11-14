import { describe, expect, it } from 'vitest'
import { AuthError, toAuthError } from './errors.ts'

describe('toAuthError', () => {
  it.each([
    ['auth/invalid-credential', 'wrong_password'],
    ['auth/email-already-in-use', 'email_in_use'],
    ['auth/weak-password', 'weak_password'],
    ['auth/invalid-verification-code', 'wrong_code'],
    ['auth/code-expired', 'expired'],
    ['auth/popup-closed-by-user', 'cancelled'],
    ['auth/popup-blocked', 'popup_blocked'],
    ['auth/operation-not-allowed', 'not_enabled'],
    ['auth/too-many-requests', 'too_many'],
    ['auth/network-request-failed', 'network'],
  ])('reads Firebase code %s as %s', (code, kind) => {
    expect(toAuthError({ code, message: 'Firebase: Error.' }).kind).toBe(kind)
  })

  it('treats anything it does not know as a server problem', () => {
    expect(toAuthError({ code: 'auth/internal-error' }).kind).toBe('server')
    expect(toAuthError(new Error('boom')).kind).toBe('server')
    expect(toAuthError('boom').kind).toBe('server')
  })

  it('passes an AuthError through unchanged', () => {
    const original = new AuthError('expired', 'expired')
    expect(toAuthError(original)).toBe(original)
  })
})
