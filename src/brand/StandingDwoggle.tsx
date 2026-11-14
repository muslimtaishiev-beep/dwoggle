import { useId } from 'react'
import './StandingDwoggle.css'

/** One eye of the standing Dwoggle, in the pixels of dwoggle-standing.webp (669 x 1000). */
interface Eye {
  cx: number
  cy: number
  rx: number
  ry: number
}

// Measured from the artwork; the fur turns to cream about two-thirds of the way down each eye.
const EYES: readonly Eye[] = [
  { cx: 226, cy: 283.5, rx: 28, ry: 27 },
  { cx: 411.5, cy: 293.5, rx: 28, ry: 28 },
]
/** How far down the eye, as a share of its height, the fur ends and the cream cheek begins. */
const CHEEK_LINE = 0.66

/**
 * His open mouth, in the artwork's pixels: it hangs from the middle of his drawn smile (the top edge follows
 * that line) and is squeezed flat into it while he is silent.
 */
const MOUTH = 'M280.7 380.6 Q296.7 376.7 305.4 367.2 Q316.2 381.9 335.6 384.5 Q337.8 413.5 309.7 417.8 Q282.4 413.5 280.7 380.6 Z'

interface StandingDwoggleProps {
  className: string
  /** He is speaking: his mouth moves. */
  talking?: boolean
}

/**
 * Dwoggle standing with his map. He blinks now and then, and his mouth moves while he speaks. The lids and the
 * mouth are drawn over the artwork in its own coordinates, so they stay in place at any size. Replace the eye
 * and mouth positions if the artwork changes.
 */
export function StandingDwoggle({ className, talking = false }: StandingDwoggleProps) {
  const id = useId()
  return (
    // data-reveal-origin: an animated change of screen opens from where he stands (motion/pageTransition.ts).
    <span className={`standing-dwoggle ${talking ? 'standing-dwoggle--talking' : ''} ${className}`} data-reveal-origin="">
      <img src="/brand/dwoggle-standing.webp" alt="" width={669} height={1000} draggable={false} />
      <svg className="standing-dwoggle__face" viewBox="0 0 669 1000" aria-hidden="true">
        {EYES.map((eye, i) => {
          const top = eye.cy - eye.ry
          const fur = eye.ry * 2 * CHEEK_LINE
          return (
            <g key={eye.cx} className="standing-dwoggle__lid">
              <clipPath id={`${id}-eye-${i}`}>
                <ellipse cx={eye.cx} cy={eye.cy} rx={eye.rx} ry={eye.ry} />
              </clipPath>
              {/* Two flat colours, fur over cheek, as in the artwork. */}
              <g clipPath={`url(#${id}-eye-${i})`}>
                <rect className="standing-dwoggle__fur" x={eye.cx - eye.rx} y={top} width={eye.rx * 2} height={fur} />
                <rect
                  className="standing-dwoggle__cheek"
                  x={eye.cx - eye.rx}
                  y={top + fur}
                  width={eye.rx * 2}
                  height={eye.ry * 2 - fur}
                />
              </g>
              <path
                className="standing-dwoggle__closed"
                d={`M${eye.cx - 19} ${eye.cy + 2} Q${eye.cx} ${eye.cy + 14} ${eye.cx + 19} ${eye.cy + 2}`}
              />
            </g>
          )
        })}
        <g className="standing-dwoggle__mouth">
          <clipPath id={`${id}-mouth`}>
            <path d={MOUTH} />
          </clipPath>
          <path className="standing-dwoggle__mouth-inside" d={MOUTH} />
          <ellipse className="standing-dwoggle__tongue" clipPath={`url(#${id}-mouth)`} cx={309} cy={413} rx={18} ry={10} />
        </g>
      </svg>
    </span>
  )
}
