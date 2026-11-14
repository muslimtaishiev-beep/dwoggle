import { useState } from 'react'
import type { Check, Report } from '../api/types.ts'
import { StandingDwoggle } from '../brand/StandingDwoggle.tsx'
import { useI18n } from '../i18n/context.ts'
import { buildAnswer, whyAnswer, worstCheck } from '../report/facts.ts'
import './AskDwoggle.css'

type Question = { kind: 'why' } | { kind: 'build' }

interface AskDwoggleProps {
  /** The open report, when there is one: Dwoggle answers questions about it. */
  report: Report | null
  /** Dwoggle is checking a place (the report is on its way). */
  checking: boolean
  /** A short message that takes the bubble for a moment, e.g. that the visitor's location is not available. */
  notice: string | null
}

/**
 * Dwoggle in his hole at the bottom of the map, with a speech bubble. Before a tap he says what to do; with a
 * report open he offers questions and answers them from the report itself. Free questions need the backend.
 */
export function AskDwoggle({ report, checking, notice }: AskDwoggleProps) {
  const i18n = useI18n()
  const { t } = i18n
  const [asked, setAsked] = useState<{ report: Report; question: Question } | null>(null)
  // A new report asks afresh.
  const question = asked !== null && asked.report === report ? asked.question : null
  const worst = report ? worstCheck(report) : null

  /** "Why is earthquake a D?" In Kyrgyz the check's name comes first, so the sentence gets its capital back. */
  const whyQuestion = (check: Check) => {
    const text = t('ask.why', { check: t(`check.${check.id}`).toLocaleLowerCase(i18n.lang), grade: check.grade ?? '' })
    return text.charAt(0).toLocaleUpperCase(i18n.lang) + text.slice(1)
  }

  let title: string
  let body = null
  if (notice !== null) {
    title = notice
  } else if (report === null) {
    title = t(checking ? 'bekem.loading' : 'map.hint')
  } else if (question === null) {
    title = t('ask.title')
    body = (
      <div className="ask__chips">
        {worst?.grade && (
          <button type="button" className="ask__chip" onClick={() => setAsked({ report, question: { kind: 'why' } })}>
            {whyQuestion(worst)}
          </button>
        )}
        <button type="button" className="ask__chip" onClick={() => setAsked({ report, question: { kind: 'build' } })}>
          {t('ask.build')}
        </button>
        <button type="button" className="ask__chip ask__chip--outline" disabled title={t('ask.other_soon')}>
          {t('ask.other')}
        </button>
      </div>
    )
  } else {
    title = question.kind === 'build' || worst === null ? t('ask.build') : whyQuestion(worst)
    body = (
      <>
        <p className="ask__answer">{question.kind === 'build' || worst === null ? buildAnswer(report, i18n) : whyAnswer(worst, i18n)}</p>
        <div className="ask__chips">
          <button type="button" className="ask__chip ask__chip--outline" onClick={() => setAsked(null)}>
            {t('ask.more')}
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="ask">
      <div className="ask__burrow" aria-hidden="true">
        <span className="ask__hole" />
        <span className="ask__peek">
          <StandingDwoggle className="ask__dwoggle" />
        </span>
        <span className="ask__lip" />
      </div>
      <section className="ask__bubble" aria-live="polite" aria-label={t('ask.title')}>
        <p className="ask__title brand-display">{title}</p>
        {body}
      </section>
    </div>
  )
}
