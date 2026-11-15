import { useEffect, useRef, useState } from 'react'
import { createReport, ReportError, verifyUrl } from '../api/reportsApi.ts'
import type { LatLon } from '../api/types.ts'
import { useAuth } from '../auth/context.ts'
import { DiggingDwoggle } from '../brand/DiggingDwoggle.tsx'
import { LineIcon } from '../brand/LineIcon.tsx'
import { useI18n } from '../i18n/context.ts'
import { buildReportPdf } from '../report/pdf/buildReportPdf.ts'
import { ROUTES } from '../router.ts'
import { Link } from './Link.tsx'
import './FullReport.css'

const STEPS = ['satellites', 'rain', 'station', 'writing'] as const
/** How long each step's line stays before the next: the backend's own work takes 20–60 s. */
const STEP_MS = 9000

type Stage =
  | { readonly kind: 'working' }
  | { readonly kind: 'ready'; readonly id: string; readonly download: () => Promise<void> }
  | { readonly kind: 'error'; readonly message: string }

interface FullReportProps {
  point: LatLon
  onClose: () => void
}

function errorText(error: unknown, t: ReturnType<typeof useI18n>['t']): string {
  if (error instanceof ReportError && error.code === 'daily_limit' && error.limit !== null) return t('adv.limit', { limit: error.limit })
  return t('adv.error')
}

/**
 * The full report, over the map: Dwoggle digs while the backend gathers everything about the place, then the
 * numbered PDF is ready to download. Signed out, it asks the visitor to sign in first.
 */
export function FullReport({ point, onClose }: FullReportProps) {
  const i18n = useI18n()
  const { t } = i18n
  const { state, idToken } = useAuth()
  const signedIn = state.status === 'signedIn'
  const [stage, setStage] = useState<Stage>({ kind: 'working' })
  const [step, setStep] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const close = useRef<HTMLButtonElement>(null)
  // The language and texts at the moment the report was asked for; a later change of language does not restart it.
  const i18nRef = useRef(i18n)

  useEffect(() => {
    close.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!signedIn) return
    let gone = false
    const timer = window.setInterval(() => setStep((current) => Math.min(current + 1, STEPS.length - 1)), STEP_MS)
    const texts = i18nRef.current
    idToken()
      .then((token) => createReport(token, point, texts.lang))
      .then(async (made) => {
        if (made.record === null) throw new ReportError('failed')
        const pdf = await buildReportPdf(made.record, texts, verifyUrl(made.id))
        const download = () => pdf.download(`Dwoggle-${made.id}.pdf`)
        if (gone) return
        setStage({ kind: 'ready', id: made.id, download })
        // Straight away, where the browser allows a download without a click; the button stays for the rest.
        download().catch(() => undefined)
      })
      .catch((error: unknown) => {
        if (!gone) setStage({ kind: 'error', message: errorText(error, texts.t) })
      })
      .finally(() => window.clearInterval(timer))
    return () => {
      gone = true
      window.clearInterval(timer)
    }
  }, [signedIn, idToken, point, attempt])

  const retry = () => {
    setStep(0)
    setStage({ kind: 'working' })
    setAttempt((n) => n + 1)
  }

  return (
    <div className="full-report" role="dialog" aria-modal="true" aria-labelledby="full-report-title">
      <button type="button" className="full-report__scrim" aria-hidden="true" tabIndex={-1} onClick={onClose} />
      <section className="full-report__card">
        <header className="full-report__head">
          <h2 id="full-report-title" className="full-report__title brand-display">
            {t('adv.title')}
          </h2>
          <button ref={close} type="button" className="full-report__close" aria-label={t('adv.close')} onClick={onClose}>
            <LineIcon name="close" size={18} />
          </button>
        </header>

        {!signedIn ? (
          <div className="full-report__body">
            <p className="full-report__text">{t('adv.sign_in')}</p>
            <Link to={ROUTES.signIn} className="brand-button full-report__action">
              {t('adv.sign_in_go')}
            </Link>
          </div>
        ) : stage.kind === 'working' ? (
          <div className="full-report__body" role="status" aria-live="polite">
            <DiggingDwoggle className="full-report__dwoggle" pace="calm" />
            <ol className="full-report__steps">
              {STEPS.map((id, i) => (
                <li key={id} className={i < step ? 'is-done' : i === step ? 'is-now' : undefined} aria-current={i === step ? 'step' : undefined}>
                  <span className="full-report__dot" aria-hidden="true" />
                  {t(`adv.step.${id}`)}
                </li>
              ))}
            </ol>
            <p className="full-report__wait">{t('adv.wait')}</p>
          </div>
        ) : stage.kind === 'ready' ? (
          <div className="full-report__body" role="status">
            <p className="full-report__text">{t('adv.ready')}</p>
            <p className="full-report__number">{t('adv.number', { id: stage.id })}</p>
            <button type="button" className="brand-button full-report__action" onClick={() => void stage.download()}>
              {t('adv.download')}
            </button>
          </div>
        ) : (
          <div className="full-report__body" role="alert">
            <p className="full-report__text">{stage.message}</p>
            <button type="button" className="brand-button full-report__action" onClick={retry}>
              {t('report.retry')}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
