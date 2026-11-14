import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Report } from '../api/types.ts'
import { BrandMark } from '../brand/BrandMark.tsx'
import { LineIcon } from '../brand/LineIcon.tsx'
import { StandingDwoggle } from '../brand/StandingDwoggle.tsx'
import { useReducedMotion } from '../hooks/useReducedMotion.ts'
import { useSpeech } from '../hooks/useSpeech.ts'
import { useVoiceInput } from '../hooks/useVoiceInput.ts'
import { useI18n } from '../i18n/context.ts'
import { answerTo, topicOf, type Topic } from '../report/answers.ts'
import { worstCheck } from '../report/facts.ts'
import './DwoggleChat.css'

/** How long Dwoggle "thinks" before he answers: long enough to see that a new answer is coming. */
const THINK_MS = 280
/** One more word of his answer appears this often while he speaks. */
const WORD_MS = 70
/** An answer longer than this many characters is set a size smaller (and on a low screen he makes room), so it fits above him. */
const LONG_ANSWER = 170

interface Turn {
  /** What was asked, as typed, spoken or chosen; null for his greeting. */
  readonly question: string | null
  readonly answer: string
}

interface DwoggleChatProps {
  /** The open report, if a place has been checked: his answers come from it. */
  report: Report | null
  /** A question to open with, chosen on the map. */
  ask: Topic | null
  onClose: () => void
}

/**
 * Talking to Dwoggle: a white screen between two bands of earth, Dwoggle in the middle. The visitor types a
 * question, says it, or taps a ready one; he thinks for a moment, then answers in a speech bubble, his mouth
 * moving while the words appear (or while he reads them aloud). One question and one answer at a time.
 */
