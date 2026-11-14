import { GEOCODER } from '../config.ts'
import type { Lang } from '../i18n/i18n.ts'

/** One place found for a typed address. */
export interface Place {
  readonly lat: number
  readonly lon: number
  /** The short name, e.g. the street or the town. */
  readonly title: string
  /** The rest of the address, e.g. district and country. May be empty. */
  readonly detail: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Reads a Nominatim response. Entries without usable coordinates or a name are skipped,
 * and so are repeats: one street often comes back as several segments with the same address.
 */
export function parsePlaces(body: unknown): Place[] {
  if (!Array.isArray(body)) throw new Error('Geocoder response is not a list')
  const places: Place[] = []
  const seen = new Set<string>()
  for (const entry of body) {
    if (!isRecord(entry)) continue
    const lat = Number(entry.lat)
    const lon = Number(entry.lon)
    const full = typeof entry.display_name === 'string' ? entry.display_name.trim() : ''
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || entry.lat === null || entry.lon === null || full === '') continue
    const parts = full.split(',').map((part) => part.trim())
    const name = typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name.trim() : (parts[0] ?? full)
    const rest = parts[0] === name ? parts.slice(1) : parts
    const detail = rest.join(', ')
    const label = `${name}|${detail}`.toLowerCase()
    if (seen.has(label)) continue
    seen.add(label)
    places.push({ lat, lon, title: name, detail })
  }
  return places
}

/** Looks up an address. Called only when the search form is submitted, never per keystroke. */
export async function searchPlaces(query: string, lang: Lang, signal: AbortSignal): Promise<Place[]> {
  const url = new URL(GEOCODER.url)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', String(GEOCODER.limit))
  url.searchParams.set('viewbox', GEOCODER.preferBox)
  url.searchParams.set('accept-language', lang)
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Geocoder answered HTTP ${response.status}`)
  return parsePlaces(await response.json())
}
