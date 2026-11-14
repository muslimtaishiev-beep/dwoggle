import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/context.ts'
import { ProfileFieldError, type ProfileField } from '../auth/accountApi.ts'
import { CONCERNS, PURPOSE_NOTE_MAX, PURPOSES, type Concern, type ProfileAnswers, type Purpose, type User } from '../auth/types.ts'
import { BrandHeader } from '../brand/BrandHeader.tsx'
import { BubbleTail } from '../brand/BubbleTail.tsx'
import { ConcernIcon } from '../brand/ConcernIcon.tsx'
import { ProgressTube } from '../brand/ProgressTube.tsx'
import { SurfaceScene } from '../brand/SurfaceScene.tsx'
import { Link } from '../components/Link.tsx'
import { findCountry, guessCountry, listCountries } from '../data/countries.ts'
import { useReducedMotion } from '../hooks/useReducedMotion.ts'
import { useI18n } from '../i18n/context.ts'
import { LANGS, type Lang, type MessageKey } from '../i18n/i18n.ts'
import { ROUTES } from '../router.ts'
import '../brand/brand.css'
import './OnboardingPage.css'

const QUESTIONS = 5
/** How long one layer of digging takes; matches --duration-descend in tokens.css. */
const DESCEND_MS = 900
const CLODS = [0, 1, 2, 3, 4, 5]

/** The question to climb back to when the backend refuses an answer. */
const STEP_OF_FIELD: Readonly<Record<ProfileField, number>> = { country: 1, purpose: 2, purpose_note: 2, concerns: 3, phone: 4 }

/** The backend's reasons for refusing an answer, in our words. Unknown reasons get the general message. */
const REFUSALS: Readonly<Record<string, MessageKey>> = {
  country_invalid: 'profile.error.country_invalid',
  phone_invalid: 'profile.error.phone_invalid',
  purpose_invalid: 'profile.error.purpose_invalid',
  note_required: 'profile.error.note_required',
  note_too_long: 'profile.error.note_too_long',
}

interface Refusal {
  readonly field: ProfileField
  readonly code: string
}

