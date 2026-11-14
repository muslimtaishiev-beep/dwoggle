import { useCallback, useEffect, useState } from 'react'
import type { LatLon } from '../api/types.ts'
import { useReport } from '../api/useReport.ts'
import { AddressSearch } from '../components/AddressSearch.tsx'
import { Mascot } from '../components/Mascot.tsx'
import { GradingPanel } from '../components/GradingPanel.tsx'
import { LanguageMenu } from '../components/LanguageMenu.tsx'
import { MapView } from '../components/MapView.tsx'
import { Underground, type UndergroundView } from '../components/Underground.tsx'
import type { MapStart } from '../components/map/shared.ts'
import { DEFAULT_RADIUS_M, DIG_MIN_MS, MAP_DEFAULT_CENTER } from '../config.ts'
import { countryView, DEFAULT_COUNTRY, findCountry } from '../data/countries.ts'
import { useReducedMotion } from '../hooks/useReducedMotion.ts'
import { useI18n } from '../i18n/context.ts'
import { useAuth } from '../auth/context.ts'
import { BrandMark } from '../brand/BrandMark.tsx'
import { Link } from '../components/Link.tsx'
import { ROUTES } from '../router.ts'
import './MapPage.css'

/**
 * idle: the map, nothing tapped yet.
 * digging: Dwoggle sinks into the ground at the tapped point while the report loads.
 * open: the core has risen out of that point and the annotated figure lies over the dimmed map
 *       (or the summary, or a loading / error / no-data message).
 * closing: the figure fades and the map comes back.
 */
type Phase = 'idle' | 'digging' | 'open' | 'closing'

const CITY_VIEW: MapStart = { center: MAP_DEFAULT_CENTER, span: 'city' }

/**
 * Where the map opens. The visitor's country decides it, so they see their own region first.
 * The home country opens on its capital at street level, where the 3D buildings show.
 */
function startFor(countryCode: string | null): MapStart {
  const country = findCountry(countryCode)
  if (!country || country.code === DEFAULT_COUNTRY) return CITY_VIEW
  return countryView(country)
}

interface MapPageProps {
  /** ISO code of the signed-in visitor's country, or null when there is no account. */
  country: string | null
}

export default function MapPage({ country }: MapPageProps) {
  const { lang, t } = useI18n()
  const { state: account } = useAuth()
  const reducedMotion = useReducedMotion()
  const [point, setPoint] = useState<LatLon | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [view, setView] = useState<UndergroundView>('layers')
  const [layerIndex, setLayerIndex] = useState(0)
  const [digDone, setDigDone] = useState(false)
  // The core rises out of the ground once per tapped place.
  const [risen, setRisen] = useState(false)
  const [gradingOpen, setGradingOpen] = useState(false)
  // A place found by the address search. The map moves there; the user still taps the exact spot.
  const [place, setPlace] = useState<LatLon | null>(null)
  const { state, retry } = useReport(point, lang)

  const select = useCallback(
    (next: LatLon) => {
      setPoint(next)
      setView('layers')
      setLayerIndex(0)
      setDigDone(false)
      setRisen(false)
      // With reduced motion there is no dig: the layers open straight away.
      setPhase(reducedMotion ? 'open' : 'digging')
    },
    [reducedMotion],
  )

  useEffect(() => {
    if (point === null) return
    const timer = window.setTimeout(() => setDigDone(true), DIG_MIN_MS)
    return () => window.clearTimeout(timer)
  }, [point])

  // The dig ends once the report has arrived and Dwoggle has gone under. Then the core rises.
  if (phase === 'digging' && digDone && state.status !== 'loading') {
    setPhase('open')
  }

  const report = state.status === 'ready' ? state.report : null
  const figureShown = phase === 'open' || phase === 'closing'

  const skipToReport = () => {
    setView('summary')
    setPhase('open')
  }

  const backToMap = useCallback(() => {
    setPoint(null)
    setPhase('idle')
  }, [])

  // With motion, the figure fades first and the map is restored when that has finished.
  const close = () => (reducedMotion ? backToMap() : setPhase('closing'))

  return (
    <div className={`app app--${phase}`}>
      <header className="app__hud">
        <h1 className="app__title plate">
          <Link to={ROUTES.landing} className="app__home" aria-label={t('site.home')}>
            <BrandMark />
          </Link>
        </h1>
        <LanguageMenu />
        {phase === 'idle' && <AddressSearch onPick={setPlace} />}
      </header>

      <main className="app__stage">
        <div className="app__surface" inert={phase === 'open'}>
          <MapView
            point={point}
            radiusM={report?.location.radius_m ?? DEFAULT_RADIUS_M}
            digging={phase === 'digging'}
            target={place}
            start={startFor(country)}
            onSelect={select}
          />

          {phase === 'idle' && (
            <div className="app__ledge">
              <Mascot pose="idle" size="md" label={t('bekem.waiting')} />
              <p className="app__bubble plate">{t('map.hint')}</p>
            </div>
          )}

          {phase === 'digging' && (
            <div className="app__dig-status">
              <p className="app__bubble plate" role="status">
                {t('bekem.loading')}
              </p>
              <button type="button" className="button" onClick={skipToReport}>
                {t('dig.skip')}
              </button>
            </div>
          )}
        </div>

        {point && figureShown && state.status !== 'idle' && (
          <Underground
            key={`${point.lat},${point.lon}`}
            point={point}
            state={state}
            view={view}
            layerIndex={layerIndex}
            rise={!reducedMotion && !risen}
            onRisen={() => setRisen(true)}
            leaving={phase === 'closing'}
            onViewChange={setView}
            onLayerChange={setLayerIndex}
            onRetry={retry}
            onClose={close}
            onLeft={backToMap}
          />
        )}
      </main>

      <footer className="app__footer on-dark">
        <p className="app__disclaimer">{t('app.disclaimer')}</p>
        <div className="app__footer-actions">
          <button type="button" className="button button--small" onClick={() => setGradingOpen(true)}>
            {t('header.how_we_grade')}
          </button>
          {account.status === 'signedOut' && (
            <Link to={ROUTES.signIn} className="button button--small app__sign-in">
              {t('site.sign_in')}
            </Link>
          )}
        </div>
      </footer>

      <GradingPanel open={gradingOpen} onClose={() => setGradingOpen(false)} />
    </div>
  )
}
