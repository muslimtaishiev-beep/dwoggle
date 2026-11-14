import type { Check } from '../api/types.ts'
import { useI18n } from '../i18n/context.ts'
import { buildSummary } from '../i18n/summary.ts'
import { CheckMeta } from './CheckMeta.tsx'
import { GradeBadge } from './GradeBadge.tsx'
import { PixelIcon } from './PixelIcon.tsx'
import { TrendChart } from './TrendChart.tsx'
import './CheckRow.css'

interface CheckRowProps {
  check: Check
  /** The analysis circle, for chart labels such as "water seen within 300 m". */
  radiusM: number
  open: boolean
  onToggle: () => void
}

/** One row of the summary report. Rows with a trend open their 25-year chart. */
export function CheckRow({ check, radiusM, open, onToggle }: CheckRowProps) {
  const { lang, t } = useI18n()
  const name = t(`check.${check.id}`)
  const summary = buildSummary(check, lang)
  const chartId = `trend-chart-${check.id}`

  const content = (
    <>
      <GradeBadge grade={check.grade} />
      <span className="check-row__text">
        <span className="check-row__name display">{name}</span>
        <span className={`check-row__summary${summary.translated ? '' : ' check-row__summary--raw'}`}>
          {summary.text}
        </span>
        <CheckMeta check={check} />
      </span>
    </>
  )

  if (check.trend === null) {
    return (
      <li className="check-row">
        <div className="check-row__main">{content}</div>
      </li>
    )
  }

  return (
    <li className="check-row">
      <button
        type="button"
        className="check-row__main check-row__main--toggle"
        aria-expanded={open}
        aria-controls={open ? chartId : undefined}
        title={t('check.toggle_chart')}
        onClick={onToggle}
      >
        {content}
        <span className="check-row__chevron">
          <PixelIcon name={open ? 'chevron-up' : 'chevron-down'} />
        </span>
      </button>
      {open && (
        <div id={chartId} className="check-row__chart">
          <TrendChart trend={check.trend} checkName={name} radiusM={radiusM} />
        </div>
      )}
    </li>
  )
}
