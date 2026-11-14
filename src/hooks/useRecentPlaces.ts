import { useCallback, useState } from 'react'
import type { Place } from '../api/geocode.ts'

const KEY = 'dwoggle.recent'
const MAX = 6

function isPlace(value: unknown): value is Place {
  if (typeof value !== 'object' || value === null) return false
  const { lat, lon, title, detail } = value as Record<string, unknown>
  return typeof lat === 'number' && typeof lon === 'number' && typeof title === 'string' && typeof detail === 'string'
}

function read(): Place[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter(isPlace).slice(0, MAX) : []
  } catch {
    return []
  }
}

/** The places found with the search lately, newest first, kept on this device. */
export function useRecentPlaces() {
  const [places, setPlaces] = useState<Place[]>(read)

  const remember = useCallback((place: Place) => {
    setPlaces((current) => {
      const next = [place, ...current.filter((other) => other.title !== place.title || other.detail !== place.detail)].slice(0, MAX)
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Storage can be unavailable (private mode); the list then lasts for this visit only.
      }
      return next
    })
  }, [])

  return { places, remember }
}
