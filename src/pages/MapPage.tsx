import { useCallback, useEffect, useState } from 'react'
import type { LatLon, Report } from '../api/types.ts'
import { useReport } from '../api/useReport.ts'
import { AddressSearch } from '../components/AddressSearch.tsx'
import { AskDwoggle } from '../components/AskDwoggle.tsx'
import { DwoggleChat } from '../components/DwoggleChat.tsx'
import { GradingPanel } from '../components/GradingPanel.tsx'
import { MapActions } from '../components/MapActions.tsx'
import { MapHeader } from '../components/MapHeader.tsx'
import { MapView } from '../components/MapView.tsx'
import { ReportPanel } from '../components/ReportPanel.tsx'
import { SavedPanel } from '../components/SavedPanel.tsx'
import { Underground, type UndergroundView } from '../components/Underground.tsx'
import { DEFAULT_RADIUS_M, DIG_MIN_MS } from '../config.ts'
import { isInKyrgyzstan } from '../data/coverage.ts'
import { useReducedMotion } from '../hooks/useReducedMotion.ts'
import { useSavedAreas } from '../hooks/useSavedAreas.ts'
import { useI18n } from '../i18n/context.ts'
import { withTransition } from '../motion/pageTransition.ts'
import type { Topic } from '../report/answers.ts'
import { ROUTES } from '../router.ts'
import '../brand/brand.css'
import './MapPage.css'

/**
 * idle: the map, nothing tapped yet.
 * digging: Dwoggle digs at the tapped point while the report loads; the panel already says so.
 * open: the report panel beside the map.
 * layers: the annotated core with its five layers over the dimmed map ("Layers").
 * closing: the core fades and the panel is back.
 */
type Phase = 'idle' | 'digging' | 'open' | 'layers' | 'closing'

/** A shared link names its place: /map?at=42.82400,74.60400. Places Dwoggle has no data for are ignored. */
function pointFromLink(): LatLon | null {
  const [lat, lon] = (new URLSearchParams(window.location.search).get('at') ?? '').split(',').map(Number)
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return isInKyrgyzstan({ lat, lon }) ? { lat, lon } : null
}

/**
 * The map, as the designer drew it: a brown header, the 3D satellite map, the report panel beside it, and the
 * brown ground below with the search, Dwoggle in his hole answering questions, and "Where am I", "Saved", "Layers".
 */
