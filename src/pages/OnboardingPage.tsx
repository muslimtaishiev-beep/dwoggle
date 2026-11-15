import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/context.ts'
import { ProfileFieldError, type ProfileField } from '../auth/accountApi.ts'
import { CONCERNS, type Concern, type ProfileAnswers, type Purpose, type User } from '../auth/types.ts'
import { BrandHeader } from '../brand/BrandHeader.tsx'
import { BubbleTail } from '../brand/BubbleTail.tsx'
import { ConcernIcon } from '../brand/ConcernIcon.tsx'
import { ProgressTube } from '../brand/ProgressTube.tsx'
import { StandingDwoggle } from '../brand/StandingDwoggle.tsx'
import { SurfaceScene } from '../brand/SurfaceScene.tsx'
import { Link } from '../components/Link.tsx'
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
      <BubbleTail className="dig-bubble__tail" width={255} height={46} base={[5, 62]} tip={[251, 40]} />
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
 * The questions after the first sign-in, from Dwoggle standing with his map: language, purpose, concerns, phone.
 * One at a time, each taking the place of the last. The language comes first and takes effect at once, so the
 * rest is already in that language. The first answers are saved before the phone question, so a visitor who
 * leaves there is asked only for the phone next time (the page starts at the first question without an answer).
 * The phone comes last: all the answers are sent again with it, so if the backend refuses one (a phone number it
 * cannot read, say), Dwoggle stays at that question, or goes back to it, and says why. Once they are saved the
 * map opens.
 */
export function OnboardingPage({ user }: { user: User }) {
  const { lang, setLang, t } = useI18n()
  const auth = useAuth()
  const [step, setStep] = useState(() => firstOpenStep(user))
  const [language, setLanguage] = useState<Lang>(user.language ?? lang)
  const [purpose, setPurpose] = useState<Purpose | null>(user.purpose)
  const [concerns, setConcerns] = useState<Concern[]>(() => [...(user.concerns ?? [])])
  const [phone, setPhone] = useState(user.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [refusal, setRefusal] = useState<Refusal | null>(null)

  // The questions end on the map: have its code ready, so that last change of screen can be animated.
  useEffect(preloadMapPage, [])

  /** The next (or an earlier) question takes the place of this one. */
  const goTo = (next: number) => withTransition('question', () => setStep(next))

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
    goTo(STEP.concerns)
  }

  const finishConcerns = () => {
    // The answers so far are saved now, before the phone: whoever leaves here is asked only for the phone next
    // time, not every question again. The backend keeps them without calling the profile complete. If this fails,
    // the answers are simply sent again with the phone.
    if (purpose !== null) {
      auth
        .saveProfile({ language, country: KYRGYZSTAN.code, phone: '', purpose, purposeNote: null, concerns })
        .catch(() => undefined)
    }
    // The number starts with Kyrgyzstan's dialling code; the visitor types the rest.
    setPhone((current) => (current.trim() === '' ? `${KYRGYZSTAN.dial} ` : current))
    goTo(STEP.phone)
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
      // Saved: the map opens.
      (showProfile) => withTransition('surface', showProfile),
      (error: unknown) => {
        setSaving(false)
        if (error instanceof ProfileFieldError) {
          setRefusal({ field: error.field, code: error.code })
          const target = STEP_OF_FIELD[error.field]
          if (target !== STEP.phone) goTo(target)
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
                goTo(STEP.purpose)
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
      <Bubble title={t('onboarding.purpose.title')} lead={t('onboarding.purpose.lead')} onBack={() => goTo(STEP.language)}>
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
      <Bubble title={t('onboarding.concerns.title')} lead={t('onboarding.concerns.lead')} onBack={() => goTo(STEP.purpose)}>
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
      <Bubble title={t('onboarding.phone.title')} lead={t('onboarding.phone.lead')} onBack={saving ? undefined : () => goTo(STEP.concerns)}>
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
  }

  return (
    <div className="brand-page dig" aria-label={t('onboarding.label')}>
      <SurfaceScene />

      <BrandHeader />

      <main className="dig__stage">
        <ProgressTube current={Math.min(step + 1, QUESTIONS)} total={QUESTIONS} />
        <div key={step} className="dig__bubble-slot">
          {bubble}
        </div>
      </main>

      {/* Dwoggle stands with his map beside the question, as on the sign-up page. */}
      <div className="dig__mascot" aria-hidden="true">
        <StandingDwoggle className="dig__dwoggle" />
      </div>
    </div>
  )
}
