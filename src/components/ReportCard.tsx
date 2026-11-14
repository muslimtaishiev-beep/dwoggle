import { useState } from 'react'
import type { CheckId, Report } from '../api/types.ts'
import { useI18n } from '../i18n/context.ts'
import { sortChecks } from '../report/checks.ts'
import { Mascot } from './Mascot.tsx'
import { CheckRow } from './CheckRow.tsx'
import './ReportCard.css'

/** The summary: Dwoggle's mood, then every check in the fixed order with its chart one tap away. */
export function ReportCard({ report }: { report: Report }) {
  const { t } = useI18n()
  const [openId, setOpenId] = useState<CheckId | null>(null)

  return (
    <div className="report-card">
      <div className="report-card__mood">
        <Mascot pose={report.mood} size="portrait" />
        <p className="report-card__mood-text">{t(`bekem.alt.${report.mood}`)}</p>
      </div>
      <ul className="report-card__checks">
        {sortChecks(report.checks).map((check) => (
          <CheckRow
            key={check.id}
            check={check}
            radiusM={report.location.radius_m}
            open={openId === check.id}
            onToggle={() => setOpenId((current) => (current === check.id ? null : check.id))}
          />
        ))}
      </ul>
    </div>
  )
}
