import type { Grade, Report } from '../api/types.ts'
import type { ReportState } from '../api/useReport.ts'
import { LineIcon } from '../brand/LineIcon.tsx'
import { useI18n } from '../i18n/context.ts'
import { checkFact, PANEL_ORDER, reportSummary } from '../report/facts.ts'
import { StateMessage } from './StateMessage.tsx'
import './ReportPanel.css'


interface ReportPanelProps {
  state: Exclude<ReportState, { status: 'idle' }>
  saved: boolean
  /** A short note after sharing ("Link copied"), or null. */
  note: string | null
  onSave: () => void
  onShare: (report: Report) => void
  onRetry: () => void
  onClose: () => void
}

function PanelGrade({ grade }: { grade: Grade | null }) {
  const { t } = useI18n()
  const meaning = grade ? t('grade.label', { grade, meaning: t(`grade.${grade}`) }) : t('grade.none')
  return (
    <span className={`panel-grade panel-grade--${grade?.toLowerCase() ?? 'none'}`} title={meaning}>
      <span aria-hidden="true">{grade ?? '–'}</span>
      <span className="visually-hidden">{meaning}</span>
    </span>
  )
}

/**
 * The tapped area at a glance, beside the map: where it is, what the checks found, one short fact and the grade
 * for each, and saving or sharing it. The layered figure behind "Layers" tells the longer story.
 */
export function ReportPanel({ state, saved, note, onSave, onShare, onRetry, onClose }: ReportPanelProps) {
  const i18n = useI18n()
  const { t, formatNumber } = i18n
  const report = state.status === 'ready' ? state.report : null
  const place = report?.location.place ?? null
  const title = place ? t('panel.near', { place: place.name }) : t('report.title')
  const coordinate = (value: number) => formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <section className="report-panel" aria-labelledby="report-panel-title" aria-busy={state.status === 'loading'}>
      <header className="report-panel__head">
        <div>
          <h2 id="report-panel-title" className={`report-panel__title brand-display${title.length > 20 ? ' report-panel__title--long' : ''}`}>
            {title}
          </h2>
          {report && (
            <p className="report-panel__where">
              {t('report.location', {
                radius: report.location.radius_m,
                lat: coordinate(report.location.lat),
                lon: coordinate(report.location.lon),
              })}
            </p>
          )}
        </div>
        <button type="button" className="report-panel__close" aria-label={t('report.close')} onClick={onClose}>
          <LineIcon name="close" size={18} />
        </button>
      </header>

      {state.status === 'loading' && <StateMessage kind="loading" message={t('report.loading')} />}
      {state.status === 'error' && (
        <StateMessage
          kind="error"
          message={t(`report.error.${state.kind}`)}
          action={
            <button type="button" className="brand-button report-panel__retry" onClick={onRetry}>
              {t('report.retry')}
            </button>
          }
        />
      )}

      {report && (
        <>
          <p className="report-panel__summary">{reportSummary(report, i18n)}</p>
          <ul className="report-panel__checks">
            {PANEL_ORDER.map((id) => {
              const check = report.checks.find((item) => item.id === id)
              if (!check) return null
              const fact = checkFact(check, i18n)
              return (
                <li key={id} className="report-panel__check">
                  <span className="report-panel__icon">
                    <LineIcon name={id} size={18} />
                  </span>
                  <span className="report-panel__name">{t(`check.${id}`)}</span>
                  <span className="report-panel__fact">{fact ?? (check.grade === null ? t('grade.none') : '')}</span>
                  <PanelGrade grade={check.grade} />
                </li>
              )
            })}
          </ul>
          <div className="report-panel__actions">
            <button type="button" className="brand-button report-panel__save" aria-pressed={saved} onClick={onSave}>
              {t(saved ? 'panel.saved' : 'panel.save')}
            </button>
            <button type="button" className="report-panel__share" aria-label={t('panel.share')} onClick={() => onShare(report)}>
              <LineIcon name="share" size={20} />
            </button>
          </div>
          <p className="report-panel__note" role="status">
            {note}
          </p>
          <p className="report-panel__footer">
            {t('app.disclaimer')}
            {place && (
              <>
                {' · '}
                <a href={place.attribution_url} target="_blank" rel="noreferrer">
                  {place.attribution}
                </a>
              </>
            )}
          </p>
        </>
      )}
    </section>
  )
}
