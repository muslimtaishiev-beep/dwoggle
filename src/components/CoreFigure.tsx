import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { Check, CheckId } from '../api/types.ts'
import { useI18n } from '../i18n/context.ts'
import { buildSummary } from '../i18n/summary.ts'
import { slopeText } from '../report/trendText.ts'
import { Mascot } from './Mascot.tsx'
import { CheckMeta } from './CheckMeta.tsx'
import { GradeBadge } from './GradeBadge.tsx'
import { MARKER } from './map/shared.ts'
import { PixelIcon } from './PixelIcon.tsx'
import { TrendChart } from './TrendChart.tsx'
import './CoreFigure.css'

interface CoreFigureProps {
  /** Already in the fixed order, surface first. */
  checks: readonly Check[]
  /** The analysis circle, for chart labels such as "water seen within 300 m". */
  radiusM: number
  index: number
  /** Play the rise out of the ground when the figure appears. Read once, when it mounts. */
  rise: boolean
  /** The rise has finished, so it need not play again. */
  onRisen: () => void
  onSelect: (index: number) => void
}

/**
 * The rise, in two parts. First the core slides up out of the hole at the tapped point (x, y on screen),
 * layer after layer. Then it travels by (dockX, dockY) to its place in the figure, and the arrows are drawn.
 */
type Rise = 'off' | 'measuring' | { x: number; y: number; dockX: number; dockY: number }

/** Where the tapped point is on screen: the map marker is a zero-size anchor exactly on it. */
function markerPosition(): { x: number; y: number } | null {
  const marker = document.querySelector(`.${MARKER.digger.className}, .${MARKER.pin.className}`)
  if (!marker) return null
  const rect = marker.getBoundingClientRect()
  return { x: rect.left, y: rect.top }
}

/**
 * The annotated figure: a round core cut out of the ground, one layer per check from the surface down,
 * with a leader arrow from every layer to its explanation. One explanation is open at a time.
 */
