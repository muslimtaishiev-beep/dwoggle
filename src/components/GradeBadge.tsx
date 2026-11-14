import type { Grade } from '../api/types.ts'
import { useI18n } from '../i18n/context.ts'
import './GradeBadge.css'

interface GradeBadgeProps {
  grade: Grade | null
  size?: 'lg' | 'sm'
}

/** A grade block. A null grade always reads "no data"; a value is never invented. */
export function GradeBadge({ grade, size = 'lg' }: GradeBadgeProps) {
  const { t } = useI18n()
  const text = grade ?? t('grade.none')
  const meaning = grade ? t('grade.label', { grade, meaning: t(`grade.${grade}`) }) : text
  return (
    <span className={`grade-badge grade-badge--${size} grade-badge--${grade?.toLowerCase() ?? 'none'}`} title={meaning}>
      <span aria-hidden="true">{text}</span>
      <span className="visually-hidden">{meaning}</span>
    </span>
  )
}
