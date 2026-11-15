import { API_BASE_URL } from '../config.ts'
import { REPORT_CHECK } from '../router.ts'
import type { Lang } from '../i18n/i18n.ts'
import type { ReportRecord } from '../report/pdf/buildReportPdf.ts'
import { parseReport } from './parseReport.ts'
import { CHECK_IDS, GRADES, type CheckId, type Grade } from './types.ts'

/** What anyone may see of a report by its number (GET /api/reports/{id}): when, where, the grades. */
export interface ReportCheck {
  readonly id: string
  readonly createdAt: string
  readonly lat: number
  readonly lon: number
  readonly place: string | null
  readonly grades: Readonly<Partial<Record<CheckId, Grade | null>>>
  readonly fingerprint: string
  /** The data itself, only for the report's owner. */
  readonly record: ReportRecord | null
}

export type ReportErrorCode = 'daily_limit' | 'not_found' | 'sign_in' | 'failed'

export class ReportError extends Error {
  readonly code: ReportErrorCode
  readonly limit: number | null

  constructor(code: ReportErrorCode, limit: number | null = null) {
    super(code)
    this.name = 'ReportError'
    this.code = code
    this.limit = limit
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseReportCheck(body: unknown): ReportCheck {
  if (!isRecord(body) || typeof body.id !== 'string' || typeof body.fingerprint !== 'string') throw new ReportError('failed')
  const grades: Partial<Record<CheckId, Grade | null>> = {}
  if (isRecord(body.grades)) {
    for (const id of CHECK_IDS) {
      const grade = body.grades[id]
      if ((GRADES as readonly unknown[]).includes(grade)) grades[id] = grade as Grade
      else if (grade === null) grades[id] = null
    }
  }
  const createdAt = typeof body.created_at === 'string' ? body.created_at : ''
  return {
    id: body.id,
    createdAt,
    lat: typeof body.lat === 'number' ? body.lat : 0,
    lon: typeof body.lon === 'number' ? body.lon : 0,
    place: typeof body.place === 'string' ? body.place : null,
    grades,
    fingerprint: body.fingerprint,
    record: body.report === undefined ? null : { id: body.id, createdAt, fingerprint: body.fingerprint, report: parseReport(body.report) },
  }
}

async function call(path: string, init: RequestInit, token: string | null): Promise<ReportCheck> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
  } catch {
    throw new ReportError('failed')
  }
  const body: unknown = await response.json().catch(() => null)
  if (response.ok) return parseReportCheck(body)
  if (response.status === 401) throw new ReportError('sign_in')
  if (response.status === 404) throw new ReportError('not_found')
  const detail = isRecord(body) && isRecord(body.detail) ? body.detail : {}
  if (response.status === 429 && detail.code === 'reports_daily_limit') {
    throw new ReportError('daily_limit', typeof detail.limit === 'number' ? detail.limit : null)
  }
  throw new ReportError('failed')
}

/** Gather everything about a place into a numbered report (takes up to about a minute). */
export function createReport(token: string, point: { lat: number; lon: number }, lang: Lang): Promise<ReportCheck> {
  return call('/reports', { method: 'POST', body: JSON.stringify({ lat: point.lat, lon: point.lon, lang }) }, token)
}

/** Check a report by its number; with the owner's token, its data comes too. */
export function checkReport(id: string, token: string | null): Promise<ReportCheck> {
  return call(`/reports/${encodeURIComponent(id)}`, { method: 'GET' }, token)
}

/** The address that checks a report: what its QR code holds. */
export function verifyUrl(id: string): string {
  return `${window.location.origin}${REPORT_CHECK}${id}`
}

const REPORT_CHECK_START = new RegExp(`^${REPORT_CHECK}`)

/** The number in /r/DW-2026-AB12CD, or null when the address holds no number of that shape. */
export function reportIdOf(path: string): string | null {
  let id: string
  try {
    id = decodeURIComponent(path.replace(REPORT_CHECK_START, '').replace(/\/$/, '')).toUpperCase()
  } catch {
    return null
  }
  return /^DW-\d{4}-[A-Z0-9]{6}$/.test(id) ? id : null
}
