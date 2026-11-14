import type { CheckId } from '../api/types.ts'

/**
 * Data sources. The backend lists every one it uses in `sources`, with a long, cited name, and names the ones
 * behind each grade in the check's `source_ids`. These short names are what fits in a report row (the full
 * name is the tooltip). Product names, the same in every language, like the map attributions in config.ts.
 */
export const SOURCE_SHORT_NAMES: Readonly<Record<string, string>> = {
  landsat_water: 'Landsat (NASA/USGS), JRC Global Surface Water',
  nasadem: 'NASADEM',
  modis_lst: 'NASA MODIS MOD11A2',
  modis_ndvi: 'NASA MODIS MOD13Q1',
  landslide: 'NASA Global Landslide Susceptibility',
  gem_faults: 'GEM Global Active Faults',
  giovanni_imerg: 'NASA GPM IMERG (Giovanni)',
  giovanni_gldas: 'NASA GLDAS (Giovanni)',
  noaa_ghcn: 'NOAA GHCN',
  appeears: 'NASA AppEEARS',
  mod44w: 'NASA MODIS MOD44W',
  osm: 'OpenStreetMap',
}

/**
 * Place names come from OpenStreetMap, whose licence (ODbL) asks for this credit wherever a name is shown.
 * The backend sends the text with every name; these are the fallbacks.
 */
export const OSM = {
  id: 'osm',
  attribution: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/copyright',
} as const

/**
 * Only if a report comes without `source_ids` (an older backend): the sources each grade is built from,
 * as in the backend's grading.py.
 */
export const CHECK_SOURCES: Readonly<Record<CheckId, readonly string[]>> = {
  green: ['modis_ndvi'],
  heat: ['modis_lst'],
  flood: ['landsat_water', 'nasadem'],
  landslide: ['nasadem'],
  earthquake: ['gem_faults'],
}

/** Used by the landslide grade only when the backend has the NASA susceptibility map. */
export const LANDSLIDE_SUSCEPTIBILITY_SOURCE = 'landslide'

/**
 * "30 m", "~11 km", "regional map, about ±1 km" → metres of the coarsest size named, or null.
 * The backend writes resolutions for people; this reads the numbers back out.
 */
export function resolutionMeters(text: string): number | null {
  let coarsest: number | null = null
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(km|m)\b/g)) {
    const meters = Number(match[1]) * (match[2] === 'km' ? 1000 : 1)
    if (Number.isFinite(meters) && (coarsest === null || meters > coarsest)) coarsest = meters
  }
  return coarsest
}
