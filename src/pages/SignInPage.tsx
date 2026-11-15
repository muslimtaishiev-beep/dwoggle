import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context.ts'
import { toAuthError, type AuthErrorKind } from '../auth/errors.ts'
import { isReturningDevice } from '../auth/returning.ts'
import { MIN_PASSWORD_LENGTH, normalizeEmail } from '../auth/validate.ts'
import { BrandHeader } from '../brand/BrandHeader.tsx'
import { BubbleTail } from '../brand/BubbleTail.tsx'
import { StandingDwoggle } from '../brand/StandingDwoggle.tsx'
import { SurfaceScene } from '../brand/SurfaceScene.tsx'
import { useI18n } from '../i18n/context.ts'
import { Link } from '../components/Link.tsx'
import { ROUTES } from '../router.ts'
import type { MessageKey } from '../i18n/i18n.ts'
import { preloadMapPage } from './mapPageLoader.ts'
import './SignInPage.css'

type Mode = 'create' | 'signIn'

interface Problem {
  readonly key: MessageKey
  /** Which field the problem belongs to; none means the request itself failed. */
  readonly field?: 'email' | 'password'
}

const PROBLEMS: Readonly<Partial<Record<AuthErrorKind, Problem>>> = {
  network: { key: 'auth.error.network' },
  cancelled: { key: 'auth.error.cancelled' },
  popup_blocked: { key: 'auth.error.popup_blocked' },
  not_enabled: { key: 'auth.error.not_enabled' },
  too_many: { key: 'auth.error.too_many' },
  wrong_password: { key: 'auth.error.wrong_password', field: 'password' },
  weak_password: { key: 'auth.error.weak_password', field: 'password' },
  email_in_use: { key: 'auth.error.email_in_use', field: 'email' },
  invalid_email: { key: 'auth.error.email', field: 'email' },
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M4 4l16 16" />}
    </svg>
  )
}

/**
 * Create an account or log in: Google, or email and password. After a sign-in the app moves on by itself,
 * to the dig (the three questions) the first time and to the map afterwards.
 */
