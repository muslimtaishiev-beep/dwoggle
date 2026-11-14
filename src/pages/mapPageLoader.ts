import { lazy, type ComponentType } from 'react'

// The map brings the 3D map library with it, so its code is fetched only when the map is opened, or about to be.
const load = () => import('./MapPage.tsx')
const LazyMapPage = lazy(load)
let loaded: ComponentType | null = null

/**
 * Fetches the map's code ahead of time, from the pages that lead to it. Once it is here the map opens without
 * a loading screen in between, which is what lets the change of screen be animated.
 */
export function preloadMapPage(): void {
  void load().then(
    (module) => {
      loaded = module.default
    },
    () => undefined,
  )
}

/** The map page: itself when its code is already here, otherwise a stand-in that suspends while it loads. */
export function mapPage(): ComponentType {
  return loaded ?? LazyMapPage
}