export function CoreFigure({ checks, radiusM, index, rise, onRisen, onSelect }: CoreFigureProps) {
  const i18n = useI18n()
  const { lang, t } = i18n
  const gridRef = useRef<HTMLOListElement>(null)
  const plugRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartFor, setChartFor] = useState<CheckId | null>(null)
  const [rising, setRising] = useState<Rise>(rise ? 'measuring' : 'off')
  const active = checks[index]

  // Measure where the hole is on screen and how far the risen core has to travel to its place in the figure.
  useLayoutEffect(() => {
    if (rising !== 'measuring') return
    const grid = gridRef.current
    const plug = plugRef.current
    const hole = markerPosition()
    if (!grid || !plug || !hole) {
      setRising('off')
      return
    }
    const figure = grid.getBoundingClientRect()
    const risen = plug.getBoundingClientRect()
    setRising({
      x: hole.x,
      y: hole.y,
      // Top centre of the risen core to top centre of the core column of the figure.
      dockX: figure.left + risen.width / 2 - hole.x,
      dockY: figure.top - (hole.y - risen.height),
    })
  }, [rising])

  useEffect(() => {
    if (chartFor !== null) chartRef.current?.scrollIntoView({ block: 'nearest' })
  }, [chartFor])

  const chartCheck = active && chartFor === active.id && active.trend ? active : null
  const chartId = 'core-chart'

  const riseStyle =
    typeof rising === 'object'
      ? ({
          left: rising.x,
          top: rising.y,
          '--dock-x': `${rising.dockX}px`,
          '--dock-y': `${rising.dockY}px`,
        } as CSSProperties)
      : undefined
  const state = rising === 'off' ? '' : rising === 'measuring' ? ' core--measuring' : ' core--rising'

  return (
    <div className={`core${state}`}>
      {rising !== 'off' && (
        // A stand-in core that comes up out of the hole in the map, then hands over to the figure below.
        <div className="core-rise" style={riseStyle} aria-hidden="true">
          <span className="core-rise__hole" />
          <div className="core-rise__shaft">
            <div ref={plugRef} className="core-rise__plug">
              <div className="core__cap">
                <Mascot pose="idle" size="sm" />
                <span className="core__cap-face" />
              </div>
              {checks.map((check, i) => (
                <span
                  key={check.id}
                  className={`core-rise__band core__row--${check.id}`}
                  style={{ zIndex: checks.length - i }}
                />
              ))}
            </div>
          </div>
          <span className="core-rise__lip" />
        </div>
      )}
      {active && (
        <p className="visually-hidden" aria-live="polite">
          {`${t('dig.position', { current: index + 1, total: checks.length })}: ${t(`check.${active.id}`)}`}
        </p>
      )}

      <ol
        ref={gridRef}
        className="core__grid"
        onAnimationEnd={(event) => {
          // The last explanation to appear closes the rise.
          if (event.target instanceof HTMLElement && event.target.dataset.last === 'true') {
            setRising('off')
            onRisen()
          }
        }}
      >
        <li className="core__row core__row--surface">
          <div className="core__cap">
            <Mascot pose="idle" size="sm" />
            <span className="core__cap-face" />
          </div>
          <span className="core__leader" aria-hidden="true" />
          <p className="core__note">{t('dig.surface')}</p>
        </li>

        {checks.map((check, i) => {
          const name = t(`check.${check.id}`)
          const isActive = i === index
          const summary = buildSummary(check, lang)
          const chartOpen = chartCheck?.id === check.id
          return (
            <li
              key={check.id}
              className={`core__row core__row--${check.id}${i === 0 ? ' core__row--first' : ''}${isActive ? ' core__row--active' : ''}`}
              style={{ '--i': i } as CSSProperties}
              aria-current={isActive ? 'step' : undefined}
            >
              {/* The layer itself can be tapped too; the heading on the right is the keyboard control. */}
              <button
                type="button"
                className="core__band"
                tabIndex={-1}
                aria-hidden="true"
                style={{ zIndex: checks.length - i }}
                onClick={() => onSelect(i)}
              >
                <span className="core__band-number">{i + 1}</span>
              </button>
              <span className="core__leader" aria-hidden="true" />

              <article className="core__callout plate" data-last={i === checks.length - 1}>
                <h3 className="core__heading">
                  <button
                    type="button"
                    className="core__head"
                    aria-expanded={isActive}
                    title={isActive ? undefined : t('dig.go_to_layer', { current: i + 1, check: name })}
                    onClick={() => onSelect(i)}
                  >
                    <span className="core__index">{i + 1}</span>
                    <span className="core__name display">{name}</span>
                    {!isActive && <GradeBadge grade={check.grade} size="sm" />}
                  </button>
                </h3>

                {isActive && (
                  <div className="core__detail">
                    <div className="core__verdict">
                      <GradeBadge grade={check.grade} />
                      {check.grade && <p className="core__meaning">{t(`grade.${check.grade}`)}</p>}
                    </div>
                    <p className={`core__summary${summary.translated ? '' : ' core__summary--raw'}`}>
                      {summary.text}
                    </p>
                    {check.trend?.stats && (
                      <p className="core__stat">
                        {`${t('trend.slope')}: ${slopeText(check.trend.stats, check.trend.unit, i18n)} · ${t(
                          'trend.significant',
                        )}: ${check.trend.stats.significant ? t('trend.yes') : t('trend.no')}`}
                      </p>
                    )}
                    <CheckMeta check={check} />
                    {check.trend ? (
                      <button
                        type="button"
                        className="button button--primary button--small core__chart-button"
                        aria-expanded={chartOpen}
                        aria-controls={chartOpen ? chartId : undefined}
                        onClick={() => setChartFor(chartOpen ? null : check.id)}
                      >
                        <PixelIcon name="chart" />
                        {chartOpen ? t('dig.hide_chart') : t('dig.open_chart')}
                      </button>
                    ) : (
                      <p className="core__no-trend">{t('trend.no_data')}</p>
                    )}
                  </div>
                )}
              </article>
            </li>
          )
        })}
      </ol>

      {chartCheck?.trend && (
        <div ref={chartRef} id={chartId} className="core__chart plate">
          <TrendChart trend={chartCheck.trend} checkName={t(`check.${chartCheck.id}`)} radiusM={radiusM} />
        </div>
      )}

      <p className="core__caption">{t('dig.caption')}</p>
    </div>
  )
}