export function SignInPage() {
  const { t } = useI18n()
  const auth = useAuth()
  // Someone who has signed in on this device before is most likely back to log in.
  const [mode, setMode] = useState<Mode>(() => (isReturningDevice() ? 'signIn' : 'create'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [resetSentTo, setResetSentTo] = useState<string | null>(null)

  // Someone who logs in goes straight to the map: have its code ready, so that change of screen can be animated.
  useEffect(preloadMapPage, [])

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setProblem(null)
    try {
      await task()
    } catch (error) {
      const kind = toAuthError(error).kind
      // Creating an account that already exists: the page turns to logging in, the email and password stay.
      if (kind === 'email_in_use') setMode('signIn')
      setProblem(PROBLEMS[kind] ?? { key: 'auth.error.server' })
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setResetSentTo(null)
    const address = normalizeEmail(email)
    if (address === null) return setProblem({ key: 'auth.error.email', field: 'email' })
    if (password === '') return setProblem({ key: 'auth.error.password', field: 'password' })
    if (mode === 'create' && password.length < MIN_PASSWORD_LENGTH) {
      return setProblem({ key: 'auth.error.weak_password', field: 'password' })
    }
    void run(() => (mode === 'create' ? auth.createAccount(address, password) : auth.signInWithEmail(address, password)))
  }

  const resetPassword = () => {
    const address = normalizeEmail(email)
    if (address === null) return setProblem({ key: 'auth.error.email', field: 'email' })
    void run(async () => {
      await auth.sendPasswordReset(address)
      setResetSentTo(address)
    })
  }

  const switchMode = () => {
    setMode(mode === 'create' ? 'signIn' : 'create')
    setProblem(null)
    setResetSentTo(null)
  }

  const emailProblem = problem?.field === 'email' ? t(problem.key) : null
  const passwordProblem = problem?.field === 'password' ? t(problem.key) : null
  const requestProblem = problem && !problem.field ? t(problem.key) : null
  const creating = mode === 'create'

  return (
    <div className="brand-page sign-in">
      <SurfaceScene />
      <BrandHeader />

      <main className="sign-in__layout">
        <section className="sign-in__panel" aria-labelledby="sign-in-title">
          {/* New here, or back: one press between the two, at the top where it is seen first. */}
          <div className="sign-in__tabs" role="group" aria-label={t('auth.tabs')}>
            {(['create', 'signIn'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className="sign-in__tab"
                aria-pressed={mode === option}
                disabled={busy}
                onClick={() => mode !== option && switchMode()}
              >
                {t(option === 'create' ? 'auth.tab.create' : 'auth.tab.sign_in')}
              </button>
            ))}
          </div>

          <h1 id="sign-in-title" className="sign-in__title brand-display">
            {t(creating ? 'auth.title' : 'auth.login.title')}
          </h1>
          <p className="sign-in__lead">{t(creating ? 'auth.lead' : 'auth.login.lead')}</p>

          <button type="button" className="sign-in__google" disabled={busy} onClick={() => void run(auth.signInWithGoogle)}>
            <img src="/brand/google-g.svg" alt="" width={20} height={20} />
            <span>{t('auth.google')}</span>
          </button>

          <p className="sign-in__or">{t('auth.or')}</p>

          <form className="sign-in__form" noValidate onSubmit={submit}>
            <div className="brand-field">
              <label className="brand-field__label" htmlFor="sign-in-email">
                {t('auth.email.label')}
              </label>
              <input
                id="sign-in-email"
                className="brand-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t('auth.email.placeholder')}
                aria-invalid={emailProblem !== null}
                aria-describedby={emailProblem ? 'sign-in-email-note' : undefined}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              {emailProblem && (
                <p id="sign-in-email-note" className="brand-field__note brand-field__note--error" role="alert">
                  {emailProblem}
                </p>
              )}
            </div>

            <div className="brand-field">
              <label className="brand-field__label" htmlFor="sign-in-password">
                {t('auth.password.label')}
              </label>
              <div className="brand-field__box">
                <input
                  id="sign-in-password"
                  className="brand-input"
                  type={reveal ? 'text' : 'password'}
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  placeholder={t(creating ? 'auth.password.placeholder_new' : 'auth.password.placeholder')}
                  aria-invalid={passwordProblem !== null}
                  aria-describedby="sign-in-password-note"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="brand-field__reveal"
                  aria-label={t(reveal ? 'auth.password.hide' : 'auth.password.show')}
                  aria-pressed={reveal}
                  onClick={() => setReveal(!reveal)}
                >
                  <EyeIcon open={!reveal} />
                </button>
              </div>
              <p
                id="sign-in-password-note"
                className={`brand-field__note${passwordProblem ? ' brand-field__note--error' : ''}`}
                role={passwordProblem ? 'alert' : undefined}
              >
                {passwordProblem ?? (creating ? t('auth.password.new_hint') : '')}
              </p>
            </div>

            <button type="submit" className="brand-button sign-in__submit" disabled={busy}>
              {busy ? t('auth.working') : t(creating ? 'auth.email.create' : 'auth.email.sign_in')}
            </button>
          </form>

          {requestProblem && (
            <p className="sign-in__error" role="alert">
              {requestProblem}
            </p>
          )}
          {resetSentTo && (
            <p className="sign-in__notice" role="status">
              {t('auth.email.reset_sent', { email: resetSentTo })}
            </p>
          )}

          {/* The map works without an account: signing in only keeps saved places and gives more full reports. */}
          <p className="sign-in__switch">
            <Link to={ROUTES.map} className="sign-in__link">
              {t('auth.skip')}
            </Link>
          </p>
          {!creating && (
            <p className="sign-in__switch">
              <button type="button" className="sign-in__link" disabled={busy} onClick={resetPassword}>
                {t('auth.email.forgot')}
              </button>
            </p>
          )}
        </section>

        <figure className="sign-in__mascot">
          <StandingDwoggle className="sign-in__dwoggle" />
          <p className="sign-in__bubble brand-display">
            {t('auth.greeting')}
            {/* Traced from the design: base 737..767 on the bubble's bottom edge, tip at 790, 285. */}
            <BubbleTail className="sign-in__bubble-tail" width={70} height={30} base={[7, 37]} tip={[60, 28]} />
          </p>
        </figure>
      </main>
    </div>
  )
}
