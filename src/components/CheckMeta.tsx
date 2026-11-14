import type { Check } from '../api/types.ts'
import { useI18n } from '../i18n/context.ts'
import { SOURCE_SHORT_NAMES } from '../report/sources.ts'
import './CheckMeta.css'

/** Resolution badge, the "non-NASA data" label when it applies, and the data source. */
export function CheckMeta({ check }: { check: Check }) {
  const { t, formatNumber } = useI18n()
  const meters = check.resolution_m
  const resolution =
    meters === null
      ? null
      : meters < 1000
        ? t('check.resolution_m', { n: formatNumber(meters) })
        : t('check.resolution_km', { n: formatNumber(meters / 1000, { maximumFractionDigits: 1 }) })
  const source = check.sources.map((s) => SOURCE_SHORT_NAMES[s.id] ?? s.name).join(' + ')
  const fullSource = check.sources.map((s) => s.name).join('; ')

  return (
    <span className="check-meta">
      {resolution && (
        <span className="check-meta__badge" title={t('check.resolution', { resolution })}>
          {resolution}
        </span>
      )}
      {!check.is_nasa_data && <span className="check-meta__badge check-meta__badge--warn">{t('check.non_nasa')}</span>}
      {source && (
        <span className="check-meta__source" title={fullSource}>
          {t('check.source', { source })}
        </span>
      )}
    </span>
  )
}
