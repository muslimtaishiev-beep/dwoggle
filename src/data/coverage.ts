import type { LatLon } from '../api/types.ts'
import { KYRGYZSTAN } from '../config.ts'

/**
 * A quick first check: inside the box around Kyrgyzstan. The backend then checks the country's real border and
 * answers 422 outside_coverage for the rest of the box (Almaty, Andijan…); the report shows report.error.outside.
 */
export function isInKyrgyzstan({ lat, lon }: LatLon): boolean {
  const { west, south, east, north } = KYRGYZSTAN.bounds
  return lat >= south && lat <= north && lon >= west && lon <= east
}
