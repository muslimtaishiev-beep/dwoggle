import type { CSSProperties } from 'react'
import type { Check } from '../api/types.ts'
import { useI18n } from '../i18n/context.ts'
import { Mascot } from './Mascot.tsx'
import { GradeBadge } from './GradeBadge.tsx'
import './CoreFigure.css'
import './CoreDiagram.css'

/** A still version of the annotated core, for explaining the idea: every layer with its name and grade. */
export function CoreDiagram({ checks }: { checks: readonly Check[] }) {
  const { t } = useI18n()
  return (
    <ol className="core__grid core-diagram">
      <li className="core__row core__row--surface">
        <div className="core__cap">
          <Mascot pose="idle" size="sm" />
          <span className="core__cap-face" />
        </div>
        <span className="core__leader" aria-hidden="true" />
        <p className="core__note">{t('dig.surface')}</p>
      </li>
      {checks.map((check, i) => (
        <li
          key={check.id}
          className={`core__row core__row--active core__row--${check.id}${i === 0 ? ' core__row--first' : ''}`}
          style={{ '--i': i } as CSSProperties}
        >
          <span className="core__band core-diagram__band" style={{ zIndex: checks.length - i }} aria-hidden="true">
            <span className="core__band-number">{i + 1}</span>
          </span>
          <span className="core__leader" aria-hidden="true" />
          <div className="core__callout core-diagram__label plate">
            <span className="core__index">{i + 1}</span>
            <span className="core__name display">{t(`check.${check.id}`)}</span>
            <GradeBadge grade={check.grade} size="sm" />
          </div>
        </li>
      ))}
    </ol>
  )
}
