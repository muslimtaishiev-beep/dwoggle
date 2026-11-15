import type { Check, Metrics, Report, Trend } from '../api/types.ts'
import type { I18nContextValue } from '../i18n/context.ts'
import { apiMessage, buildSummary, translateUnit } from '../i18n/summary.ts'
import { adviceFor, checkFact, PANEL_ORDER, reportSummary } from './facts.ts'
import { SOURCE_SHORT_NAMES } from './sources.ts'

/**
 * The open report, written out for Dwoggle's live answers (POST /api/chat): the same sentences the map panel shows,
 * in the visitor's language, with the plain numbers behind them. Small (a few kilobytes), and built the same way
 * every time for the same report and language, so the backend's cached copy of it keeps holding.
 */
type I18n = Pick<I18nContextValue, 'lang' | 't' | 'formatNumber'>

export interface ChatSeries {
  readonly name: string
  readonly unit: string
  readonly first: { readonly year: number; readonly value: number } | null
  readonly last: { readonly year: number; readonly value: number } | null
  /** Change per year by Sen's slope; null without a trend. */
  readonly change_per_year: number | null
  /** Whether the trend is statistically clear (Mann-Kendall p < 0.05). */
  readonly clear_trend: boolean | null
}

export interface ChatCheck {
  readonly id: string
  readonly name: string
  /** A to D, or null when there is no data for this area. */
  readonly grade: string | null
  readonly grade_meaning: string
  /** What was found: the check's own sentences, as the panel shows them. */
  readonly found: string
  readonly short_fact: string | null
  readonly advice: string | null
  readonly numbers: Metrics
  readonly series: readonly ChatSeries[]
  readonly sources: readonly string[]
  readonly nasa_data: boolean
}

export interface ChatReport {
  readonly place: string | null
  readonly lat: number
  readonly lon: number
  readonly radius_m: number
  readonly summary: string
  readonly checks: readonly ChatCheck[]
  readonly note: string
}

function point(trend: Trend, index: number): { year: number; value: number } | null {
  const value = trend.values[index]
  const year = trend.years[index]
  return value === null || value === undefined || year === undefined ? null : { year, value: Math.round(value * 100) / 100 }
}

function series(trend: Trend, lang: I18n['lang']): ChatSeries {
  const indexes = trend.values.flatMap((value, index) => (value === null ? [] : [index]))
  const first = indexes[0]
  const last = indexes[indexes.length - 1]
  return {
    name: apiMessage(lang, `series.${trend.series_id}`) ?? trend.series_id,
    unit: translateUnit(lang, trend.unit),
    first: first === undefined ? null : point(trend, first),
    last: last === undefined ? null : point(trend, last),
    change_per_year: trend.stats ? Math.round(trend.stats.slope * 1000) / 1000 : null,
    clear_trend: trend.stats ? trend.stats.significant : null,
  }
}

function chatCheck(check: Check, i18n: I18n): ChatCheck {
  const { t, lang } = i18n
  return {
    id: check.id,
    name: t(`check.${check.id}`),
    grade: check.grade,
    grade_meaning: check.grade === null ? t('grade.none') : t(`grade.${check.grade}`),
    found: buildSummary(check, lang).text,
    short_fact: checkFact(check, i18n),
    advice: adviceFor(check, i18n),
    numbers: check.metrics,
    series: check.series.map((trend) => series(trend, lang)),
    sources: check.sources.map((source) => SOURCE_SHORT_NAMES[source.id] ?? source.name),
    nasa_data: check.is_nasa_data,
  }
}

export function chatReport(report: Report, i18n: I18n): ChatReport {
  const checks = PANEL_ORDER.flatMap((id) => report.checks.filter((check) => check.id === id))
  return {
    place: report.location.place?.display ?? null,
    lat: report.location.lat,
    lon: report.location.lon,
    radius_m: report.location.radius_m,
    summary: reportSummary(report, i18n),
    checks: checks.map((check) => chatCheck(check, i18n)),
    note: i18n.t('app.disclaimer'),
  }
}
