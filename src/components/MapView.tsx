import { Component, lazy, Suspense, useCallback, useState, type ReactNode } from 'react'
import type { LatLon } from '../api/types.ts'
import { useI18n } from '../i18n/context.ts'
import { Map3D } from './map/Map3D.tsx'
import type { TileStatus } from './map/shared.ts'
import { StateMessage } from './StateMessage.tsx'
import './MapView.css'

const MapFlat = lazy(() => import('./map/MapFlat.tsx'))

interface MapViewProps {
  point: LatLon | null
  radiusM: number
  /** Dwoggle runs to the point and digs there while this is true. */
  digging: boolean
  /** A place found by the address search; the map moves there. */
  target: LatLon | null
  onSelect: (point: LatLon) => void
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** If neither map can be drawn at all, say so instead of leaving a blank screen. */
class MapBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/**
 * The map. This is the one component the rest of the app knows: it shows the 3D map when the
 * browser can draw it and falls back to the flat map when it cannot. Swap providers in src/config.ts.
 */
export function MapView({ point, radiusM, digging, target, onSelect }: MapViewProps) {
  const { t } = useI18n()
  const [flat, setFlat] = useState(() => !hasWebGL())
  const [tiles, setTiles] = useState<TileStatus>('loading')

  const fallBackToFlat = useCallback(() => {
    setFlat(true)
    setTiles('loading')
  }, [])

  const mapProps = { point, radiusM, digging, target, onSelect, onStatus: setTiles }
  const mapError = <StateMessage kind="error" message={t('map.error')} floating />

  return (
    <div className="map-view" role="region" aria-label={t('map.label')}>
      <MapBoundary fallback={<div className="map-view__overlay map-view__overlay--center">{mapError}</div>}>
        {flat ? (
          <Suspense fallback={null}>
            <MapFlat {...mapProps} />
          </Suspense>
        ) : (
          <Map3D {...mapProps} onUnavailable={fallBackToFlat} />
        )}
      </MapBoundary>

      {/* Only before the first tap, so the message never covers Dwoggle or the pin. */}
      {tiles === 'loading' && point === null && (
        <div className="map-view__overlay map-view__overlay--center">
          <StateMessage kind="loading" message={t('map.loading')} floating />
        </div>
      )}
      {tiles === 'error' && <div className="map-view__overlay map-view__overlay--top">{mapError}</div>}
    </div>
  )
}
