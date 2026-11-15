import type { Alignment, Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import { GRADES, type Check, type Grade, type Report } from '../../api/types.ts'
import type { I18nContextValue } from '../../i18n/context.ts'
import { buildMessage, buildSummary } from '../../i18n/summary.ts'
import { adviceFor, checkFact, PANEL_ORDER, reportSummary } from '../facts.ts'
import { slopeText } from '../trendText.ts'
import { chartSvg } from './chartSvg.ts'
import { mapImage } from './mapImage.ts'

type I18n = Pick<I18nContextValue, 'lang' | 't' | 'formatNumber'>

/** What the backend gave the report when it was made (POST /api/reports). */
export interface ReportRecord {
  readonly id: string
  readonly createdAt: string
  readonly fingerprint: string
  readonly report: Report
}

// The app's colours, as plain values: a PDF has no CSS variables.
const INK = '#3b2519'
const TEXT = '#5c4f46'
const MUTED = '#918982'
const LINE = '#ddd9d6'
const CREAM = '#f9f0e7'
const BROWN = '#86573b'
const GRADE_COLOUR: Record<Grade, string> = { A: '#5a9f4f', B: '#8fb15d', C: '#e6a23f', D: '#ce6142' }

async function dataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function fontBase64(url: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function resolutionText(check: Check, { t, formatNumber }: I18n): string | null {
  const meters = check.resolution_m
  if (meters === null) return null
  return meters < 1000
    ? t('check.resolution_m', { n: formatNumber(meters) })
    : t('check.resolution_km', { n: formatNumber(meters / 1000, { maximumFractionDigits: 1 }) })
}

function gradeBox(grade: Grade | null, t: I18n['t']): Content {
  return {
    table: { widths: [22], body: [[{ text: grade ?? '–', alignment: 'center', bold: true, color: '#ffffff', fontSize: 12, margin: [0, 2, 0, 2] }]] },
    layout: { fillColor: () => (grade ? GRADE_COLOUR[grade] : '#b9b0a6'), hLineWidth: () => 0, vLineWidth: () => 0 },
    ...(grade ? {} : { title: t('grade.none') }),
  }
}

/** One check: its grade, what was found, what to do, a chart per yearly series, the second opinions, its sources. */
function checkSection(check: Check, report: Report, i18n: I18n): Content[] {
  const { t, lang, formatNumber } = i18n
  const advice = adviceFor(check, i18n)
  const out: Content[] = [
    {
      columns: [
        { width: 'auto', stack: [gradeBox(check.grade, t)] },
        {
          width: '*',
          margin: [10, 0, 0, 0],
          stack: [
            { text: t(`check.${check.id}`), style: 'h2' },
            { text: check.grade ? t(`grade.${check.grade}`) : t('grade.none'), color: TEXT },
          ],
        },
      ],
      margin: [0, 14, 0, 6],
    },
    { text: t('pdf.found'), style: 'label' },
    { text: buildSummary(check, lang).text, margin: [0, 0, 0, 6] },
  ]
  if (advice) out.push({ text: t('pdf.todo'), style: 'label' }, { text: advice, margin: [0, 0, 0, 6] })
  for (const series of check.series) {
    const label = buildMessage({ key: `series.${series.series_id}`, params: { radius: report.location.radius_m } }, lang).text
    const change = series.stats
      ? t('pdf.change', {
          slope: slopeText(series.stats, series.unit, { lang, t, formatNumber }),
          significance: t(series.stats.significant ? 'pdf.significant' : 'pdf.not_significant'),
        })
      : t('trend.no_trend')
    out.push({
      unbreakable: true,
      stack: [
        { text: label, bold: true, color: INK, margin: [0, 6, 0, 2] },
        { svg: chartSvg(series, (value, digits) => formatNumber(value, { maximumFractionDigits: digits })), width: 480 },
        { text: change, fontSize: 9, color: TEXT, margin: [0, 2, 0, 4] },
      ],
    })
  }
  if (check.verification.length > 0) {
    out.push(
      { text: t('pdf.second_opinion'), style: 'label' },
      { ul: check.verification.map((message) => buildMessage(message, lang).text), margin: [0, 0, 0, 6] },
    )
  }
  const resolution = resolutionText(check, i18n)
  out.push({
    text: [
      { text: `${t('pdf.sources')}: `, bold: true },
      check.sources.map((source) => source.name).join('; '),
      resolution ? ` (${t('pdf.resolution', { value: resolution })})` : '',
      check.is_nasa_data ? '' : ` — ${t('pdf.not_nasa')}`,
    ],
    fontSize: 8,
    color: MUTED,
    margin: [0, 2, 0, 0],
  })
  return out
}

/**
 * The full report as a PDF document, in the reader's language. Everything in it comes from the data the backend
 * kept under the report's number; the QR code leads to the page where anyone can check that number.
 */
export async function buildReportPdf(record: ReportRecord, i18n: I18n, verifyUrl: string): Promise<{ download: (name: string) => Promise<void> }> {
  const { t, lang, formatNumber } = i18n
  const { report } = record
  const [pdfMake, regular, bold, logo, map] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    fontBase64('/fonts/NotoSans-Regular.ttf'),
    fontBase64('/fonts/NotoSans-Bold.ttf'),
    dataUrl('/brand/dwoggle-head.png'),
    mapImage(report.location, report.location.radius_m),
  ])
  const maker = pdfMake.default ?? pdfMake
  maker.addVirtualFileSystem({ 'NotoSans-Regular.ttf': regular, 'NotoSans-Bold.ttf': bold })
  maker.addFonts({ NotoSans: { normal: 'NotoSans-Regular.ttf', bold: 'NotoSans-Bold.ttf', italics: 'NotoSans-Regular.ttf', bolditalics: 'NotoSans-Bold.ttf' } })

  const made = new Date(record.createdAt)
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short' }).format(made)
  const coordinate = (value: number) => formatNumber(value, { minimumFractionDigits: 5, maximumFractionDigits: 5 })
  const checks = PANEL_ORDER.flatMap((id) => report.checks.filter((check) => check.id === id))

  const content: Content[] = [
    {
      columns: [
        logo ? { image: logo, width: 46 } : { text: '' },
        {
          width: '*',
          margin: [10, 2, 0, 0],
          stack: [
            { text: t('pdf.heading'), style: 'h1' },
            { text: t('adv.number', { id: record.id }), bold: true, color: BROWN },
          ],
        },
        { width: 'auto', qr: verifyUrl, fit: 78, foreground: INK },
      ],
    },
    { text: t('pdf.made', { date }), color: TEXT, fontSize: 9, margin: [0, 8, 0, 10] },
    {
      table: {
        widths: [130, '*'],
        body: [
          [{ text: t('pdf.place'), style: 'label' }, report.location.place?.display ?? t('pdf.no_place')],
          [{ text: t('pdf.coordinates'), style: 'label' }, `${coordinate(report.location.lat)}, ${coordinate(report.location.lon)}`],
          [{ text: t('pdf.area'), style: 'label' }, t('pdf.area_value', { radius: report.location.radius_m })],
        ],
      },
      layout: 'noBorders',
    },
    ...(map ? [{ image: map, width: 515, margin: [0, 10, 0, 0] } as Content] : []),
    {
      table: { widths: ['*'], body: [[{ stack: [{ text: t('pdf.notice_title'), bold: true }, { text: t('pdf.notice') }], margin: [8, 6, 8, 6] }]] },
      layout: { fillColor: () => CREAM, hLineWidth: () => 0, vLineWidth: () => 0 },
      margin: [0, 12, 0, 0],
    },
    { text: t('pdf.summary'), style: 'h2', margin: [0, 16, 0, 6] },
    { text: reportSummary(report, i18n), margin: [0, 0, 0, 8] },
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['auto', 'auto', '*', '*'],
        body: [
          [t('pdf.table.check'), t('pdf.table.grade'), t('pdf.table.meaning'), t('pdf.table.fact')].map((text) => ({ text, style: 'label' })),
          ...checks.map((check): TableCell[] => [
            { text: t(`check.${check.id}`), bold: true },
            { text: check.grade ?? '–', bold: true, color: check.grade ? GRADE_COLOUR[check.grade] : MUTED, alignment: 'center' as Alignment },
            check.grade ? t(`grade.${check.grade}`) : t('grade.none'),
            checkFact(check, i18n) ?? '',
          ]),
        ],
      },
      layout: { hLineColor: () => LINE, vLineWidth: () => 0, hLineWidth: (i: number) => (i === 0 ? 0 : 0.6), paddingTop: () => 4, paddingBottom: () => 4 },
    },
    ...checks.flatMap((check) => checkSection(check, report, i18n)),
    { text: t('pdf.grades'), style: 'h2', margin: [0, 18, 0, 6] },
    { ul: GRADES.map((grade) => `${grade}: ${t(`grade.${grade}`)}`) },
    { text: t('app.disclaimer'), color: TEXT, margin: [0, 8, 0, 0] },
    { text: t('pdf.check_it', { url: verifyUrl }), fontSize: 9, color: TEXT, margin: [0, 14, 0, 2] },
    { text: [{ text: `${t('pdf.fingerprint')}: `, bold: true }, record.fingerprint], fontSize: 7, color: MUTED },
  ]

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    info: { title: `${t('pdf.heading')} ${record.id}`, author: 'Dwoggle', creator: 'Dwoggle' },
    defaultStyle: { font: 'NotoSans', fontSize: 10, color: INK, lineHeight: 1.25 },
    styles: {
      h1: { fontSize: 20, bold: true, color: INK },
      h2: { fontSize: 14, bold: true, color: INK },
      label: { bold: true, color: TEXT, fontSize: 9, margin: [0, 2, 0, 1] },
    },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: t('adv.number', { id: record.id }), fontSize: 8, color: MUTED },
        { text: t('pdf.page', { page, pages }), fontSize: 8, color: MUTED, alignment: 'right' },
      ],
      margin: [40, 16, 40, 0],
    }),
    content,
  }
  const pdf = maker.createPdf(doc)
  return { download: (name: string) => pdf.download(name) }
}
