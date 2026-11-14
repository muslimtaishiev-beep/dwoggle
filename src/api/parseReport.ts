import { CHECK_SOURCES, LANDSLIDE_SUSCEPTIBILITY_SOURCE, OSM, resolutionMeters } from '../report/sources.ts'
import {
  CHECK_IDS,
  GRADES,
  MOODS,
  type Check,
  type Metrics,
  type CheckId,
  type DataSource,
  type Message,
  type Mood,
  type ParamValue,
  type Place,
  type Report,
  type ReportLocation,
  type Trend,
  type TrendPoint,
  type TrendStats,
} from './types.ts'

/** Thrown when a response cannot be read as a report. */
export class ReportFormatError extends Error {
  constructor(fieldPath: string, expected: string) {
    super(`Invalid report: ${fieldPath} should be ${expected}`)
    this.name = 'ReportFormatError'
  }
}

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function object(value: unknown, at: string): JsonObject {
  if (!isObject(value)) throw new ReportFormatError(at, 'an object')
  return value
}

function finiteNumber(value: unknown, at: string): number {
  if (!isFiniteNumber(value)) throw new ReportFormatError(at, 'a finite number')
  return value
}

function nonEmptyString(value: unknown, at: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new ReportFormatError(at, 'a non-empty string')
  return value
}

function boolean(value: unknown, at: string): boolean {
  if (typeof value !== 'boolean') throw new ReportFormatError(at, 'a boolean')
  return value
}

function oneOf<T extends string>(value: unknown, options: readonly T[], at: string): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) {
    throw new ReportFormatError(at, `one of ${options.join(', ')}`)
  }
  return value as T
}

function array<T>(value: unknown, at: string, item: (entry: unknown, at: string) => T): T[] {
  if (!Array.isArray(value)) throw new ReportFormatError(at, 'an array')
  return value.map((entry, index) => item(entry, `${at}[${index}]`))
}

/** For the parts the report can do without: a missing or broken list becomes empty, a broken item is skipped. */
function optionalArray<T>(value: unknown, item: (entry: unknown, at: string) => T, at: string): T[] {
  if (!Array.isArray(value)) return []
  const items: T[] = []
  value.forEach((entry, index) => {
    try {
      items.push(item(entry, `${at}[${index}]`))
    } catch (error) {
      if (!(error instanceof ReportFormatError)) throw error
    }
  })
  return items
}

/** A place name is a nice-to-have: anything unreadable counts as no name. */
function parsePlace(value: unknown, listed: ReadonlyMap<string, ListedSource>): Place | null {
  if (!isObject(value)) return null
  const display = typeof value.display === 'string' && value.display.trim() !== '' ? value.display : value.name
  if (typeof display !== 'string' || display.trim() === '') return null
  const name = typeof value.name === 'string' && value.name.trim() !== '' ? value.name : (display.split(',')[0] ?? display)
  return {
    name: name.trim(),
    display,
    attribution: typeof value.attribution === 'string' && value.attribution !== '' ? value.attribution : OSM.attribution,
    attribution_url: listed.get(OSM.id)?.url ?? OSM.url,
  }
}

function parseLocation(value: unknown, listed: ReadonlyMap<string, ListedSource>): ReportLocation {
  const raw = object(value, 'location')
  return {
    lat: finiteNumber(raw.lat, 'location.lat'),
    lon: finiteNumber(raw.lon, 'location.lon'),
    place: parsePlace(raw.place, listed),
    radius_m: finiteNumber(raw.radius_m, 'location.radius_m'),
  }
}

/** The backend sends { id, title, line }; only the id is used, the wording is the app's. */
function parseMood(value: unknown): Mood {
  return oneOf(isObject(value) ? value.id : value, MOODS, isObject(value) ? 'mood.id' : 'mood')
}

/**
 * A null param is left out, so only the sentence that needs it falls back to raw params.
 * Anything else that is not a string or a number means the backend changed its format.
 */
function parseParams(value: unknown, at: string): Record<string, ParamValue> {
  if (value === undefined || value === null) return {}
  const raw = object(value, at)
  const params: Record<string, ParamValue> = {}
  for (const [key, param] of Object.entries(raw)) {
    if (param === null) continue
    if (typeof param === 'string' || isFiniteNumber(param)) params[key] = param
    else if (typeof param === 'boolean') params[key] = String(param)
    else throw new ReportFormatError(`${at}.${key}`, 'a string or a number')
  }
  return params
}

function parseMessage(value: unknown, at: string): Message {
  const raw = object(value, at)
  return { key: nonEmptyString(raw.key, `${at}.key`), params: parseParams(raw.params, `${at}.params`) }
}

function parsePoint(value: unknown, at: string): { year: number; value: number | null } {
  const raw = object(value, at)
  const year = finiteNumber(raw.year, `${at}.year`)
  return { year, value: isFiniteNumber(raw.value) ? raw.value : null }
}

function parseLinePoint(value: unknown, at: string): TrendPoint {
  const raw = object(value, at)
  return { year: finiteNumber(raw.year, `${at}.year`), value: finiteNumber(raw.value, `${at}.value`) }
}

