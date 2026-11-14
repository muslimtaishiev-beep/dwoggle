import type { CSSProperties } from 'react'
import { useI18n } from '../i18n/context.ts'
import './ProgressTube.css'

interface ProgressTubeProps {
  current: number
  total: number
}

/** A test tube that fills with yellow as the questions are answered. */
export function ProgressTube({ current, total }: ProgressTubeProps) {
  const { t } = useI18n()
  const label = t('dig.progress', { current, total })
  // Never quite empty: the first question already shows a little liquid, as drawn.
  const fill = Math.min(1, 0.12 + (0.88 * current) / total)
  return (
    <div className="progress-tube" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={current} aria-valuetext={label}>
      <div className="progress-tube__glass">
        <div className="progress-tube__liquid" style={{ '--fill': fill } as CSSProperties} />
      </div>
      <span className="progress-tube__label">{label}</span>
    </div>
  )
}