export function DwoggleChat({ report, ask, onClose }: DwoggleChatProps) {
  const i18n = useI18n()
  const { lang, t } = i18n
  const reducedMotion = useReducedMotion()
  const speech = useSpeech(lang)
  /** The words of a ready question, for the topic it stands for. */
  const questionFor = (topic: Topic): string => {
    if (topic === 'build') return t('ask.build')
    if (topic === 'grades') return t('chat.q.grades')
    if (topic === 'data') return t('chat.q.data')
    const check = report?.checks.find((item) => item.id === topic)
    if (!check) return t('ask.title')
    const text = t('ask.why', { check: t(`check.${check.id}`).toLocaleLowerCase(lang), grade: check.grade ?? t('grade.none') })
    return text.charAt(0).toLocaleUpperCase(lang) + text.slice(1)
  }

  // He opens with the question chosen on the map, or with a greeting.
  const [turn, setTurn] = useState<Turn>(() =>
    ask === null
      ? { question: null, answer: t(report ? 'chat.hello_place' : 'chat.hello') }
      : { question: questionFor(ask), answer: answerTo(ask, report, i18n) },
  )
  const [thinking, setThinking] = useState(ask !== null)
  /** How many words of the answer are shown so far. */
  const [shown, setShown] = useState(0)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const thinkTimer = useRef<number | undefined>(undefined)
  const worst = report ? worstCheck(report) : null

  const words = turn.answer.split(' ')
  // With reduced motion his words are all there at once.
  const visible = reducedMotion ? words.length : shown
  const revealing = !thinking && visible < words.length
  const talking = revealing || speech.speaking

  /** Ask about a topic: he thinks, then answers; aloud too if the question was spoken. */
  const respond = useCallback(
    (question: string, topic: Topic, aloud: boolean) => {
      const answer = answerTo(topic, report, i18n)
      speech.stop()
      window.clearTimeout(thinkTimer.current)
      setTurn({ question, answer })
      setShown(0)
      setThinking(true)
      thinkTimer.current = window.setTimeout(() => {
        setThinking(false)
        if (aloud) speech.speak(answer)
      }, THINK_MS)
    },
    [i18n, report, speech],
  )

  const voice = useVoiceInput(lang, (text) => respond(text, topicOf(text), true))

  // His words appear one after another while he speaks.
  useEffect(() => {
    if (thinking || reducedMotion || shown >= words.length) return
    const timer = window.setTimeout(() => setShown((count) => count + 1), WORD_MS)
    return () => window.clearTimeout(timer)
  }, [thinking, shown, words.length, reducedMotion])

  // As the chat opens: his first thought ends, and on a computer the field is ready to type in
  // (on a phone the keyboard would cover half the screen before anything is read).
  useEffect(() => {
    thinkTimer.current = window.setTimeout(() => setThinking(false), THINK_MS)
    if (window.matchMedia('(pointer: fine)').matches) input.current?.focus()
    return () => window.clearTimeout(thinkTimer.current)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (text === '') return
    setDraft('')
    respond(text, topicOf(text), false)
  }

  const ready: Topic[] = [...(worst ? [worst.id, 'build' as const] : []), 'grades', 'data']
  const long = turn.answer.length > LONG_ANSWER

  return (
    <div className={['chat', voice.listening && 'chat--listening', long && 'chat--long'].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-label={t('chat.title')}>
      <header className="chat__top">
        <BrandMark />
        <button type="button" className="chat__back" onClick={onClose}>
          <LineIcon name="close" size={16} />
          <span>{t('chat.close')}</span>
        </button>
        <svg className="chat__wave chat__wave--top" viewBox="0 0 1280 18" preserveAspectRatio="none" aria-hidden="true">
          <path className="chat__wave-fill" d="M0 0H1280V6C1100 14 980 2 820 8S520 16 360 9 120 3 0 10Z" />
          <path className="chat__wave-line" d="M0 10C120 3 220 13 360 9S640 16 820 8 1100 14 1280 6" />
        </svg>
      </header>

      <main className="chat__stage">
        <div className="chat__talk">
          {turn.question && (
            <p className="chat__question">
              <span className="visually-hidden">{t('chat.you_asked')} </span>
              {turn.question}
            </p>
          )}
          {/* A new answer is a new bubble, so it pops in again. */}
          <div className="chat__bubble" key={`${turn.question}|${turn.answer}`}>
            {thinking ? (
              <p className="chat__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </p>
            ) : (
              <p className="chat__answer" aria-hidden="true">
                {words.slice(0, visible).join(' ')}
                {/* The words still to come hold their place, so the bubble does not grow as he speaks. */}
                <span className="chat__unsaid"> {words.slice(visible).join(' ')}</span>
              </p>
            )}
            <p className="visually-hidden" role="status">
              {thinking ? t('chat.thinking') : turn.answer}
            </p>
            {speech.supported && !thinking && (
              <button type="button" className="chat__listen" onClick={() => (speech.speaking ? speech.stop() : speech.speak(turn.answer))}>
                <LineIcon name={speech.speaking ? 'close' : 'sound'} size={16} />
                <span>{t(speech.speaking ? 'chat.stop' : 'chat.listen')}</span>
              </button>
            )}
          </div>
        </div>
        <div className="chat__dwoggle" aria-hidden="true">
          <StandingDwoggle className="chat__figure" talking={talking} />
        </div>
      </main>

      <form className="chat__bottom" onSubmit={submit}>
        <svg className="chat__wave chat__wave--bottom" viewBox="0 0 1280 18" preserveAspectRatio="none" aria-hidden="true">
          <path className="chat__wave-fill" d="M0 18H1280V8C1130 2 1010 14 840 9S520 3 360 10 120 14 0 6Z" />
          <path className="chat__wave-line" d="M0 6C120 14 220 4 360 10S660 3 840 9 1130 2 1280 8" />
        </svg>
        {/* Ready questions, next to where a question is typed. */}
        <div className="chat__ready">
          {ready.map((topic) => (
            <button key={topic} type="button" className="chat__chip" onClick={() => respond(questionFor(topic), topic, false)}>
              {questionFor(topic)}
            </button>
          ))}
        </div>
        <div className="chat__field">
          <input
            ref={input}
            className="chat__input"
            type="text"
            name="question"
            autoComplete="off"
            enterKeyHint="send"
            aria-label={t('chat.placeholder')}
            placeholder={t(voice.listening ? 'search.listening' : 'chat.placeholder')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          {voice.supported && (
            <button type="button" className="chat__round" aria-label={t('chat.speak')} aria-pressed={voice.listening} onClick={voice.listen}>
              <LineIcon name="mic" size={20} />
            </button>
          )}
          <button type="submit" className="chat__round chat__round--send" aria-label={t('chat.send')} disabled={draft.trim() === ''}>
            <LineIcon name="send" size={20} />
          </button>
        </div>
      </form>
    </div>
  )
}
