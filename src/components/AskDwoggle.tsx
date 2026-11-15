import type { Check, Report } from '../api/types.ts'
import { StandingDwoggle } from '../brand/StandingDwoggle.tsx'
import { useI18n } from '../i18n/context.ts'
import type { Topic } from '../report/answers.ts'
import { worstCheck } from '../report/facts.ts'
import './AskDwoggle.css'

interface AskDwoggleProps {
  /** The open report, when there is one: the ready questions are about it. */
  report: Report | null
  /** Dwoggle is checking a place (the report is on its way). */
  checking: boolean
  /** A short message that takes the bubble for a moment, e.g. that the visitor's location is not available. */
  notice: string | null
  /** Open the chat with Dwoggle, on a ready question or, with none, to ask anything. */
  onChat: (topic: Topic | null) => void
}

const CLODS = [0, 1, 2, 3, 4] as const

/**
 * Dwoggle in his hole at the bottom of the map, with a speech bubble. When a place is tapped he dives into his
 * hole and digs (earth jumps out of it) until the report is ready, then pops back out. Before a tap he says what
 * to do; with a
 * report open he offers questions. Pressing him, or a question, opens the chat, where he answers.
 */
export function AskDwoggle({ report, checking, notice, onChat }: AskDwoggleProps) {
  const { lang, t } = useI18n()
  const worst = report ? worstCheck(report) : null

  /** "Why is earthquake a D?" In Kyrgyz the check's name comes first, so the sentence gets its capital back. */
  const whyQuestion = (check: Check) => {
    const text = t('ask.why', { check: t(`check.${check.id}`).toLocaleLowerCase(lang), grade: check.grade ?? '' })
    return text.charAt(0).toLocaleUpperCase(lang) + text.slice(1)
  }

  // While he is under the ground the questions wait: they come with him when he is back up.
  const offer = report !== null && !checking
  const title = notice ?? (checking ? t('bekem.loading') : offer ? t('ask.title') : t('map.hint'))

  return (
    <div className={`ask${checking ? ' ask--under' : ''}`}>
      <button type="button" className="ask__burrow" aria-label={t('chat.open')} onClick={() => onChat(null)}>
        <span className="ask__hole" />
        <span className="ask__peek">
          <StandingDwoggle className="ask__dwoggle" />
        </span>
        {/* While he digs under the ground, earth jumps out of his hole. */}
        {CLODS.map((clod) => (
          <span key={clod} className={`ask__clod ask__clod--${clod}`} aria-hidden="true" />
        ))}
        <span className="ask__lip" />
      </button>
      <section className="ask__bubble" aria-live="polite" aria-label={t('ask.title')}>
        <p className="ask__title brand-display">{title}</p>
        {notice === null && offer && (
          <div className="ask__chips">
            {worst?.grade && (
              <button type="button" className="ask__chip" onClick={() => onChat(worst.id)}>
                {whyQuestion(worst)}
              </button>
            )}
            <button type="button" className="ask__chip" onClick={() => onChat('build')}>
              {t('ask.build')}
            </button>
            <button type="button" className="ask__chip ask__chip--outline" onClick={() => onChat(null)}>
              {t('ask.other')}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
