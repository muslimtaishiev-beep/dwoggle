import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/context.ts'
import { ProfileFieldError, type ProfileField } from '../auth/accountApi.ts'
import { CONCERNS, type Concern, type ProfileAnswers, type Purpose, type User } from '../auth/types.ts'
import { BrandHeader } from '../brand/BrandHeader.tsx'
import { BubbleTail } from '../brand/BubbleTail.tsx'
import { DiggingDwoggle } from '../brand/DiggingDwoggle.tsx'
import { ConcernIcon } from '../brand/ConcernIcon.tsx'
import { ProgressTube } from '../brand/ProgressTube.tsx'
import { SurfaceScene } from '../brand/SurfaceScene.tsx'
import { Link } from '../components/Link.tsx'
import { useReducedMotion } from '../hooks/useReducedMotion.ts'
import { useI18n } from '../i18n/context.ts'
import { withTransition } from '../motion/pageTransition.ts'
import { LANGS, type Lang, type MessageKey } from '../i18n/i18n.ts'
import { ROUTES } from '../router.ts'
import { KYRGYZSTAN } from '../config.ts'
import '../brand/brand.css'
import { preloadMapPage } from './mapPageLoader.ts'
import './OnboardingPage.css'

/**
 * The reasons offered for coming, of the backend's eight: the four that fit someone looking at a place in
 * Kyrgyzstan, so the choice is quick and none needs explaining.
 */
const PURPOSE_CHOICES = ['buy_land', 'build', 'own_home', 'curious'] as const satisfies readonly Purpose[]

/** The questions, in the order they are asked. The country is not one of them: Dwoggle covers Kyrgyzstan only. */
const STEP = { language: 0, purpose: 1, concerns: 2, phone: 3 } as const
const QUESTIONS = 4
/** How long one layer of digging takes; matches --duration-descend in tokens.css. */
const DESCEND_MS = 900

/** The question to climb back to when the backend refuses an answer. */
const STEP_OF_FIELD: Readonly<Record<ProfileField, number>> = {
  // The country is sent by the app, not asked: should the backend refuse it, the last step shows the general message.
  country: STEP.phone,
  purpose: STEP.purpose,
  purpose_note: STEP.purpose,
  concerns: STEP.concerns,
  phone: STEP.phone,
}

/** The backend's reasons for refusing an answer, in our words. Unknown reasons get the general message. */
const REFUSALS: Readonly<Record<string, MessageKey>> = {
  phone_invalid: 'profile.error.phone_invalid',
  purpose_invalid: 'profile.error.purpose_invalid',
}

interface Refusal {
  readonly field: ProfileField
  readonly code: string
}

/** The first question not answered yet, so a visitor who left halfway carries on where they stopped. */
function firstOpenStep(user: User): number {
  if (user.language === null) return STEP.language
  if (user.purpose === null) return STEP.purpose
  if (user.concerns === null) return STEP.concerns
  return STEP.phone
}

interface BubbleProps {
  title: string
  lead: string
  children: ReactNode
  onBack?: () => void
}

/** Dwoggle's speech bubble: one question at a time. */
function Bubble({ title, lead, children, onBack }: BubbleProps) {
  const { t } = useI18n()
  return (
    <section className="dig-bubble" aria-labelledby="dig-question">
      <h1 id="dig-question" className="dig-bubble__title brand-display">
        {title}
      </h1>
      <p className="dig-bubble__lead">{lead}</p>
      {children}
      {onBack && (
        <button type="button" className="dig-bubble__back" onClick={onBack}>
          {t('onboarding.back')}
        </button>
      )}
      <BubbleTail className="dig-bubble__tail" width={172} height={46} base={[5, 62]} tip={[168, 44]} />
    </section>
  )
}

/** A text field in a bubble, with the reason underneath when its answer was refused. */
function Field({ id, label, error, children }: { id: string; label: string; error: string | null; children: ReactNode }) {
  return (
    <div className="brand-field">
      <label className="brand-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      <p id={`${id}-note`} className="brand-field__note brand-field__note--error" role={error ? 'alert' : undefined}>
        {error}
      </p>
    </div>
  )
}

/**
 * The questions after the first sign-in, asked while Dwoggle digs: language, purpose, concerns, phone.
 * The language comes first and takes effect at once, so the rest of the dig is already in that language. Every
 * answer takes him one layer deeper: the camera follows him down, the tunnel grows behind him and the earth gets
 * darker. The first answers are saved before the phone question, so a visitor who leaves there is asked only
 * for the phone next time (the dig starts at the first question without an answer). The phone comes last: all
 * the answers are sent again with it, so if the backend refuses one (a phone number it cannot read, say),
 * Dwoggle stays at that question, or climbs back to it, and says why. Once they are saved
 * he digs one more layer and the app opens the map.
 */
