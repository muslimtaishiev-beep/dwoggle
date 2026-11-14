import { useI18n } from '../i18n/context.ts'
import './ProgressTube.css'

interface ProgressTubeProps {
  current: number
  total: number
}

/**
 * A test tube that fills with yellow as the questions are answered. The liquid pours up to its mark, and its
 * surface keeps a slow ripple.
 */
export function ProgressTube({ current, total }: ProgressTubeProps) {
  const { t } = useI18n()
  const label = t('dig.progress', { current, total })
  // Never quite empty: the first question already shows a little liquid, as drawn.
  const fill = Math.min(1, 0.12 + (0.88 * current) / total)
  return (
    <div className="progress-tube" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={current} aria-valuetext={label}>
      <div className="progress-tube__glass">
        <div className="progress-tube__well">
          {/* As tall as the well, slid up into it: filling moves pixels, it does not resize them. */}
          <div className="progress-tube__liquid" style={{ transform: `translateY(${(1 - fill) * 100}%)` }}>
            <svg className="progress-tube__surface" viewBox="0 0 80 12" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 6 Q10 0 20 6 T40 6 T60 6 T80 6 V12 H0 Z" />
            </svg>
          </div>
        </div>
      </div>
      <span className="progress-tube__label">{label}</span>
    </div>
  )
}
