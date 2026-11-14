import { useEffect, useRef, type MouseEvent } from 'react'
import { GRADES } from '../api/types.ts'
import { DEFAULT_RADIUS_M } from '../config.ts'
import { useI18n } from '../i18n/context.ts'
import type { MessageKey } from '../i18n/i18n.ts'
import { GradeBadge } from './GradeBadge.tsx'
import { PixelIcon } from './PixelIcon.tsx'
import './GradingPanel.css'

// The no-data rule is listed with the grades above, next to the "no data" badge.
const RULES: readonly MessageKey[] = [
  'grading.rule.trend',
  'grading.rule.resolution',
  'grading.rule.nasa',
  'grading.rule.signals',
]

interface GradingPanelProps {
  open: boolean
  onClose: () => void
}

/** "How we grade": a native modal dialog, so focus trapping and Escape come from the browser. */
export function GradingPanel({ open, onClose }: GradingPanelProps) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="grading-panel"
      aria-labelledby="grading-panel-title"
      onClose={onClose}
      onClick={closeOnBackdrop}
    >
      <div className="grading-panel__content">
        <header className="grading-panel__header">
          <h2 id="grading-panel-title" className="grading-panel__title display">
            {t('grading.title')}
          </h2>
          <button type="button" className="button button--icon" aria-label={t('grading.close')} onClick={onClose}>
            <PixelIcon name="close" />
          </button>
        </header>

        <p>{t('grading.intro', { radius: DEFAULT_RADIUS_M })}</p>

        <h3 className="grading-panel__heading display">{t('grading.grades_heading')}</h3>
        <dl className="grading-panel__grades">
          {GRADES.map((grade) => (
            <div key={grade} className="grading-panel__grade">
              <dt>
                <GradeBadge grade={grade} />
              </dt>
              <dd>{t(`grade.${grade}`)}</dd>
            </div>
          ))}
          <div className="grading-panel__grade">
            <dt>
              <GradeBadge grade={null} />
            </dt>
            <dd>{t('grading.rule.no_data')}</dd>
          </div>
        </dl>

        <h3 className="grading-panel__heading display">{t('grading.rules_heading')}</h3>
        <ul className="grading-panel__rules">
          {RULES.map((rule) => (
            <li key={rule}>{t(rule)}</li>
          ))}
        </ul>

        <p className="grading-panel__disclaimer">{t('app.disclaimer')}</p>
      </div>
    </dialog>
  )
}
