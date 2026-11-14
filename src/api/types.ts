/**
 * The report as the app uses it. GET /api/report answers in the backend's own format (mock/report.json is a
 * real response); parseReport.ts checks it and maps it into these types.
 * The backend sends every sentence as a message key with its numbers, and the app builds the wording itself
 * from src/i18n/translations.json, in any of its languages. The backend's own rendered text is never shown.
 */

/**
 * Also the fixed display order, top to bottom: green is the surface, earthquake the deepest layer.
 * The three checks with a 25-year trend come first.
 */
export const CHECK_IDS = ['green', 'heat', 'flood', 'landslide', 'earthquake'] as const
export type CheckId = (typeof CHECK_IDS)[number]

export const GRADES = ['A', 'B', 'C', 'D'] as const
export type Grade = (typeof GRADES)[number]

export const MOODS = ['relaxed', 'alert', 'whistling'] as const
export type Mood = (typeof MOODS)[number]

/** A string that starts with "@" is a message key itself, e.g. "@susc.3" for "moderate". */
export type ParamValue = string | number

export type MessageParams = Readonly<Record<string, ParamValue>>

/** One sentence: looked up as `api.<key>` in the translations file and filled with its params. */
export interface Message {
  readonly key: string
  readonly params: MessageParams
}

export interface TrendPoint {
  readonly year: number
  readonly value: number
}

/** Sen's slope and the Mann-Kendall test, as computed by the backend. */
export interface TrendStats {
  /** Units per year. */
  readonly slope: number
  readonly p_value: number
  readonly significant: boolean
  /** Two points to draw the trend line between; null when the backend did not send them. */
  readonly line: readonly [TrendPoint, TrendPoint] | null
}

/** One yearly series: the chart of a check. */
export interface Trend {
  /** Backend series id: water, rain, rain_max, runoff, soil, lst, ndvi. Its label is `api.series.<id>`. */
  readonly series_id: string
  readonly years: readonly number[]
  /** Same length as years; null for a year without data. */
  readonly values: readonly (number | null)[]
  /** Sent by the backend, e.g. "°C", "%", "mm", "NDVI". The slope is per year. */
  readonly unit: string
  /** null when the series has too few years for a trend, or is not meant to have one (water seen). */
  readonly stats: TrendStats | null
}

/** Where the numbers of a check come from. */
export interface DataSource {
  readonly id: string
  /** The backend's full name, with citation. A short name for the badge is in src/report/sources.ts. */
  readonly name: string
  readonly url: string | null
  readonly nasa: boolean
}

export interface Check {
  readonly id: CheckId
  /** null means the source has no data for this area. */
  readonly grade: Grade | null
  /** The sentences of the summary, in order. Never empty for a parsed check. */
  readonly messages: readonly Message[]
  /** Pixel size of the coarsest data behind the grade, in metres; null if the backend does not say. */
  readonly resolution_m: number | null
  readonly sources: readonly DataSource[]
  /** False as soon as one source is not NASA data. */
  readonly is_nasa_data: boolean
  /** The first series of the check; null for checks without yearly data (landslide, earthquake). */
  readonly trend: Trend | null
  /** Second opinions from other sources. They never change the grade. Not shown yet. */
  readonly verification: readonly Message[]
  /** The backend's plain numbers and flags behind the grade, e.g. distance_km, change_pct, mudflow_path. */
  readonly metrics: Metrics
}

/** Only the scalar metrics; nested ones (a fault's geometry) are left out. */
export type Metrics = Readonly<Record<string, number | boolean | string>>

/** The place's name from OpenStreetMap, in the language the report was asked for. */
export interface Place {
  /** The place itself, e.g. "Microdistrict 10". */
  readonly name: string
  /** Name, locality and region together, e.g. "Microdistrict 10, Bishkek City". */
  readonly display: string
  /** "© OpenStreetMap contributors": the ODbL asks for it wherever the name is shown. */
  readonly attribution: string
  /** Where the attribution links to. */
  readonly attribution_url: string
}

export interface ReportLocation {
  readonly lat: number
  readonly lon: number
  /** null when OpenStreetMap had no name here, or did not answer in time. */
  readonly place: Place | null
  readonly radius_m: number
}

export interface Report {
  readonly location: ReportLocation
  readonly mood: Mood
  readonly checks: readonly Check[]
}

export interface LatLon {
  readonly lat: number
  readonly lon: number
}