export default function MapPage() {
  const { lang, t } = useI18n()
  const reducedMotion = useReducedMotion()
  // A shared link opens straight on its place.
  const [linked] = useState(pointFromLink)
  const [point, setPoint] = useState<LatLon | null>(linked)
  const [phase, setPhase] = useState<Phase>(() => (linked === null ? 'idle' : reducedMotion ? 'open' : 'digging'))
  const [view, setView] = useState<UndergroundView>('layers')
  const [layerIndex, setLayerIndex] = useState(0)
  const [digDone, setDigDone] = useState(false)
  // The core rises out of the ground once per tapped place.
  const [risen, setRisen] = useState(false)
  const [gradingOpen, setGradingOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  // A place to fly to: found by the search, the visitor's position, or a shared link.
  const [place, setPlace] = useState<LatLon | null>(linked)
  const [note, setNote] = useState<string | null>(null)
  // The chat with Dwoggle, over the map; `ask` is a ready question to open it with.
  const [chat, setChat] = useState<{ ask: Topic | null } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { state, retry } = useReport(point, lang)
  const saved = useSavedAreas()

  const select = useCallback(
    (next: LatLon) => {
      // Dwoggle has data for Kyrgyzstan only; anywhere else he says so instead of digging.
      if (!isInKyrgyzstan(next)) {
        setNotice(t('map.outside'))
        return
      }
      setPoint(next)
      setView('layers')
      setLayerIndex(0)
      setDigDone(false)
      setRisen(false)
      setSavedOpen(false)
      setNote(null)
      // With reduced motion there is no dig: the panel opens straight away.
      setPhase(reducedMotion ? 'open' : 'digging')
    },
    [reducedMotion, t],
  )

  useEffect(() => {
    if (point === null) return
    const timer = window.setTimeout(() => setDigDone(true), DIG_MIN_MS)
    return () => window.clearTimeout(timer)
  }, [point])

  useEffect(() => {
    if (notice === null) return
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  // The dig ends once the report has arrived and Dwoggle has gone under.
  if (phase === 'digging' && digDone && state.status !== 'loading') {
    setPhase('open')
  }

  const report = state.status === 'ready' ? state.report : null
  const layersShown = phase === 'layers' || phase === 'closing'

  const close = useCallback(() => {
    setPoint(null)
    setPhase('idle')
  }, [])

  const save = () => {
    if (point === null) return
    saved.toggle(point, report?.location.place?.name ?? null)
  }

  const share = (shown: Report) => {
    const url = `${window.location.origin}${ROUTES.map}?at=${shown.location.lat.toFixed(5)},${shown.location.lon.toFixed(5)}`
    const title = shown.location.place ? t('panel.near', { place: shown.location.place.name }) : t('report.title')
    if (typeof navigator.share === 'function') {
      navigator.share({ title, url }).catch(() => undefined)
      return
    }
    navigator.clipboard?.writeText(url).then(
      () => setNote(t('panel.copied')),
      () => setNote(url),
    )
  }

  const whereAmI = () => {
    if (!('geolocation' in navigator)) {
      setNotice(t('actions.where_failed'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = { lat: position.coords.latitude, lon: position.coords.longitude }
        if (isInKyrgyzstan(here)) setPlace(here)
        else setNotice(t('actions.where_outside'))
      },
      () => setNotice(t('actions.where_failed')),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const panelShown = point !== null && state.status !== 'idle' && phase !== 'idle'

  // The chat opens out of Dwoggle, where he sits, and fades back to the map.
  const openChat = (ask: Topic | null) => withTransition('surface', () => setChat({ ask }))
  const closeChat = useCallback(() => withTransition('fade', () => setChat(null)), [])

  return (
    <div className={`map-page map-page--${phase}`}>
      {/* The map's own screen; out of reach while the chat is open over it. */}
      <div className="map-page__screen" inert={chat !== null}>
        <MapHeader onGrading={() => setGradingOpen(true)} />

        <main className="map-page__stage">
          <div className="map-page__map" inert={layersShown}>
            <MapView
              point={point}
              radiusM={report?.location.radius_m ?? DEFAULT_RADIUS_M}
              digging={phase === 'digging'}
              target={place}
              onSelect={select}
            />
          </div>

          {(savedOpen || panelShown) && !layersShown && (
            <aside className="map-page__side">
              {savedOpen ? (
                <SavedPanel
                  areas={saved.areas}
                  onOpen={(area) => {
                    setPlace(area)
                    select(area)
                  }}
                  onRemove={saved.remove}
                  onClose={() => setSavedOpen(false)}
                />
              ) : (
                point &&
                state.status !== 'idle' && (
                  <ReportPanel
                    state={state}
                    saved={saved.isSaved(point)}
                    note={note}
                    onSave={save}
                    onShare={share}
                    onRetry={retry}
                    onClose={close}
                  />
                )
              )}
            </aside>
          )}

          {!layersShown && (
            <button type="button" className="map-page__talk" aria-label={t('chat.open')} data-reveal-origin="" onClick={() => openChat(null)}>
              <img src="/brand/dwoggle-head.png" alt="" width={198} height={170} />
            </button>
          )}

          {point && layersShown && state.status !== 'idle' && (
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
              onClose={() => (reducedMotion ? setPhase('open') : setPhase('closing'))}
              onLeft={() => setPhase('open')}
            />
          )}
        </main>

        <footer className="map-page__ground">
          <svg className="map-page__wave" viewBox="0 0 1280 18" preserveAspectRatio="none" aria-hidden="true">
            <path className="map-page__wave-fill" d="M0 18H1280V8C1130 2 1010 14 840 9S520 3 360 10 120 14 0 6Z" />
            <path className="map-page__wave-line" d="M0 6C120 14 220 4 360 10S660 3 840 9 1130 2 1280 8" />
          </svg>
          <div className="map-page__search">
            <AddressSearch variant="pill" onPick={setPlace} />
          </div>
          <div className="map-page__ask">
            <AskDwoggle report={report} checking={phase === 'digging'} notice={notice} onChat={openChat} />
          </div>
          <div className="map-page__actions">
            <MapActions
              actions={[
                { icon: 'navigate', label: 'actions.where', onClick: whereAmI },
                { icon: 'bookmark', label: 'actions.saved', onClick: () => setSavedOpen((open) => !open), pressed: savedOpen },
                {
                  icon: 'layers',
                  label: 'actions.layers',
                  onClick: () => {
                    setSavedOpen(false)
                    setPhase('layers')
                  },
                  disabled: report === null,
                  pressed: layersShown,
                },
              ]}
            />
          </div>
        </footer>
      </div>

      {chat && <DwoggleChat report={report} ask={chat.ask} onClose={closeChat} />}
      <GradingPanel open={gradingOpen} onClose={() => setGradingOpen(false)} />
    </div>
  )
}
