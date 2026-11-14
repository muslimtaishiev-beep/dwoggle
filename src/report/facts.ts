import { GRADES, type Check, type CheckId, type Grade, type Report } from '../api/types.ts'
import type { I18nContextValue } from '../i18n/context.ts'
import { lookupMessage } from '../i18n/i18n.ts'
import { buildMessage, buildSummary } from '../i18n/summary.ts'

/**
 * Short texts the map panel and Dwoggle's answers are made of, built only from what the report says.
 * Wording rules: risk signals, never "safe" or "dangerous", never permission; "this area", never "plot".
 */
type I18n = Pick<I18nContextValue, 'lang' | 't' | 'formatNumber'>

const number = (check: Check, name: string): number | null => {
  const value = check.metrics[name]
  return typeof value === 'number' ? value : null
}

// The backend grades a slope by its 90th percentile: under 8° A, 8 to 15° B, 15 to 25° C, 25° and more D.
const SLOPE_BREAKS_DEG = [8, 15, 25] as const

/** The one short fact beside a check's grade ("fault 1.3 km away"), from the backend's numbers; null without one. */
export function checkFact(check: Check, { t, formatNumber }: I18n): string | null {
  if (check.grade === null) return null
  switch (check.id) {
    case 'earthquake': {
      const km = number(check, 'distance_km')
      return km === null ? null : t('fact.fault_km', { km: formatNumber(km, { maximumFractionDigits: km < 10 ? 1 : 0 }) })
    }
    case 'flood': {
      const years = number(check, 'years_with_water')
      const total = number(check, 'years_observed')
      if (years !== null && total !== null && years > 0) return t('fact.water_years', { n: years, total })
      if (check.metrics.mudflow_path === true) return t('fact.mudflow')
      if (check.metrics.low_lying === true) return t('fact.low_ground')
      return years === 0 ? t('fact.no_water') : null
    }
    case 'landslide': {
      const slope = number(check, 'slope_p90_deg')
      if (slope === null) return null
      const step = SLOPE_BREAKS_DEG.filter((limit) => slope >= limit).length
      return t((['fact.slope_gentle', 'fact.slope_moderate', 'fact.slope_steep', 'fact.slope_very_steep'] as const)[step] ?? 'fact.slope_very_steep')
    }
    case 'heat': {
      const perYear = check.trend?.stats?.slope ?? null
      if (perYear === null) return null
      const change = formatNumber(perYear * 10, { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
      return t('fact.heat_decade', { change })
    }
    case 'green': {
      const pct = number(check, 'change_pct')
      const p = number(check, 'p_value')
      if (pct === null) return null
      if (Math.abs(pct) < 5 || (p !== null && p >= 0.05)) return t('fact.green_same')
      const amount = formatNumber(Math.abs(pct), { maximumFractionDigits: 0 })
      return t(pct > 0 ? 'fact.green_up' : 'fact.green_down', { pct: amount })
    }
  }
}

/** The order of the map panel, as the designer lists the checks: the hazards first, the greenery last. */
export const PANEL_ORDER: readonly CheckId[] = ['earthquake', 'flood', 'landslide', 'heat', 'green']

const severity = (grade: Grade | null) => (grade === null ? -1 : GRADES.indexOf(grade))
const inPanelOrder = (checks: readonly Check[]) =>
  [...checks].sort((a, b) => PANEL_ORDER.indexOf(a.id) - PANEL_ORDER.indexOf(b.id))

/** The checks that show warning signs (C or D), worst first, then in the panel's order. */
export function warningChecks(report: Report): Check[] {
  return inPanelOrder(report.checks)
    .filter((check) => check.grade === 'C' || check.grade === 'D')
    .sort((a, b) => severity(b.grade) - severity(a.grade))
}

/** The check with the worst grade, which Dwoggle offers to explain first; null when nothing is graded. */
export function worstCheck(report: Report): Check | null {
  const graded = inPanelOrder(report.checks).filter((check) => check.grade !== null)
  return graded.sort((a, b) => severity(b.grade) - severity(a.grade))[0] ?? null
}

/**
 * "earthquake and flood", in the reader's language. The browser's list rules are used where it has them for this
 * language; where it does not (Kyrgyz in some browsers) the names are joined with the translated "and".
 */
function checkList(checks: readonly Check[], { lang, t }: I18n): string {
  const names = checks.map((check) => t(`check.${check.id}`).toLocaleLowerCase(lang))
  if (Intl.ListFormat.supportedLocalesOf(lang).length > 0) return new Intl.ListFormat(lang, { type: 'conjunction' }).format(names)
  const last = names.pop()
  return names.length === 0 ? (last ?? '') : `${names.join(', ')} ${t('list.and')} ${last}`
}

/**
 * What to do about a check's grade, in one line: the app's own advice for that check and grade
 * (`advice.<check>.<grade>` in the translations file), where it has one. The backend's advice (how to build near
 * a fault) is already among the check's own sentences.
 */
export function adviceFor(check: Check, { lang }: Pick<I18n, 'lang'>): string | null {
  return check.grade === null ? null : (lookupMessage(lang, `advice.${check.id}.${check.grade}`) ?? null)
}

/** All the advice that goes with the warning signs: the backend's sentences and the app's lines. */
function advice(report: Report, i18n: I18n): string[] {
  return warningChecks(report).flatMap((check) => [
    ...check.messages
      .filter((message) => message.key.includes('advice'))
      .map((message) => buildMessage(message, i18n.lang))
      .filter((sentence) => sentence.translated)
      .map((sentence) => sentence.text),
    ...[adviceFor(check, i18n)].filter((line): line is string => line !== null),
  ])
}

/** The panel's lead: which checks show warning signs. The advice that comes with them is Dwoggle's to tell. */
export function reportSummary(report: Report, i18n: I18n): string {
  const { t } = i18n
  if (report.checks.every((check) => check.grade === null)) return t('report.no_data')
  const warnings = warningChecks(report)
  return warnings.length === 0 ? t('panel.no_signals') : t('panel.signals', { list: checkList(warnings, i18n) })
}

/** "Why is earthquake a D?": the check's own sentences. */
export function whyAnswer(check: Check, { lang }: I18n): string {
  return buildSummary(check, lang).text
}

/** "Can I build here?": the signals and their advice, and who can actually say yes. */
export function buildAnswer(report: Report, i18n: I18n): string {
  const { t } = i18n
  const warnings = warningChecks(report)
  const signals = warnings.length === 0 ? t('panel.no_signals') : t('panel.signals', { list: checkList(warnings, i18n) })
  return [t('ask.build.lead'), signals, ...advice(report, i18n), t('ask.build.next')].join(' ')
}
