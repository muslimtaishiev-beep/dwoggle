import { useEffect, useRef, type AnimationEvent, type ReactNode } from 'react'
import type { LatLon } from '../api/types.ts'
import type { ReportState } from '../api/useReport.ts'
import { DEFAULT_RADIUS_M } from '../config.ts'
import { useStepNavigation } from '../hooks/useStepNavigation.ts'
import { useI18n } from '../i18n/context.ts'
import { hasNoData, sortChecks } from '../report/checks.ts'
import { CoreFigure } from './CoreFigure.tsx'
import { PixelIcon } from './PixelIcon.tsx'
import { ReportCard } from './ReportCard.tsx'
import { StateMessage } from './StateMessage.tsx'
import './Underground.css'

export type UndergroundView = 'layers' | 'summary'

interface UndergroundProps {
  point: LatLon
  state: Exclude<ReportState, { status: 'idle' }>
  view: UndergroundView
  layerIndex: number
  /** Play the core rising out of the tapped point when the layers are shown. */
  rise: boolean
  onRisen: () => void
  /** The figure is fading out; onLeft fires when it is gone. */
  leaving: boolean
  onViewChange: (view: UndergroundView) => void
  onLayerChange: (index: number) => void
  onRetry: () => void
  onClose: () => void
  onLeft: () => void
}

/**
 * What is under the tapped place, laid over the dimmed map: the annotated core to step through,
 * then the summary report. Also carries the loading, error and no-data messages.
 */
export function Underground({
  point,
  state,
  view,
  layerIndex,
  rise,
  leaving,
  onRisen,
  onViewChange,
  onLayerChange,
  onRetry,
  onClose,
  onLeft,
}: UndergroundProps) {
  const { t, formatNumber } = useI18n()
  const bodyRef = useRef<HTMLDivElement>(null)

  // Focus moves here from the map, so the arrow keys step through layers straight away.
  useEffect(() => {
    bodyRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [view])

  const report = state.status === 'ready' && !hasNoData(state.report) ? state.report : null
  const checks = report ? sortChecks(report.checks) : []
  const lastIndex = checks.length - 1
  const index = Math.min(Math.max(layerIndex, 0), Math.max(lastIndex, 0))
  const showLayers = report !== null && view === 'layers'
  const stepping = showLayers && !leaving

  const next = () => (index < lastIndex ? onLayerChange(index + 1) : onViewChange('summary'))
  const back = () => {
    if (index > 0) onLayerChange(index - 1)
  }
  const swipe = useStepNavigation({ onNext: next, onBack: back, enabled: stepping })

  const location = state.status === 'ready' ? state.report.location : null
  const coordinate = (value: number) => formatNumber(value, { maximumFractionDigits: 4 })

  let body: ReactNode
  if (state.status === 'loading') {
    body = <StateMessage kind="loading" message={t('report.loading')} />
  } else if (state.status === 'error') {
    body = (
      <StateMessage
        kind="error"
        message={t(`report.error.${state.kind}`)}
        action={
          <button type="button" className="button button--primary" onClick={onRetry}>
            {t('report.retry')}
          </button>
        }
      />
    )
  } else if (report === null) {
    body = <StateMessage kind="empty" message={t('report.no_data')} />
  } else if (view === 'layers') {
    body = (
      <CoreFigure
        checks={checks}
        radiusM={report.location.radius_m}
        index={index}
        rise={rise}
        onRisen={onRisen}
        onSelect={onLayerChange}
      />
    )
  } else {
    body = <ReportCard report={report} />
  }

  const skip = (
    <button type="button" className="button underground__wide" onClick={() => onViewChange('summary')}>
      {t('dig.skip')}
    </button>
  )

  let deck: ReactNode = null
  if (showLayers) {
    deck = (
      <>
        <button type="button" className="button button--icon" disabled={index === 0} aria-label={t('dig.back')} onClick={back}>
          <PixelIcon name="arrow-left" />
        </button>
        {skip}
        <button
          type="button"
          className="button button--primary button--icon"
          aria-label={index < lastIndex ? t('dig.next') : t('dig.to_report')}
          onClick={next}
        >
          <PixelIcon name="arrow-right" />
        </button>
      </>
    )
  } else if (state.status === 'loading' && view === 'layers') {
    deck = skip
  } else if (view === 'summary' && (report !== null || state.status === 'loading')) {
    deck = (
      <button type="button" className="button underground__wide" onClick={() => onViewChange('layers')}>
        <PixelIcon name="arrow-left" />
        {t('dig.back_to_layers')}
      </button>
    )
  }

  // The fade-out is the only animation that runs on this element itself while leaving.
  const handleAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (leaving && event.target === event.currentTarget) onLeft()
  }

  return (
    <section
      className={`underground on-dark${leaving ? ' underground--leaving' : rise && showLayers ? ' underground--rising' : ''}`}
      aria-labelledby="underground-title"
      aria-busy={state.status === 'loading'}
      inert={leaving}
      onAnimationEnd={handleAnimationEnd}
    >
      <header className="underground__header">
        <div className="underground__inner underground__header-row">
          <div className="underground__heading">
            <div className="underground__title-row">
              <h2 id="underground-title" className="underground__title display">
                {t('report.title')}
              </h2>
              {location?.place && <p className="underground__place">{location.place.display}</p>}
            </div>
            <p className="underground__coords">
              {t('report.location', {
                radius: location?.radius_m ?? DEFAULT_RADIUS_M,
                lat: coordinate(location?.lat ?? point.lat),
                lon: coordinate(location?.lon ?? point.lon),
              })}
              {/* The place name is OpenStreetMap data: its licence asks for the credit beside it. */}
              {location?.place && (
                <>
                  {' · '}
                  <a className="underground__credit" href={location.place.attribution_url} target="_blank" rel="noreferrer">
                    {location.place.attribution}
                  </a>
                </>
              )}
            </p>
          </div>
          <button type="button" className="button button--icon" aria-label={t('report.close')} onClick={onClose}>
            <PixelIcon name="close" />
          </button>
        </div>
      </header>
      <div
        ref={bodyRef}
        tabIndex={-1}
        className="underground__body"
        aria-label={stepping ? t('dig.label') : undefined}
        role={stepping ? 'group' : undefined}
        {...swipe}
      >
        {showLayers ? body : <div className="underground__inner underground__sheet">{body}</div>}
      </div>
      {deck && (
        <div className="underground__deck">
          <div className="underground__inner underground__deck-row">{deck}</div>
        </div>
      )}
    </section>
  )
}
