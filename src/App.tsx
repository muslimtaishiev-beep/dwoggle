import { lazy, Suspense } from 'react'
import { useAuth } from './auth/context.ts'
import { EMPTY_PROFILE } from './auth/types.ts'
import { Redirect } from './components/Link.tsx'
import { StateMessage } from './components/StateMessage.tsx'
import { useI18n } from './i18n/context.ts'
import { LandingPage } from './pages/LandingPage.tsx'
import { SignInPage } from './pages/SignInPage.tsx'
import { OnboardingPage } from './pages/OnboardingPage.tsx'
import { ROUTES, usePath } from './router.ts'
import './pages/site.css'

// The map brings the 3D map library with it, so it is loaded only when the map is opened.
const MapPage = lazy(() => import('./pages/MapPage.tsx'))

function Loading() {
  const { t } = useI18n()
  return (
    <div className="site">
      <div className="site__center site__center--middle">
        <StateMessage kind="loading" message={t('site.loading')} />
      </div>
    </div>
  )
}

/**
 * Which page to show. The landing page and the map are open to everyone: signing in only adds the profile
 * (the map opens on the visitor's country). A signed-in visitor never sees the sign-in page,
 * and the questions of the dig are asked until the backend has the profile it needs.
 */
export default function App() {
  const path = usePath()
  const { state } = useAuth()
  const user = state.status === 'signedIn' ? state.user : null

  // Development only: the dig with an empty profile, to work on it without signing in. Saving at the end fails.
  if (import.meta.env.DEV && path === '/dev/dig') {
    return <OnboardingPage user={{ id: 'preview', name: null, email: null, profileComplete: false, ...EMPTY_PROFILE }} />
  }

  if (path === ROUTES.map) {
    return (
      <Suspense fallback={<Loading />}>
        <MapPage country={user?.country ?? null} />
      </Suspense>
    )
  }

  if (path === ROUTES.signIn) {
    if (state.status === 'loading') return <Loading />
    if (user === null) return <SignInPage />
    return <Redirect to={user.profileComplete ? ROUTES.map : ROUTES.welcome} />
  }

  if (path === ROUTES.welcome) {
    if (state.status === 'loading') return <Loading />
    if (user === null) return <Redirect to={ROUTES.signIn} />
    return user.profileComplete ? <Redirect to={ROUTES.map} /> : <OnboardingPage user={user} />
  }

  return path === ROUTES.landing ? <LandingPage /> : <Redirect to={ROUTES.landing} />
}
