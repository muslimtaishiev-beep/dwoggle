import type { Trend, TrendPoint } from '../api/types.ts'
import { useI18n } from '../i18n/context.ts'
import { interpolate } from '../i18n/i18n.ts'
import { apiMessage, translateUnit } from '../i18n/summary.ts'
import { pValueText, slopeText } from '../report/trendText.ts'
import { StateMessage } from './StateMessage.tsx'
import './TrendChart.css'

interface TrendChartProps {
  trend: Trend | null
  checkName: string
  /** Fills {radius} in the series label ("Water seen within {radius} m"). */
  radiusM: number
}

// SVG user units; the chart scales to its container width.
const WIDTH = 320
const HEIGHT = 150
const PAD = { top: 16, right: 10, bottom: 16, left: 10 }
const POINT_SIZE = 5
// Max label sits above its line and min label below, where no data point can be.
const LABEL_GAP = 5
const LABEL_HEIGHT = 9

/** The years that have a value. */
function knownPoints(trend: Trend): TrendPoint[] {
  return trend.years.flatMap((year, i) => {
    const value = trend.values[i]
    return value === null || value === undefined ? [] : [{ year, value }]
  })
}

function isUsable(trend: Trend, known: readonly TrendPoint[]): boolean {
  const stats = trend.stats
  return (
    trend.years.length === trend.values.length &&
    known.length > 0 &&
    known.every((p) => Number.isFinite(p.year) && Number.isFinite(p.value)) &&
    (stats === null || [stats.slope, stats.p_value].every(Number.isFinite))
  )
}

/**
 * The backend's trend line. If it sent no line, its slope is drawn through the mean point,
 * so the line still shows the backend's number rather than a refit.
 */
function trendLine(trend: Trend, known: readonly TrendPoint[]): { x1: number; y1: number; x2: number; y2: number } | null {
  const stats = trend.stats
  if (stats === null) return null
  if (stats.line) {
    const [from, to] = stats.line
    return { x1: from.year, y1: from.value, x2: to.year, y2: to.value }
  }
  const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length
  const intercept = mean(known.map((p) => p.value)) - stats.slope * mean(known.map((p) => p.year))
  const firstYear = known[0]?.year ?? 0
  const lastYear = known[known.length - 1]?.year ?? firstYear
  return { x1: firstYear, y1: intercept + stats.slope * firstYear, x2: lastYear, y2: intercept + stats.slope * lastYear }
}

/** Runs of consecutive known years, so a missing year leaves a gap in the line instead of a false bridge. */
function runs(trend: Trend): TrendPoint[][] {
  const out: TrendPoint[][] = []
  let current: TrendPoint[] = []
  trend.years.forEach((year, i) => {
    const value = trend.values[i]
    if (value === null || value === undefined) {
      if (current.length > 0) out.push(current)
      current = []
    } else {
      current.push({ year, value })
    }
  })
  if (current.length > 0) out.push(current)
  return out
}

function extent(values: readonly number[]): [number, number] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = max > min ? (max - min) * 0.18 : Math.abs(max) * 0.1 || 1
  return [min - pad, max + pad]
}

export function TrendChart({ trend, checkName, radiusM }: TrendChartProps) {
  const i18n = useI18n()
  const { lang, t, formatNumber } = i18n

  // Trend data arrives with the report, so the report card owns the loading state.
  const known = trend === null ? [] : knownPoints(trend)
  if (trend === null || known.length === 0) {
    return <StateMessage kind="empty" message={t('trend.no_data')} />
  }
  if (!isUsable(trend, known)) {
    return <StateMessage kind="error" message={t('trend.error')} />
  }

  const unit = translateUnit(lang, trend.unit)
  const stats = trend.stats
  const line = trendLine(trend, known)
  const firstYear = trend.years[0] ?? 0
  const lastYear = trend.years[trend.years.length - 1] ?? firstYear
  const values = known.map((p) => p.value)
  const [yMin, yMax] = extent(line ? [...values, line.y1, line.y2] : values)
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  // What the dots are, in the backend's words for this series; the generic legend if it is a new series.
  const seriesLabel = apiMessage(lang, `series.${trend.series_id}`)
  const valuesLegend =
    (seriesLabel && interpolate(seriesLabel, { radius: radiusM }, lang)) || t('trend.legend_values')

  const x = (year: number) =>
    lastYear === firstYear
      ? WIDTH / 2
      : PAD.left + ((year - firstYear) / (lastYear - firstYear)) * (WIDTH - PAD.left - PAD.right)
  const y = (value: number) => PAD.top + ((yMax - value) / (yMax - yMin)) * (HEIGHT - PAD.top - PAD.bottom)

  const label = (value: number) => formatNumber(value, { maximumSignificantDigits: 3 })
  const points = known.map((p) => ({ year: p.year, cx: x(p.year), cy: y(p.value) }))

  return (
    <figure className="trend-chart">
      <svg
        className="trend-chart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={t('trend.chart_label', { check: checkName, from: firstYear, to: lastYear, unit })}
      >
        {[
          { value: dataMax, dy: -LABEL_GAP },
          { value: dataMin, dy: LABEL_GAP + LABEL_HEIGHT },
        ].map(({ value, dy }) => (
          <g key={dy}>
            <line className="trend-chart__grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(value)} y2={y(value)} />
            <text className="trend-chart__label" x={PAD.left} y={y(value) + dy}>
              {`${label(value)} ${unit}`}
            </text>
          </g>
        ))}
        {runs(trend).map((run) => (
          <polyline
            key={run[0]?.year}
            className="trend-chart__series"
            points={run.map((p) => `${x(p.year)},${y(p.value)}`).join(' ')}
          />
        ))}
        {points.map((p) => (
          <rect
            key={p.year}
            className="trend-chart__point"
            x={p.cx - POINT_SIZE / 2}
            y={p.cy - POINT_SIZE / 2}
            width={POINT_SIZE}
            height={POINT_SIZE}
          />
        ))}
        {line && (
          <line className="trend-chart__trend" x1={x(line.x1)} y1={y(line.y1)} x2={x(line.x2)} y2={y(line.y2)} />
        )}
      </svg>
      <div className="trend-chart__years" aria-hidden="true">
        <span>{formatNumber(firstYear)}</span>
        <span>{formatNumber(lastYear)}</span>
      </div>

      <figcaption className="trend-chart__legend">
        <span className="trend-chart__key trend-chart__key--values">{valuesLegend}</span>
        {line && <span className="trend-chart__key trend-chart__key--line">{t('trend.legend_line')}</span>}
      </figcaption>

      {stats === null ? (
        <p className="trend-chart__no-trend">{t('trend.no_trend')}</p>
      ) : (
        <dl className="trend-chart__stats">
          <div className="trend-chart__stat">
            <dt>{t('trend.slope')}</dt>
            <dd>{slopeText(stats, trend.unit, i18n)}</dd>
          </div>
          <div className="trend-chart__stat">
            <dt>{t('trend.p_value')}</dt>
            <dd>{pValueText(stats, i18n)}</dd>
          </div>
          <div className="trend-chart__stat">
            <dt>{t('trend.significant')}</dt>
            <dd>
              <span className={`trend-chart__sig trend-chart__sig--${stats.significant ? 'yes' : 'no'}`}>
                {stats.significant ? t('trend.yes') : t('trend.no')}
              </span>
            </dd>
          </div>
        </dl>
      )}
    </figure>
  )
}