/** The first question not answered yet, so a visitor who left halfway carries on where they stopped. */
function firstOpenStep(user: User): number {
  if (user.language === null) return 0
  if (user.country === null) return 1
  if (user.purpose === null || (user.purpose === 'other' && user.purposeNote === null)) return 2
  if (user.concerns === null) return 3
  return 4
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
 * The questions after the first sign-in, asked while Dwoggle digs: language, country, purpose, concerns, phone.
 * The language comes first and takes effect at once, so the rest of the dig is already in that language. Every
 * answer takes him one layer deeper: the camera follows him down, the tunnel grows behind him and the earth gets
 * darker. The phone comes last: the answers are sent to the backend then, so if it refuses one (a phone number
 * it cannot read, say), Dwoggle stays at that question, or climbs back to it, and says why. Once they are saved
 * he digs one more layer and the app opens the map.
 */
export function OnboardingPage({ user }: { user: User }) {
  const { lang, setLang, t } = useI18n()
  const auth = useAuth()
  const reducedMotion = useReducedMotion()
  const [step, setStep] = useState(() => firstOpenStep(user))
  const [language, setLanguage] = useState<Lang>(user.language ?? lang)
  const [country, setCountry] = useState(() => user.country ?? guessCountry())
  const [purpose, setPurpose] = useState<Purpose | null>(user.purpose)
  const [purposeNote, setPurposeNote] = useState(user.purposeNote ?? '')
  // "Something else" opens a field for a few words in place of the choices.
  const [noteOpen, setNoteOpen] = useState(false)
  const [concerns, setConcerns] = useState<Concern[]>(() => [...(user.concerns ?? [])])
  const [phone, setPhone] = useState(user.phone ?? '')
  const [digging, setDigging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const countries = useMemo(() => listCountries(lang), [lang])
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  /** Dig one layer down (or up), then run `after` once Dwoggle has arrived. */
  const digTo = (next: number, after?: () => void) => {
    window.clearTimeout(timer.current)
    setStep(next)
    setDigging(true)
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
    return key ? t(key, { max: PURPOSE_NOTE_MAX }) : t('onboarding.error')
  }

  const toggleConcern = (concern: Concern) =>
    setConcerns((current) => (current.includes(concern) ? current.filter((c) => c !== concern) : [...current, concern]))

  const submitCountry = (event: FormEvent) => {
    event.preventDefault()
    setRefusal(null)
    digTo(2)
  }

  const choosePurpose = (option: Purpose) => {
    setPurpose(option)
    setRefusal(null)
    // "Other" asks for a few words first; every other answer moves on at once.
    if (option === 'other') setNoteOpen(true)
    else digTo(3)
  }

  const submitNote = (event: FormEvent) => {
    event.preventDefault()
    if (purposeNote.trim() === '') {
      setRefusal({ field: 'purpose_note', code: 'note_required' })
      return
    }
    setRefusal(null)
    digTo(3)
  }

  const finishConcerns = () => {
    // Start the number with the chosen country's dialling code; the visitor types the rest.
    const dial = findCountry(country)?.dial
    setPhone((current) => (current.trim() === '' && dial ? `${dial} ` : current))
    digTo(4)
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
      country,
      phone: phone.trim(),
      purpose,
      purposeNote: purpose === 'other' ? purposeNote.trim() : null,
      concerns,
    }
    auth.saveProfile(answers).then(
      // Saved: one more layer, then the app moves on to the map.
      (showProfile) => digTo(QUESTIONS, showProfile),
      (error: unknown) => {
        setSaving(false)
        if (error instanceof ProfileFieldError) {
          setRefusal({ field: error.field, code: error.code })
          const target = STEP_OF_FIELD[error.field]
          if (error.field === 'purpose_note') setNoteOpen(true)
          if (target !== 4) digTo(target)
        } else {
          setFailed(true)
        }
      },
    )
  }

  let bubble: ReactNode
  if (step === 0) {
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
                digTo(1)
              }}
            >
              <span className="brand-tile__label">{t(`lang.${option}`)}</span>
            </button>
          ))}
        </div>
      </Bubble>
    )
  } else if (step === 1) {
    const error = refusalFor('country')
    bubble = (
      <Bubble title={t('onboarding.country.title')} lead={t('onboarding.country.lead')} onBack={() => digTo(0)}>
        <form className="dig-bubble__form" onSubmit={submitCountry}>
          <label className="visually-hidden" htmlFor="dig-country">
            {t('welcome.country.label')}
          </label>
          <select
            id="dig-country"
            className="brand-input dig-bubble__select"
            autoComplete="country"
            value={country}
            aria-invalid={error !== null}
            onChange={(event) => setCountry(event.target.value)}
          >
            {countries.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
          {error && (
            <p className="brand-field__note brand-field__note--error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="brand-button">
            {t('onboarding.country.confirm')}
          </button>
        </form>
      </Bubble>
    )
  } else if (step === 2 && noteOpen) {
    const error = refusalFor('purpose', 'purpose_note')
    bubble = (
      <Bubble title={t('onboarding.purpose.title')} lead={t('purpose.other')} onBack={() => setNoteOpen(false)}>
        <form className="dig-bubble__form" onSubmit={submitNote}>
          <Field id="dig-note" label={t('onboarding.purpose.note')} error={error}>
            <input
              id="dig-note"
              className="brand-input"
              autoComplete="off"
              maxLength={PURPOSE_NOTE_MAX}
              value={purposeNote}
              aria-invalid={error !== null}
              aria-describedby="dig-note-note"
              autoFocus
              onChange={(event) => setPurposeNote(event.target.value)}
            />
          </Field>
          <button type="submit" className="brand-button">
            {t('onboarding.purpose.note_confirm')}
          </button>
        </form>
      </Bubble>
    )
  } else if (step === 2) {
    const error = refusalFor('purpose')
    bubble = (
      <Bubble title={t('onboarding.purpose.title')} lead={t('onboarding.purpose.lead')} onBack={() => digTo(1)}>
        <div className="dig-bubble__grid dig-bubble__grid--purposes" role="group" aria-labelledby="dig-question">
          {PURPOSES.map((option) => (
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
  } else if (step === 3) {
    bubble = (
      <Bubble title={t('onboarding.concerns.title')} lead={t('onboarding.concerns.lead')} onBack={() => digTo(2)}>
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
  } else if (step === 4) {
    const error = refusalFor('phone') ?? (failed ? t('onboarding.error') : null)
    bubble = (
      <Bubble title={t('onboarding.phone.title')} lead={t('onboarding.phone.lead')} onBack={saving ? undefined : () => digTo(3)}>
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

      <div className="dig__mascot" aria-hidden="true">
        <img src="/brand/dwoggle-digging.webp" alt="" width={990} height={698} />
        {CLODS.map((clod) => (
          <span key={clod} className="dig__clod" style={{ '--clod': clod } as CSSProperties} />
        ))}
      </div>
    </div>
  )
}
