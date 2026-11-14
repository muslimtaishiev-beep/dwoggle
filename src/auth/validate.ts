/** A deliberately loose check: one @, something on both sides, a dot in the domain. The backend has the last word. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

/** Firebase accepts 6 characters; Dwoggle asks for 8. */
export const MIN_PASSWORD_LENGTH = 8
