import type { LatLon } from './api/types.ts'

/**
 * The backend, on the same domain as the site (Cloudflare serves both). The app calls
 * `${API_BASE_URL}/report?lat=…&lon=…&lang=…`. In development the dev server forwards /api to the backend
 * on http://localhost:8000, or answers /api/report from mock/report.json (see vite.config.ts and README).
 */
export const API_BASE_URL = '/api'

/** Circle drawn on tap, before the report arrives with its own radius_m. */
export const DEFAULT_RADIUS_M = 300

export const MAP_DEFAULT_CENTER: LatLon = { lat: 42.8746, lon: 74.5698 } // Bishkek

/**
 * The 3D base map: MapLibre drawing satellite imagery over real terrain, with buildings standing up.
 * Every source is free and needs no API key. To swap a provider, change its URL here;
 * src/components/map/ is the only reader. Attributions are shown on the map as the licences require,
 * so they stay outside the translations file.
 */
export const MAP_3D = {
  satellite: {
    tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
  },
  /** Elevation tiles on AWS Open Data, built largely from NASA SRTM. */
  terrain: {
    tiles: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    maxZoom: 15,
    exaggeration: 1.4,
    attribution: 'Elevation: NASA SRTM and other open data via Mapzen terrain tiles',
  },
  /** OpenStreetMap vector tiles: building shapes and place names. */
  vector: {
    url: 'https://tiles.openfreemap.org/planet',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  },
  /** Opening zoom by how much ground to show: one city, or a small to very large country. */
  startZoom: { city: 14.2, small: 7.6, medium: 6.2, large: 4.6, huge: 3.2 },
  /** Zoom used after a tap, so the 300 m circle and the buildings around it are clearly visible. */
  areaZoom: 14.8,
  /** Zoom used when the address search finds a place: close enough to pick the exact spot. */
  searchZoom: 15.6,
  pitch: 58,
  bearing: -17,
  /** If the 3D map has not loaded by then, the flat map takes over. */
  loadTimeoutMs: 12000,
} as const

/**
 * The flat fallback map: Leaflet with OpenStreetMap raster tiles. Used when the 3D map cannot start
 * (no WebGL) or cannot load. src/components/map/MapFlat.tsx is the only reader.
 */
export const MAP_FLAT = {
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  /** Shown on the map as the provider's licence requires, so it stays outside the translations file. */
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  startZoom: { city: 12, small: 8, medium: 7, large: 5, huge: 4 },
  areaZoom: 15,
  searchZoom: 16,
} as const

/**
 * Shortest time Dwoggle's dig is shown after a tap (run in, sink into the ground), so a fast answer
 * does not cut it off. A slow answer keeps soil flying out of the hole until the report arrives.
 */
export const DIG_MIN_MS = 1700

/**
 * Address search. Nominatim is the free OpenStreetMap geocoder: no API key, at most one request
 * per second, and no search-as-you-type, so the app only searches when the form is submitted.
 * To use another geocoder, change the URL here and the response parsing in src/api/geocode.ts.
 */
export const GEOCODER = {
  url: 'https://nominatim.openstreetmap.org/search',
  /** Results inside this box (Kyrgyzstan: west, north, east, south) come first; places elsewhere are still found. */
  preferBox: '69.2,43.3,80.3,39.1',
  limit: 5,
} as const

/**
 * Firebase project used for sign-in (Google, email and password, phone number).
 * These values identify the project to Google; they are not secrets and are meant to ship in the page.
 * What protects the project is the list of authorized domains and the sign-in methods enabled in the Firebase console.
 */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD9f1XwDZ__JjTuITUJYqqkQYQ4kKyINhY',
  authDomain: 'bekem-514710.firebaseapp.com',
  projectId: 'bekem-514710',
  storageBucket: 'bekem-514710.firebasestorage.app',
  messagingSenderId: '848548003400',
  appId: '1:848548003400:web:1bc2a59d777c00ba41227d',
} as const
