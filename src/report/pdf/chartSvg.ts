import type { Trend } from '../../api/types.ts'

/** Colours of the printed charts: the app's own, as plain values (a PDF has no CSS variables). */
const INK = '#3b2519'
const MUTED = '#918982'
const LINE = '#ddd9d6'
const BAR = '#c7ae99'
const TREND = '#ce6142'

const W = 480
const H = 150
const PAD = { top: 10, right: 8, bottom: 22, left: 40 }

/** A level's value in the reader's own number format, with as many decimals as its size needs. */
export type FormatLevel = (value: number, digits: number) => string

const plainLevel: FormatLevel = (value, digits) => String(Number(value.toFixed(digits)))

function niceNumber(value: number, format: FormatLevel): string {
  const abs = Math.abs(value)
  return format(value, abs >= 100 ? 0 : abs >= 1 ? 1 : 3)
}

/**
 * One yearly series as an SVG bar chart for the PDF: a bar per year (a gap where there is no value), and the
 * backend's trend line over it when it sent one. Plain SVG with fixed colours, so it prints the same everywhere.
 */
export function chartSvg(trend: Trend, format: FormatLevel = plainLevel): string {
  const points = trend.years.map((year, i) => ({ year, value: trend.values[i] ?? null }))
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]))
  const line = trend.stats?.line ?? null
  const all = [...values, ...(line ? line.map((p) => p.value) : [])]
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  // Bars start from zero when every value is positive and zero is not far below; otherwise from just under the lowest.
  if (lo > 0 && lo < hi * 0.6) lo = 0
  if (hi === lo) hi = lo + 1
  const span = hi - lo
  lo -= lo === 0 ? 0 : span * 0.08
  hi += span * 0.08

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const first = points[0]?.year ?? 0
  const last = points.at(-1)?.year ?? first
  const years = Math.max(1, last - first + 1)
  const slot = innerW / years
  const x = (year: number) => PAD.left + (year - first + 0.5) * slot
  const y = (value: number) => PAD.top + innerH - ((value - lo) / (hi - lo)) * innerH

  const parts: string[] = []
  // Three level lines with their values.
  for (const level of [lo, (lo + hi) / 2, hi]) {
    const ly = y(level).toFixed(1)
    parts.push(`<line x1="${PAD.left}" y1="${ly}" x2="${W - PAD.right}" y2="${ly}" stroke="${LINE}" stroke-width="0.6"/>`)
    parts.push(`<text x="${PAD.left - 4}" y="${(Number(ly) + 3).toFixed(1)}" font-size="8" fill="${MUTED}" text-anchor="end">${niceNumber(level, format)}</text>`)
  }
  const barW = Math.max(2, slot * 0.68)
  for (const p of points) {
    if (p.value === null) continue
    const top = y(Math.max(p.value, lo))
    const base = y(lo)
    parts.push(`<rect x="${(x(p.year) - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0.6, base - top).toFixed(1)}" fill="${BAR}"/>`)
  }
  if (line) {
    const [a, b] = line
    parts.push(`<line x1="${x(a.year).toFixed(1)}" y1="${y(a.value).toFixed(1)}" x2="${x(b.year).toFixed(1)}" y2="${y(b.value).toFixed(1)}" stroke="${TREND}" stroke-width="2" stroke-linecap="round"/>`)
  }
  // Years along the bottom: every fifth, and the last.
  for (const p of points) {
    if ((p.year - first) % 5 !== 0 && p.year !== last) continue
    parts.push(`<text x="${x(p.year).toFixed(1)}" y="${H - 6}" font-size="8" fill="${MUTED}" text-anchor="middle">${p.year}</text>`)
  }
  parts.push(`<line x1="${PAD.left}" y1="${y(lo).toFixed(1)}" x2="${W - PAD.right}" y2="${y(lo).toFixed(1)}" stroke="${INK}" stroke-width="0.8"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`
}
