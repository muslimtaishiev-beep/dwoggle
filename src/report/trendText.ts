import type { TrendStats } from '../api/types.ts'
import type { I18nContextValue } from '../i18n/context.ts'
import { translateUnit } from '../i18n/summary.ts'

type TrendI18n = Pick<I18nContextValue, 'lang' | 't' | 'formatNumber'>

/** "+0.062 °C per year": the slope with its unit. Slope is always per year. */
export function slopeText(stats: TrendStats, unit: string, { lang, t, formatNumber }: TrendI18n): string {
  const slope = formatNumber(stats.slope, { maximumSignificantDigits: 2, signDisplay: 'exceptZero' })
  return t('trend.slope_value', { slope, unit: translateUnit(lang, unit) })
}

/** The p-value as shown to people: very small values read "below 0.001". */
export function pValueText(stats: TrendStats, { t, formatNumber }: TrendI18n): string {
  return stats.p_value < 0.001
    ? t('trend.p_value_below', { p: formatNumber(0.001) })
    : formatNumber(stats.p_value, { maximumFractionDigits: 3 })
}
