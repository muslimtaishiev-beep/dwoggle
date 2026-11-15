import { API_BASE_URL } from '../config.ts'
import type { SavedArea } from '../hooks/useSavedAreas.ts'

/**
 * The places a signed-in user saved, kept by the backend (GET, PUT and DELETE /api/me/saved), so they follow the
 * account to every device. Every call answers with the whole list, newest first.
 */

export class SavedError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SavedError'
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** The list as sent; entries it cannot read are left out. */
export function parseSaved(body: unknown): SavedArea[] {
  const areas = isRecord(body) && Array.isArray(body.areas) ? body.areas : []
  return areas.flatMap((area: unknown) => {
    if (!isRecord(area) || typeof area.lat !== 'number' || typeof area.lon !== 'number') return []
    const savedAt = typeof area.saved_at === 'string' ? Date.parse(area.saved_at) : NaN
    return [{
      lat: area.lat,
      lon: area.lon,
      name: typeof area.name === 'string' && area.name !== '' ? area.name : null,
      savedAt: Number.isFinite(savedAt) ? savedAt : 0,
    }]
  })
}

async function call(token: string, init: RequestInit = {}, query = ''): Promise<SavedArea[]> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/me/saved${query}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
  } catch (error) {
    throw new SavedError(0, String(error))
  }
  if (!response.ok) throw new SavedError(response.status, `HTTP ${response.status} from /me/saved`)
  return parseSaved(await response.json().catch(() => null))
}

export const fetchSaved = (token: string) => call(token)

export const addSaved = (token: string, area: Pick<SavedArea, 'lat' | 'lon' | 'name'>) =>
  call(token, { method: 'PUT', body: JSON.stringify({ lat: area.lat, lon: area.lon, name: area.name }) })

export const removeSaved = (token: string, area: Pick<SavedArea, 'lat' | 'lon'>) =>
  call(token, { method: 'DELETE' }, `?lat=${area.lat}&lon=${area.lon}`)
