import { lazy, Suspense } from 'react'
import { useAuth } from './auth/context.ts'
import { hasCachedProfile } from './auth/profile.ts'
import { EMPTY_PROFILE, type User } from './auth/types.ts'
import { Redirect } from './components/Link.tsx'
import { StateMessage } from './components/StateMessage.tsx'
import { useI18n } from './i18n/context.ts'
import { SignInPage } from './pages/SignInPage.tsx'
import { OnboardingPage } from './pages/OnboardingPage.tsx'
import { ROUTES, usePath, type Route } from './router.ts'
import './App.css'

// The map brings the 3D map library with it, so it is loaded only when the map is opened.
const MapPage = lazy(() => import('./pages/MapPage.tsx'))

function Loading() {
  const { t } = useI18n()
  return (
    <div className="app-loading">
      <StateMessage kind="loading" message={t('site.loading')} />
    </div>
  )
}

/** Where a signed-in user belongs: the dig only while the backend says their profile is incomplete. */
function homeOf(user: User): Route {
  return user.profileStatus === 'incomplete' ? ROUTES.welcome : ROUTES.map
}

/**
 * Which page to show. The main page is the sign-up page; a signed-in visitor never sees it and goes to the map,
 * or to the dig while the backend still needs their profile. The map is open to everyone: signing in only adds
 * the profile (the map then opens on the visitor's country).
 */
export default function App() {
  const path = usePath()
  const { state } = useAuth()
  const user = state.status === 'signedIn' ? state.user : null

  // Development only: the dig with an empty profile, to work on it without signing in. Saving at the end fails.
  if (import.meta.env.DEV && path === '/dev/dig') {
    return <OnboardingPage user={{ id: 'preview', name: null, email: null, profileStatus: 'incomplete', ...EMPTY_PROFILE }} />
  }

  if (path === ROUTES.map) {
    return (
      <Suspense fallback={<Loading />}>
        <MapPage country={user?.country ?? null} />
      </Suspense>
    )
  }

  if (path === ROUTES.welcome) {
    if (state.status === 'loading') return <Loading />
    if (user === null) return <Redirect to={ROUTES.signIn} />
    return user.profileStatus === 'incomplete' ? <OnboardingPage user={user} /> : <Redirect to={ROUTES.map} />
  }

  if (path === ROUTES.signIn) {
    // Until Firebase reports who is signed in: a device that remembers a user waits for it; any other
    // shows the page at once, since its visitor is almost certainly new.
    if (state.status === 'loading' && hasCachedProfile()) return <Loading />
    return user === null ? <SignInPage /> : <Redirect to={homeOf(user)} />
  }

  // Any other address, the old /sign-in among them, leads to the main page.
  return <Redirect to={ROUTES.signIn} />
}
