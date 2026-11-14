import { useCallback, useEffect, useState } from 'react'
import type { Lang } from '../i18n/i18n.ts'
import { fetchReport, ReportRequestError, type ReportErrorKind } from './client.ts'
import type { LatLon, Report } from './types.ts'

export type ReportState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly kind: ReportErrorKind }
  | { readonly status: 'ready'; readonly report: Report }

type Settled = Extract<ReportState, { status: 'error' | 'ready' }>

const IDLE: ReportState = { status: 'idle' }
const LOADING: ReportState = { status: 'loading' }

function requestKey(point: LatLon, lang: Lang, attempt: number): string {
  return `${point.lat},${point.lon}|${lang}|${attempt}`
}

/**
 * Fetches the report for the tapped point. A new point, a retry or a language change starts a new request:
 * the place name comes back in the language asked for (the backend caches the rest).
 */
export function useReport(point: LatLon | null, lang: Lang): { state: ReportState; retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<{ key: string; state: Settled } | null>(null)

  useEffect(() => {
    if (point === null) return
    const key = requestKey(point, lang, attempt)
    const controller = new AbortController()
    fetchReport(point, lang, controller.signal).then(
      (report) => {
        if (!controller.signal.aborted) setSettled({ key, state: { status: 'ready', report } })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        const kind = error instanceof ReportRequestError ? error.kind : 'network'
        setSettled({ key, state: { status: 'error', kind } })
      },
    )
    return () => controller.abort()
  }, [point, lang, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // Loading is derived, not stored: a result only counts for the request that produced it.
  let state: ReportState
  if (point === null) state = IDLE
  else if (settled?.key !== requestKey(point, lang, attempt)) state = LOADING
  else state = settled.state

  return { state, retry }
}
