import { useCallback, useState } from 'react'
import type { LatLon } from '../api/types.ts'

/** A place someone saved from the map: where it is and what it was called. Kept on this device. */
export interface SavedArea extends LatLon {
  readonly name: string | null
  readonly savedAt: number
}

const KEY = 'dwoggle.saved'
const MAX = 50

const same = (a: LatLon, b: LatLon) => a.lat.toFixed(4) === b.lat.toFixed(4) && a.lon.toFixed(4) === b.lon.toFixed(4)

function isSavedArea(value: unknown): value is SavedArea {
  if (typeof value !== 'object' || value === null) return false
  const { lat, lon, name, savedAt } = value as Record<string, unknown>
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    (name === null || typeof name === 'string') &&
    typeof savedAt === 'number'
  )
}

function read(): SavedArea[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter(isSavedArea) : []
  } catch {
    return []
  }
}

function write(areas: readonly SavedArea[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(areas))
  } catch {
    // Storage can be unavailable (private mode); the list then lasts for this visit only.
  }
}

/**
 * The areas saved on this device, newest first. There is no account sync yet: the backend has no endpoint
 * for saved areas.
 */
export function useSavedAreas() {
  const [areas, setAreas] = useState<SavedArea[]>(read)

  const update = useCallback((change: (current: SavedArea[]) => SavedArea[]) => {
    setAreas((current) => {
      const next = change(current)
      write(next)
      return next
    })
  }, [])

  const isSaved = useCallback((point: LatLon) => areas.some((area) => same(area, point)), [areas])

  const toggle = useCallback(
    (point: LatLon, name: string | null) =>
      update((current) =>
        current.some((area) => same(area, point))
          ? current.filter((area) => !same(area, point))
          : [{ lat: point.lat, lon: point.lon, name, savedAt: Date.now() }, ...current].slice(0, MAX),
      ),
    [update],
  )

  const remove = useCallback((point: LatLon) => update((current) => current.filter((area) => !same(area, point))), [update])

  return { areas, isSaved, toggle, remove }
}
