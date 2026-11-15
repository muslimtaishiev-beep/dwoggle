import { API_BASE_URL } from '../config.ts'
import type { Lang } from '../i18n/i18n.ts'
import { parseReport } from './parseReport.ts'
import type { LatLon, Report } from './types.ts'

/** outside: the backend has no data for that place (outside Kyrgyzstan's border); trying again cannot help. */
export type ReportErrorKind = 'network' | 'server' | 'format' | 'busy' | 'outside'

export class ReportRequestError extends Error {
  readonly kind: ReportErrorKind

  constructor(kind: ReportErrorKind, message: string) {
    super(message)
    this.name = 'ReportRequestError'
    this.kind = kind
  }
}

/** The backend's 422 for a point outside the area it covers: { detail: { code: "outside_coverage", … } }. */
export function isOutsideCoverage(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false
  const detail = (body as { detail?: unknown }).detail
  return typeof detail === 'object' && detail !== null && (detail as { code?: unknown }).code === 'outside_coverage'
}

/** GET /api/report. In development, vite.config.ts sends /api to the backend or to the mock. */
export async function fetchReport(point: LatLon, lang: Lang, signal: AbortSignal): Promise<Report> {
  const url = new URL(`${API_BASE_URL}/report`, window.location.href)
  url.searchParams.set('lat', point.lat.toFixed(6))
  url.searchParams.set('lon', point.lon.toFixed(6))
  // The place name comes back in this language. The backend's own sentences are not shown: every sentence is
  // built here from its message keys.
  url.searchParams.set('lang', lang)

  let response: Response
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (signal.aborted) throw error
    throw new ReportRequestError('network', String(error))
  }
  // Too many checks in a row from this visitor: the backend asks to wait a minute.
  if (response.status === 429) throw new ReportRequestError('busy', 'HTTP 429')
  if (!response.ok) {
    // The map only sends taps inside Kyrgyzstan's box; the backend then checks the real border.
    const refusal: unknown = response.status === 422 ? await response.json().catch(() => null) : null
    if (isOutsideCoverage(refusal)) throw new ReportRequestError('outside', 'No data for this place')
    throw new ReportRequestError('server', `HTTP ${response.status}`)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    if (signal.aborted) throw error
    throw new ReportRequestError('format', 'Response is not JSON')
  }
  try {
    return parseReport(body)
  } catch (error) {
    throw new ReportRequestError('format', error instanceof Error ? error.message : String(error))
  }
}
