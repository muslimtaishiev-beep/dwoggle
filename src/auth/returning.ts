/**
 * Whether someone has signed in on this device before. It is kept after signing out (it holds nothing about the
 * account, only "yes"), so the sign-up page opens on logging in for a returning visitor instead of asking them to
 * create an account they already have.
 */
const KEY = 'dwoggle.returning'

export function isReturningDevice(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function rememberReturningDevice(): void {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    // Storage can be unavailable (private mode): the page then opens on creating an account, as for anyone new.
  }
}
