import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'
import { MAP_3D } from '../../config.ts'

/** Colors the map layers need, read from the design tokens by the caller. */
export interface MapColors {
  building: string
  label: string
  labelHalo: string
}

/**
 * The 3D satellite map: imagery draped over terrain, buildings standing up from it,
 * and just enough place and street names to find a location.
 */
export function satelliteStyle(colors: MapColors): StyleSpecification {
  const name: ExpressionSpecification = ['coalesce', ['get', 'name'], ['get', 'name:latin']]
  return {
    version: 8,
    glyphs: MAP_3D.vector.glyphs,
    sources: {
      satellite: {
        type: 'raster',
        tiles: [MAP_3D.satellite.tiles],
        tileSize: 256,
        maxzoom: MAP_3D.satellite.maxZoom,
        attribution: MAP_3D.satellite.attribution,
      },
      terrain: {
        type: 'raster-dem',
        tiles: [MAP_3D.terrain.tiles],
        tileSize: 256,
        maxzoom: MAP_3D.terrain.maxZoom,
        encoding: 'terrarium',
        attribution: MAP_3D.terrain.attribution,
      },
      osm: { type: 'vector', url: MAP_3D.vector.url },
    },
    terrain: { source: 'terrain', exaggeration: MAP_3D.terrain.exaggeration },
    layers: [
      { id: 'satellite', type: 'raster', source: 'satellite' },
      {
        id: 'buildings-3d',
        type: 'fill-extrusion',
        source: 'osm',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': colors.building,
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.82,
        },
      },
      {
        id: 'street-names',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
          'symbol-placement': 'line',
          'text-field': name,
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
        },
        paint: { 'text-color': colors.label, 'text-halo-color': colors.labelHalo, 'text-halo-width': 1.5 },
      },
      {
        id: 'place-names',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'place',
        layout: {
          'text-field': name,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 14, 15],
          'text-max-width': 8,
        },
        paint: { 'text-color': colors.label, 'text-halo-color': colors.labelHalo, 'text-halo-width': 1.5 },
      },
    ],
  }
}