function parseStats(value: unknown, at: string): TrendStats | null {
  if (value === null || value === undefined) return null
  const raw = object(value, at)
  const pValue = finiteNumber(raw.p_value, `${at}.p_value`)
  if (pValue < 0 || pValue > 1) throw new ReportFormatError(`${at}.p_value`, 'between 0 and 1')
  const line = optionalArray(raw.line, parseLinePoint, `${at}.line`)
  const [from, to] = line
  return {
    slope: finiteNumber(raw.slope_per_year, `${at}.slope_per_year`),
    p_value: pValue,
    significant: boolean(raw.significant, `${at}.significant`),
    line: line.length === 2 && from && to ? [from, to] : null,
  }
}

interface ParsedSeries {
  readonly trend: Trend
  readonly resolution_m: number | null
  readonly source_id: string | null
}

function parseSeries(value: unknown, at: string): ParsedSeries {
  const raw = object(value, at)
  const points = array(raw.points, `${at}.points`, parsePoint).sort((a, b) => a.year - b.year)
  return {
    trend: {
      series_id: nonEmptyString(raw.id, `${at}.id`),
      years: points.map((p) => p.year),
      values: points.map((p) => p.value),
      unit: nonEmptyString(raw.unit, `${at}.unit`),
      stats: parseStats(raw.trend, `${at}.trend`),
    },
    resolution_m: isFiniteNumber(raw.resolution_m) && raw.resolution_m > 0 ? raw.resolution_m : null,
    source_id: typeof raw.source_id === 'string' && raw.source_id !== '' ? raw.source_id : null,
  }
}

interface ListedSource extends DataSource {
  /** The backend's resolution, written for people: "30 m", "regional map, about ±1 km". */
  readonly resolution: string
}

function parseSource(value: unknown, at: string): ListedSource {
  const raw = object(value, at)
  return {
    id: nonEmptyString(raw.id, `${at}.id`),
    name: nonEmptyString(raw.name, `${at}.name`),
    url: typeof raw.url === 'string' && raw.url !== '' ? raw.url : null,
    nasa: boolean(raw.nasa, `${at}.nasa`),
    resolution: typeof raw.resolution === 'string' ? raw.resolution : '',
  }
}

/** A source the backend does not list counts as non-NASA data, so the app never claims NASA data it cannot confirm. */
function lookupSource(id: string, listed: ReadonlyMap<string, ListedSource>): ListedSource {
  return listed.get(id) ?? { id, name: id, url: null, nasa: false, resolution: '' }
}

/**
 * Source ids behind a check's grade: the backend names them in source_ids. Should it not, its chart's source,
 * or else the ones its grading rules use.
 */
function sourceIdsFor(id: CheckId, raw: JsonObject, series: ParsedSeries | undefined): string[] {
  const named = Array.isArray(raw.source_ids)
    ? raw.source_ids.filter((sourceId): sourceId is string => typeof sourceId === 'string' && sourceId !== '')
    : []
  if (named.length > 0) return [...new Set(named)]
  if (series?.source_id) return [series.source_id]
  const ids = [...CHECK_SOURCES[id]]
  const metrics = raw.metrics
  if (id === 'landslide' && isObject(metrics) && isFiniteNumber(metrics.susceptibility_class)) {
    ids.push(LANDSLIDE_SUSCEPTIBILITY_SOURCE)
  }
  return ids
}

function parseCheck(value: unknown, at: string, listed: ReadonlyMap<string, ListedSource>): Check {
  const raw = object(value, at)
  const id = oneOf(raw.id, CHECK_IDS, `${at}.id`)
  const messages = array(raw.messages, `${at}.messages`, parseMessage)
  if (messages.length === 0) throw new ReportFormatError(`${at}.messages`, 'a non-empty array')
  const series = optionalArray(raw.series, parseSeries, `${at}.series`)
  const first = series[0]
  const sources = sourceIdsFor(id, raw, first).map((sourceId) => lookupSource(sourceId, listed))
  const fromSources = sources
    .map((source) => resolutionMeters(source.resolution))
    .filter((meters): meters is number => meters !== null)
  const hasValues = first !== undefined && first.trend.values.some((v) => v !== null)

  return {
    id,
    grade: raw.grade === null ? null : oneOf(raw.grade, GRADES, `${at}.grade`),
    messages,
    resolution_m: fromSources.length > 0 ? Math.max(...fromSources) : (first?.resolution_m ?? null),
    sources: sources.map(({ id: sourceId, name, url, nasa }) => ({ id: sourceId, name, url, nasa })),
    is_nasa_data: sources.every((source) => source.nasa),
    trend: hasValues ? first.trend : null,
    verification: optionalArray(raw.verification, parseMessage, `${at}.verification`),
    metrics: parseMetrics(raw.metrics),
  }
}

/** The check's scalar metrics, as sent; anything else (objects, lists, null, NaN) is left out. */
function parseMetrics(value: unknown): Metrics {
  if (!isObject(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number | boolean | string] =>
        isFiniteNumber(entry[1]) || typeof entry[1] === 'boolean' || typeof entry[1] === 'string',
    ),
  )
}

/**
 * Validates a GET /api/report response at runtime and maps it into the app's types, so the UI never renders
 * a half-understood report. The parts every row needs (ids, grades, messages) must be right; the extras
 * (series, sources, second opinions) are read when they are there and well formed, and skipped when not.
 */
export function parseReport(value: unknown): Report {
  const raw = object(value, 'report')
  const listed = new Map(optionalArray(raw.sources, parseSource, 'sources').map((source) => [source.id, source]))
  return {
    location: parseLocation(raw.location, listed),
    mood: parseMood(raw.mood),
    checks: array(raw.checks, 'checks', (check, at) => parseCheck(check, at, listed)),
  }
}
