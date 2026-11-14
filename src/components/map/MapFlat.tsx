import L, { type LeafletEventHandlerFnMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef } from 'react'
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLon } from '../../api/types.ts'
import { MAP_FLAT } from '../../config.ts'
import { MARKER, type BaseMapProps } from './shared.ts'

const pinIcon = L.divIcon({ ...MARKER.pin, iconSize: [0, 0] })
const diggerIcon = L.divIcon({ ...MARKER.digger, iconSize: [0, 0] })

function TapHandler({ onSelect }: { onSelect: (point: LatLon) => void }) {
  useMapEvents({
    click(event) {
      const { lat, lng } = event.latlng.wrap()
      onSelect({ lat, lon: lng })
    },
  })
  return null
}

/** Zooms in on a new point so its circle is visible, and keeps it on screen when the map resizes. */
function FollowPoint({ point }: { point: LatLon | null }) {
  const map = useMap()
  const pointRef = useRef(point)

  useEffect(() => {
    pointRef.current = point
    if (point === null) return
    const target: [number, number] = [point.lat, point.lon]
    map.invalidateSize({ pan: false })
    if (map.getZoom() < MAP_FLAT.areaZoom) map.setView(target, MAP_FLAT.areaZoom)
    else if (!map.getBounds().pad(-0.1).contains(target)) map.panTo(target)
  }, [map, point])

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      map.invalidateSize()
      const current = pointRef.current
      if (current && !map.getBounds().pad(-0.1).contains([current.lat, current.lon])) {
        map.panTo([current.lat, current.lon])
      }
    })
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])

  return null
}

/** Moves to a place found by the address search. */
function ShowTarget({ target }: { target: LatLon | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.setView([target.lat, target.lon], MAP_FLAT.searchZoom)
  }, [map, target])
  return null
}

/** The flat fallback map: Leaflet with raster tiles. Loaded only when the 3D map cannot be used. */
export default function MapFlat({ point, radiusM, digging, target, start, onSelect, onStatus }: BaseMapProps) {
  const failedTiles = useRef(0)

  const tileEvents = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      loading: () => {
        failedTiles.current = 0
      },
      tileerror: () => {
        failedTiles.current += 1
      },
      // Fires once every visible tile has either loaded or failed.
      load: () => onStatus(failedTiles.current > 0 ? 'error' : 'ready'),
    }),
    [onStatus],
  )

  return (
    <MapContainer
      className="map-view__map"
      center={[start.center.lat, start.center.lon]}
      zoom={MAP_FLAT.startZoom[start.span]}
      worldCopyJump
    >
      <TileLayer
        url={MAP_FLAT.tileUrl}
        attribution={MAP_FLAT.attribution}
        maxZoom={MAP_FLAT.maxZoom}
        eventHandlers={tileEvents}
      />
      <TapHandler onSelect={onSelect} />
      <FollowPoint point={point} />
      <ShowTarget target={target} />
      {point && (
        <>
          <Circle
            center={[point.lat, point.lon]}
            radius={radiusM}
            pathOptions={{ className: 'map-area' }}
            interactive={false}
          />
          <Marker
            // A new point or a new dig remounts the marker, which restarts the run-in.
            key={`${point.lat},${point.lon},${digging}`}
            position={[point.lat, point.lon]}
            icon={digging ? diggerIcon : pinIcon}
            interactive={false}
            keyboard={false}
          />
        </>
      )}
    </MapContainer>
  )
}
