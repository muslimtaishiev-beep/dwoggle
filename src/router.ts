import { useSyncExternalStore } from 'react'

/** The pages of the app. Anything else shows the landing page. */
export const ROUTES = { landing: '/', signIn: '/sign-in', welcome: '/welcome', map: '/map' } as const
export type Route = (typeof ROUTES)[keyof typeof ROUTES]

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

/** Goes to a page without reloading. The query string is kept, so dev options like ?mock=slow survive. */
export function navigate(to: Route, options: { replace?: boolean } = {}): void {
  if (to === window.location.pathname) return
  const url = `${to}${window.location.search}`
  if (options.replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  window.scrollTo(0, 0)
  for (const listener of listeners) listener()
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}
