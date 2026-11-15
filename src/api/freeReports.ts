/**
 * Full reports made on this device without an account. A few are free; after that the app asks to sign in (the
 * backend has the same limit per visitor a day, so clearing this count does not get round it).
 */
export const FREE_REPORTS = 3
const KEY = 'dwoggle.freeReports'

export function freeReportsUsed(): number {
  try {
    const used = Number(window.localStorage.getItem(KEY))
    return Number.isFinite(used) && used > 0 ? Math.floor(used) : 0
  } catch {
    return 0
  }
}

export function setFreeReportsUsed(used: number): void {
  try {
    window.localStorage.setItem(KEY, String(Math.max(0, Math.min(used, FREE_REPORTS))))
  } catch {
    // Storage can be unavailable (private mode): then only the backend counts.
  }
}
