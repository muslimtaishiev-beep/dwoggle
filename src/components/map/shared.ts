import type { LatLon } from '../../api/types.ts'

export type TileStatus = 'loading' | 'ready' | 'error'

/** What every base map implementation must do: show the tiles, the tapped point, its circle and Dwoggle. */
export interface BaseMapProps {
  point: LatLon | null
  radiusM: number
  /** Dwoggle runs to the point and digs there while this is true; otherwise a pin marks the point. */
  digging: boolean
  /** A place to show, from the address search. The camera moves there; nothing is selected. */
  target: LatLon | null
  onSelect: (point: LatLon) => void
  onStatus: (status: TileStatus) => void
}

/** The marker is a zero-size anchor on the point; the visible art is positioned and sized in MapView.css. */
export const MARKER = {
  pin: { className: 'map-pin', html: '<span class="map-pin__dot"></span>' },
  // He runs in, then sinks into a hole; soil keeps flying out of it until the report arrives.
  digger: {
    className: 'map-digger',
    html:
      '<span class="map-digger__run"></span>' +
      '<span class="map-digger__dig"><span class="map-digger__hole"></span>' +
      '<span class="map-digger__shaft"><span class="map-digger__body"></span></span></span>',
  },
} as const

const EARTH_RADIUS_M = 6371008.8
const CIRCLE_STEPS = 64

/** A circle on the ground as a ring of [lon, lat] positions, for maps that draw GeoJSON. */
export function circleRing(center: LatLon, radiusM: number): [number, number][] {
  const lat = (center.lat * Math.PI) / 180
  const lon = (center.lon * Math.PI) / 180
  const angular = radiusM / EARTH_RADIUS_M
  const ring: [number, number][] = []
  for (let step = 0; step <= CIRCLE_STEPS; step++) {
    const bearing = (step / CIRCLE_STEPS) * 2 * Math.PI
    const pointLat = Math.asin(Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing))
    const pointLon =
      lon +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat),
        Math.cos(angular) - Math.sin(lat) * Math.sin(pointLat),
      )
    ring.push([(pointLon * 180) / Math.PI, (pointLat * 180) / Math.PI])
  }
  return ring
}
