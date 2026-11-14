import type { FeatureCollection } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// The library draws tiles in a web worker; the bundler has to be told to ship that file.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { KYRGYZSTAN, MAP_3D, MAP_BOUNDS_MARGIN_DEG, MAP_DEFAULT_CENTER } from '../../config.ts'
import { satelliteStyle } from './satelliteStyle.ts'
import { circleRing, MARKER, type BaseMapProps } from './shared.ts'

type MapLibre = typeof import('maplibre-gl')

interface Map3DProps extends BaseMapProps {
  /** Called when the 3D map cannot start or load, so the flat map can take over. */
  onUnavailable: () => void
}

const AREA_SOURCE = 'mascot-area'

/** MapLibre paints with plain values, so the area's look is read from the design tokens at runtime. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function areaData(point: BaseMapProps['point'], radiusM: number): FeatureCollection {
  if (point === null) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circleRing(point, radiusM)] } },
    ],
  }
}

/**
 * The 3D base map: a tilted camera over satellite imagery and terrain, with buildings that stand up.
 * The library is loaded on demand.
 */
export function Map3D({ point, radiusM, digging, target, onSelect, onStatus, onUnavailable }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Set once the style has loaded; layers and markers can only be added after that.
  const [engine, setEngine] = useState<{ lib: MapLibre; map: MapLibreMap } | null>(null)
  const callbacks = useRef({ onSelect, onStatus, onUnavailable })

  useEffect(() => {
    callbacks.current = { onSelect, onStatus, onUnavailable }
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let loaded = false
    let failures = 0
    let map: MapLibreMap | null = null

    const giveUp = () => {
      if (!cancelled && !loaded) callbacks.current.onUnavailable()
    }
    const timer = window.setTimeout(giveUp, MAP_3D.loadTimeoutMs)

    import('maplibre-gl')
      .then((lib) => {
        if (cancelled) return
        lib.setWorkerUrl(workerUrl)
        // Throws when the browser has no WebGL; the catch below then hands over to the flat map.
        const created = new lib.Map({
          container,
          style: satelliteStyle({
            building: token('--map-building'),
            label: token('--map-label'),
            labelHalo: token('--map-label-halo'),
          }),
          center: [MAP_DEFAULT_CENTER.lon, MAP_DEFAULT_CENTER.lat],
          zoom: MAP_3D.startZoom,
          // The camera stays over Kyrgyzstan.
          maxBounds: [
            [KYRGYZSTAN.bounds.west - MAP_BOUNDS_MARGIN_DEG, KYRGYZSTAN.bounds.south - MAP_BOUNDS_MARGIN_DEG],
            [KYRGYZSTAN.bounds.east + MAP_BOUNDS_MARGIN_DEG, KYRGYZSTAN.bounds.north + MAP_BOUNDS_MARGIN_DEG],
          ],
          minZoom: MAP_3D.minZoom,
          pitch: MAP_3D.pitch,
          bearing: MAP_3D.bearing,
          attributionControl: false,
        })
        map = created
        created.addControl(new lib.NavigationControl({ visualizePitch: true }), 'top-left')
        // The credits fold into an "i" button in the corner, so they never run behind Dwoggle or the panel.
        created.addControl(new lib.AttributionControl({ compact: true }), 'bottom-right')
        const foldCredits = () => {
          const credits = container.querySelector('.maplibregl-ctrl-attrib')
          credits?.classList.remove('maplibregl-compact-show')
          credits?.removeAttribute('open')
        }
        // MapLibre opens them at first; fold them at once, and again when the map has loaded.
        window.setTimeout(foldCredits, 0)
        created.on('load', () => {
          loaded = true
          window.clearTimeout(timer)
          foldCredits()
          if (!cancelled) setEngine({ lib, map: created })
        })
        created.on('error', () => {
          if (loaded) failures += 1
          else giveUp()
        })
        // Fires when everything in view has been drawn, or has failed.
        created.on('idle', () => {
          if (!loaded) return
          callbacks.current.onStatus(failures > 0 ? 'error' : 'ready')
          failures = 0
        })
        created.on('click', (event) => {
          const { lat, lng } = event.lngLat.wrap()
          callbacks.current.onSelect({ lat, lon: lng })
        })
      })
      .catch(giveUp)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      map?.remove()
    }
  }, [])

  // The 300 m circle, drawn on the ground so it tilts with the camera.
  useEffect(() => {
    if (!engine) return
    const { map } = engine
    const data = areaData(point, radiusM)
    const source = map.getSource<GeoJSONSource>(AREA_SOURCE)
    if (source) {
      source.setData(data)
      return
    }
    map.addSource(AREA_SOURCE, { type: 'geojson', data })
    map.addLayer({
      id: `${AREA_SOURCE}-fill`,
      type: 'fill',
      source: AREA_SOURCE,
      paint: { 'fill-color': token('--map-area-fill'), 'fill-opacity': Number(token('--map-area-fill-opacity')) },
    })
    map.addLayer({
      id: `${AREA_SOURCE}-line`,
      type: 'line',
      source: AREA_SOURCE,
      paint: {
        'line-color': token('--map-area-stroke'),
        'line-width': Number(token('--map-area-stroke-width')),
        'line-dasharray': [3, 2],
      },
    })
  }, [engine, point, radiusM])

  // The pin, or Dwoggle digging. A new marker per point or dig restarts the run-in.
  useEffect(() => {
    if (!engine || !point) return
    const art = digging ? MARKER.digger : MARKER.pin
    const element = document.createElement('div')
    element.className = art.className
    element.innerHTML = art.html
    const marker = new engine.lib.Marker({ element, anchor: 'center' })
      .setLngLat([point.lon, point.lat])
      .addTo(engine.map)
    return () => {
      marker.remove()
    }
  }, [engine, point, digging])

  // Fly to a new point and zoom in far enough for the circle and the buildings around it.
  useEffect(() => {
    if (!engine || !point) return
    const { map } = engine
    map.easeTo({ center: [point.lon, point.lat], zoom: Math.max(map.getZoom(), MAP_3D.areaZoom), duration: 600 })
  }, [engine, point])

  // Fly to a place found by the address search.
  useEffect(() => {
    if (!engine || !target) return
    engine.map.flyTo({ center: [target.lon, target.lat], zoom: MAP_3D.searchZoom, duration: 900 })
  }, [engine, target])

  return <div ref={containerRef} className="map-view__map" />
}
