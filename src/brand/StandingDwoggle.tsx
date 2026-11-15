import { useId } from 'react'
import { STANDING_RIG } from './standingDwoggleRig.ts'
import './StandingDwoggle.css'

// Where his lids and mouth go on the logo's head he wears, measured by scripts/mascot-standing.py.
const { eyes: EYES, cheekLine: CHEEK_LINE, mouth: MOUTH, tongue: TONGUE, mouthOrigin: MOUTH_ORIGIN } = STANDING_RIG

interface StandingDwoggleProps {
  className: string
  /** He is speaking: his mouth moves. */
  talking?: boolean
}

/**
 * Dwoggle standing with his map. He blinks now and then, and his mouth moves while he speaks. The lids and the
 * mouth are drawn over the artwork in its own coordinates, so they stay in place at any size; the script that
 * makes the artwork measures where they go.
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
                d={`M${eye.cx - eye.rx * 0.68} ${eye.cy + 2} Q${eye.cx} ${eye.cy + eye.ry * 0.5} ${eye.cx + eye.rx * 0.68} ${eye.cy + 2}`}
              />
            </g>
          )
        })}
        <g className="standing-dwoggle__mouth" style={{ transformOrigin: `${MOUTH_ORIGIN[0]}px ${MOUTH_ORIGIN[1]}px` }}>
          <clipPath id={`${id}-mouth`}>
            <path d={MOUTH} />
          </clipPath>
          <path className="standing-dwoggle__mouth-inside" d={MOUTH} />
          <ellipse className="standing-dwoggle__tongue" clipPath={`url(#${id}-mouth)`} cx={TONGUE.cx} cy={TONGUE.cy} rx={TONGUE.rx} ry={TONGUE.ry} />
        </g>
      </svg>
    </span>
  )
}
