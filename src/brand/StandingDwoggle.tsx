import { useId, type CSSProperties } from 'react'
import { RIG } from './standingDwoggleRig.ts'
import './StandingDwoggle.css'
import './StandingDwoggleFold.css'

/** One eye of the standing Dwoggle, in the pixels of his layers (669 x 1000). */
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

/** The artwork's size; every layer is cut from it at this size, so they stack exactly. */
const ART = { width: 669, height: 1000 } as const
const VIEW_BOX = `0 0 ${ART.width} ${ART.height}`

// The left arm: shoulder to elbow, elbow to wrist, then the paw. Each joint turns about its own point; the
// segments are drawn pointing right from the shoulder and turned into place by the animation.
const [SHOULDER_X, SHOULDER_Y] = RIG.shoulder
const ELBOW_X = SHOULDER_X + RIG.upper
const WRIST_X = ELBOW_X + RIG.fore
const [REST_UPPER, REST_FORE, REST_PAW] = RIG.rest

const joint = (x: number, turn: number): CSSProperties => ({
  transformOrigin: `${x}px ${SHOULDER_Y}px`,
  transform: `rotate(${turn}deg)`,
})

/** Where the paw image goes in the paw's own frame, so that at rest it sits exactly where the drawing has it. */
const PAW_X = RIG.paw.x + WRIST_X - RIG.wrist[0]
const PAW_Y = RIG.paw.y + SHOULDER_Y - RIG.wrist[1]

/** The arm's joints; with `drawn` the segments themselves, without it only the paw at the end. */
function ArmChain({ drawn }: { drawn: boolean }) {
  const segment = (x: number, length: number) => (
    <rect
      className="standing-dwoggle__segment"
      x={x - RIG.thick / 2}
      y={SHOULDER_Y - RIG.thick / 2}
      width={length + RIG.thick}
      height={RIG.thick}
      rx={RIG.thick / 2}
      strokeWidth={RIG.line}
    />
  )
  return (
    <g className="standing-dwoggle__upper" style={joint(SHOULDER_X, REST_UPPER)}>
      {drawn && segment(SHOULDER_X, RIG.upper)}
      <g className="standing-dwoggle__fore" style={joint(ELBOW_X, REST_FORE)}>
        {drawn && segment(ELBOW_X, RIG.fore)}
        <g className="standing-dwoggle__paw" style={joint(WRIST_X, REST_PAW)}>
          {!drawn && (
            <image href="/brand/dwoggle-paw-left.webp" x={PAW_X} y={PAW_Y} width={RIG.paw.width} height={RIG.paw.height} />
          )}
        </g>
      </g>
    </g>
  )
}

/**
 * Dwoggle standing with his map, blinking now and then, and now and then closing the map like a book and opening
 * it again: his right paw keeps the right half, his left paw brings the left half over onto it. He is layers cut
 * from one drawing (scripts/mascot-layers.py): his body with the map's right half, the left half's printed and
 * paper sides, its shadow, both paws, and the left arm, which the map hides in the drawing. In the open pose the
 * layers add up to the drawing itself. The lids are drawn over the eyes in the artwork's own coordinates.
 */
export function StandingDwoggle({ className }: { className: string }) {
  const lid = useId()
  const axis = { '--fold-axis': `${RIG.axis[0]}% ${RIG.axis[1]}%` } as CSSProperties
  return (
    <span className={`standing-dwoggle ${className}`} style={axis}>
      <img src="/brand/dwoggle-body.webp" alt="" {...ART} draggable={false} />
      <svg className="standing-dwoggle__layer" viewBox={VIEW_BOX} aria-hidden="true">
        {EYES.map((eye, i) => {
          const top = eye.cy - eye.ry
          const fur = eye.ry * 2 * CHEEK_LINE
          return (
            <g key={eye.cx} className="standing-dwoggle__lid">
              <clipPath id={`${lid}-${i}`}>
                <ellipse cx={eye.cx} cy={eye.cy} rx={eye.rx} ry={eye.ry} />
              </clipPath>
              {/* Two flat colours, fur over cheek, as in the artwork. */}
              <g clipPath={`url(#${lid}-${i})`}>
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
      </svg>
      <img className="standing-dwoggle__layer standing-dwoggle__shadow" src="/brand/dwoggle-map-shadow.webp" alt="" {...ART} draggable={false} />
      <img className="standing-dwoggle__layer standing-dwoggle__map-back" src="/brand/dwoggle-map-back.webp" alt="" {...ART} draggable={false} />
      <img className="standing-dwoggle__layer" src="/brand/dwoggle-paw-right.webp" alt="" {...ART} draggable={false} />
      <svg className="standing-dwoggle__layer standing-dwoggle__arm" viewBox={VIEW_BOX} aria-hidden="true">
        <ArmChain drawn />
      </svg>
      <img className="standing-dwoggle__layer standing-dwoggle__map-left" src="/brand/dwoggle-map-left.webp" alt="" {...ART} draggable={false} />
      <svg className="standing-dwoggle__layer" viewBox={VIEW_BOX} aria-hidden="true">
        <ArmChain drawn={false} />
      </svg>
    </span>
  )
}