export function OnboardingPage({ user }: { user: User }) {
  const { lang, setLang, t } = useI18n()
  const auth = useAuth()
  const reducedMotion = useReducedMotion()
  const [step, setStep] = useState(() => firstOpenStep(user))
  const [language, setLanguage] = useState<Lang>(user.language ?? lang)
  const [purpose, setPurpose] = useState<Purpose | null>(user.purpose)
  const [concerns, setConcerns] = useState<Concern[]>(() => [...(user.concerns ?? [])])
  const [phone, setPhone] = useState(user.phone ?? '')
  const [digging, setDigging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // The dig ends on the map: have its code ready, so that last change of screen can be animated.
  useEffect(preloadMapPage, [])

  /** Dig one layer down (or up), then run `after` once Dwoggle has arrived. The old question gives way to the new. */
  const digTo = (next: number, after?: () => void) => {
    window.clearTimeout(timer.current)
    withTransition('question', () => {
      setStep(next)
      setDigging(true)
    })
    timer.current = window.setTimeout(
      () => {
        setDigging(false)
        after?.()
      },
      reducedMotion ? 0 : DESCEND_MS,
    )
  }

  /** The reason the backend gave for refusing this field, in the visitor's language. */
  const refusalFor = (...fields: ProfileField[]): string | null => {
    if (refusal === null || !fields.includes(refusal.field)) return null
    const key = REFUSALS[refusal.code]
    return key ? t(key) : t('onboarding.error')
  }

  const toggleConcern = (concern: Concern) =>
    setConcerns((current) => (current.includes(concern) ? current.filter((c) => c !== concern) : [...current, concern]))

  const choosePurpose = (option: Purpose) => {
    setPurpose(option)
    setRefusal(null)
    digTo(STEP.concerns)
  }

  const finishConcerns = () => {
    // The answers so far are saved now, before the phone: whoever leaves here is asked only for the phone next
    // time, not the whole dig again. The backend keeps them without calling the profile complete. If this fails,
    // the answers are simply sent again with the phone.
    if (purpose !== null) {
      auth
        .saveProfile({ language, country: KYRGYZSTAN.code, phone: '', purpose, purposeNote: null, concerns })
        .catch(() => undefined)
    }
    // The number starts with Kyrgyzstan's dialling code; the visitor types the rest.
    setPhone((current) => (current.trim() === '' ? `${KYRGYZSTAN.dial} ` : current))
    digTo(STEP.phone)
  }

  const submitPhone = (event: FormEvent) => {
    event.preventDefault()
    if (purpose === null || saving) return
    if (phone.replace(/\D/g, '').length < 6) {
      setRefusal({ field: 'phone', code: 'phone_invalid' })
      return
    }
    setSaving(true)
    setFailed(false)
    setRefusal(null)
    const answers: ProfileAnswers = {
      language,
      country: KYRGYZSTAN.code,
      phone: phone.trim(),
      purpose,
      purposeNote: null,
      concerns,
    }
    auth.saveProfile(answers).then(
      // Saved: one more layer, then the map opens out of the hole he has dug.
      (showProfile) => digTo(QUESTIONS, () => withTransition('surface', showProfile)),
      (error: unknown) => {
        setSaving(false)
        if (error instanceof ProfileFieldError) {
          setRefusal({ field: error.field, code: error.code })
          const target = STEP_OF_FIELD[error.field]
          if (target !== STEP.phone) digTo(target)
        } else {
          setFailed(true)
        }
      },
    )
  }

  let bubble: ReactNode
  if (step === STEP.language) {
    bubble = (
      <Bubble title={t('onboarding.language.title')} lead={t('onboarding.language.lead')}>
        <div className="dig-bubble__grid dig-bubble__grid--languages" role="group" aria-labelledby="dig-question">
          {LANGS.map((option) => (
            <button
              key={option}
              type="button"
              className="brand-tile"
              lang={option}
              aria-pressed={language === option}
              onClick={() => {
                setLanguage(option)
                setLang(option)
                digTo(STEP.purpose)
              }}
            >
              <span className="brand-tile__label">{t(`lang.${option}`)}</span>
            </button>
          ))}
        </div>
      </Bubble>
    )
  } else if (step === STEP.purpose) {
    const error = refusalFor('purpose')
    bubble = (
      <Bubble title={t('onboarding.purpose.title')} lead={t('onboarding.purpose.lead')} onBack={() => digTo(STEP.language)}>
        <div className="dig-bubble__grid dig-bubble__grid--purposes" role="group" aria-labelledby="dig-question">
          {PURPOSE_CHOICES.map((option) => (
            <button
              key={option}
              type="button"
              className="brand-tile"
              aria-pressed={purpose === option}
              onClick={() => choosePurpose(option)}
            >
              <span className="brand-tile__label">{t(`purpose.${option}`)}</span>
            </button>
          ))}
        </div>
        {error && (
          <p className="brand-field__note brand-field__note--error" role="alert">
            {error}
          </p>
        )}
      </Bubble>
    )
  } else if (step === STEP.concerns) {
    bubble = (
      <Bubble title={t('onboarding.concerns.title')} lead={t('onboarding.concerns.lead')} onBack={() => digTo(STEP.purpose)}>
        <div className="dig-bubble__grid dig-bubble__grid--icons" role="group" aria-labelledby="dig-question">
          {CONCERNS.map((concern) => (
            <button
              key={concern}
              type="button"
              className="brand-tile brand-tile--icon"
              aria-pressed={concerns.includes(concern)}
              onClick={() => toggleConcern(concern)}
            >
              <span className="brand-tile__icon">
                <ConcernIcon concern={concern} />
              </span>
              <span className="brand-tile__label">{t(`concern.${concern}`)}</span>
            </button>
          ))}
        </div>
        <button type="button" className="brand-button dig-bubble__confirm" onClick={finishConcerns}>
          {t(concerns.length === 0 ? 'onboarding.concerns.none' : 'onboarding.concerns.confirm')}
        </button>
      </Bubble>
    )
  } else if (step === STEP.phone) {
    const error = refusalFor('phone') ?? (failed ? t('onboarding.error') : null)
    bubble = (
      <Bubble title={t('onboarding.phone.title')} lead={t('onboarding.phone.lead')} onBack={saving ? undefined : () => digTo(STEP.concerns)}>
        <form className="dig-bubble__form" onSubmit={submitPhone}>
          <Field id="dig-phone" label={t('onboarding.phone.label')} error={error}>
            <input
              id="dig-phone"
              className="brand-input dig-bubble__phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              aria-invalid={error !== null}
              aria-describedby="dig-phone-note"
              autoFocus
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
          <button type="submit" className="brand-button" disabled={saving}>
            {t(saving ? 'auth.working' : 'onboarding.phone.confirm')}
          </button>
          {failed && (
            <Link to={ROUTES.map} className="dig-bubble__back dig-bubble__skip">
              {t('site.open_map')}
            </Link>
          )}
        </form>
      </Bubble>
    )
  } else {
    bubble = (
      <p className="dig-bubble dig-bubble--status brand-display" role="status">
        {t('onboarding.digging')}
      </p>
    )
  }

  const classes = ['brand-page', 'dig', step > 0 && 'dig--underground', digging && 'dig--digging'].filter(Boolean).join(' ')

  return (
    <div className={classes} style={{ '--depth': step } as CSSProperties} aria-label={t('onboarding.label')}>
      {/* The world: the surface on top, then one layer of earth per question. The camera moves down through it. */}
      <div className="dig__world" aria-hidden="true">
        <div className="dig__surface">
          <SurfaceScene />
        </div>
        {[1, 2, 3, 4].map((layer) => (
          <div key={layer} className={`dig__stratum dig__stratum--${layer}`} style={{ '--layer': layer } as CSSProperties}>
            <svg className="dig__stratum-edge" viewBox="0 0 1440 60" preserveAspectRatio="none">
              <path d="M0 40 C260 8 520 6 760 30 C1000 54 1220 20 1440 32 L1440 60 L0 60 Z" />
            </svg>
          </div>
        ))}
        <div className="dig__shaft">
          <div className="dig__tunnel" />
        </div>
      </div>

      <BrandHeader />

      <main className="dig__stage">
        <ProgressTube current={Math.min(step + 1, QUESTIONS)} total={QUESTIONS} />
        <div key={step} className="dig__bubble-slot">
          {bubble}
        </div>
      </main>

      <div className="dig__mascot" aria-hidden="true" data-reveal-origin="">
        <DiggingDwoggle hard={digging} />
      </div>
    </div>
  )
}
