import type { LatLon } from '../api/types.ts'
import { KYRGYZSTAN } from '../config.ts'

/** Whether Dwoggle has data for this point: inside the box the backend accepts. */
export function isInKyrgyzstan({ lat, lon }: LatLon): boolean {
  const { west, south, east, north } = KYRGYZSTAN.bounds
  return lat >= south && lat <= north && lon >= west && lon <= east
}
