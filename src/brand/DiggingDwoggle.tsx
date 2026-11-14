import { useEffect, useRef } from 'react'
import { DIG_RIG } from './diggingDwoggleRig.ts'
import './DiggingDwoggle.css'

const [WIDTH, HEIGHT] = DIG_RIG.size
const ART = { width: WIDTH, height: HEIGHT, alt: '', draggable: false } as const
const turnsAbout = ([x, y]: readonly [number, number]) => ({ transformOrigin: `${x}% ${y}%` })

/** Clods of earth thrown back by each paw: three per stroke. */
const CLODS = [0, 1, 2, 3, 4, 5] as const

/** How many times faster he digs on his way down a layer than while he waits for an answer. */
const HARD_RATE = 2.6

interface DiggingDwoggleProps {
  className?: string
  /** Digging hard: going down a layer. Otherwise he paws at the earth while the visitor reads. */
  hard: boolean
}

/**
 * Dwoggle digging. He is layers cut from one drawing (scripts/mascot-dig.py): his front paws scrape in turn,
 * each about its shoulder, his body dips with every stroke about his planted hind foot, his tail wags, earth
 * flies back from his paws, and now and then he blinks. The same motion runs faster when he digs hard: the
 * running animations change speed where they are, so nothing jumps.
 */
export function DiggingDwoggle({ className = '', hard }: DiggingDwoggleProps) {
  const root = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const animations = root.current?.getAnimations?.({ subtree: true }) ?? []
    for (const animation of animations) {
      // His blinking keeps its own pace.
      if (animation instanceof CSSAnimation && animation.animationName === 'dwoggle-dig-blink') continue
      animation.updatePlaybackRate(hard ? HARD_RATE : 1)
    }
  }, [hard])

  return (
    <span ref={root} className={`digging-dwoggle ${className}`}>
      {CLODS.map((clod) => (
        <span key={clod} className={`digging-dwoggle__clod digging-dwoggle__clod--${clod}`}>
          <i />
        </span>
      ))}
      <span className="digging-dwoggle__rock" style={turnsAbout(DIG_RIG.pivots.body)}>
        <img className="digging-dwoggle__tail" style={turnsAbout(DIG_RIG.pivots.tail)} src="/brand/dwoggle-dig-tail.webp" {...ART} />
        <img src="/brand/dwoggle-dig-body.webp" {...ART} />
        <img
          className="digging-dwoggle__paw digging-dwoggle__paw--far"
          style={turnsAbout(DIG_RIG.pivots.pawRight)}
          src="/brand/dwoggle-dig-paw-right.webp"
          {...ART}
        />
        <img
          className="digging-dwoggle__paw digging-dwoggle__paw--near"
          style={turnsAbout(DIG_RIG.pivots.pawLeft)}
          src="/brand/dwoggle-dig-paw-left.webp"
          {...ART}
        />
        <img src="/brand/dwoggle-dig-front.webp" {...ART} />
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
          {DIG_RIG.eyes.map((eye) => {
            const top = eye.cy - eye.ry
            const fur = eye.ry * 2 * eye.cheekLine
            return (
              <g key={eye.cx} className="digging-dwoggle__lid">
                <clipPath id={`dig-eye-${eye.cx}`}>
                  <ellipse cx={eye.cx} cy={eye.cy} rx={eye.rx} ry={eye.ry} />
                </clipPath>
                {/* Two flat colours, fur over cheek, as in the artwork. */}
                <g clipPath={`url(#dig-eye-${eye.cx})`}>
                  <rect className="digging-dwoggle__fur" x={eye.cx - eye.rx} y={top} width={eye.rx * 2} height={fur} />
                  <rect className="digging-dwoggle__cheek" x={eye.cx - eye.rx} y={top + fur} width={eye.rx * 2} height={eye.ry * 2 - fur} />
                </g>
                <path
                  className="digging-dwoggle__closed"
                  d={`M${eye.cx - eye.rx * 0.8} ${eye.cy + 2} Q${eye.cx} ${eye.cy + eye.ry * 0.55} ${eye.cx + eye.rx * 0.8} ${eye.cy + 2}`}
                />
              </g>
            )
          })}
        </svg>
      </span>
      <img src="/brand/dwoggle-dig-dirt.webp" {...ART} />
    </span>
  )
}
