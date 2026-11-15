import { useEffect, useRef, type CSSProperties } from 'react'
import { DIG_RIG } from './diggingDwoggleRig.ts'
import './DiggingDwoggle.css'

const [WIDTH, HEIGHT] = DIG_RIG.size
const ART = { width: WIDTH, height: HEIGHT, alt: '', draggable: false } as const
const turnsAbout = ([x, y]: readonly [number, number]) => ({ transformOrigin: `${x}% ${y}%` })

/**
 * One bit of earth: where it starts (% of the drawing), how far it flies sideways and how high it goes (in widths
 * of the drawing, cqw), its size, when in the cycle it is thrown (0..1), how much it spins, and its shade.
 */
interface Bit {
  readonly x: number
  readonly y: number
  readonly dx: number
  readonly dy: number
  readonly size: number
  readonly at: number
  readonly spin: number
  readonly tone: 0 | 1 | 2
}

// The near paw pulls back at about 30 % of the cycle, the far one at about 80 %.
const NEAR = 0.3
const FAR = 0.8

/** Clods thrown out behind him, from under his hind legs: big, far and high, as a dog's are. */
const BEHIND: readonly Bit[] = [
  { x: 76, y: 86, dx: 22, dy: -44, size: 6, at: NEAR, spin: 300, tone: 0 },
  { x: 79, y: 89, dx: 30, dy: -26, size: 4.4, at: NEAR + 0.02, spin: -260, tone: 1 },
  { x: 74, y: 84, dx: 12, dy: -56, size: 3.6, at: NEAR + 0.04, spin: 200, tone: 2 },
  { x: 81, y: 90, dx: 34, dy: -14, size: 3, at: NEAR + 0.01, spin: 420, tone: 1 },
  { x: 77, y: 87, dx: 18, dy: -34, size: 2.4, at: NEAR + 0.06, spin: -380, tone: 0 },
  { x: 75, y: 85, dx: 26, dy: -50, size: 5.4, at: FAR, spin: -320, tone: 1 },
  { x: 80, y: 90, dx: 33, dy: -20, size: 4, at: FAR + 0.02, spin: 280, tone: 0 },
  { x: 73, y: 84, dx: 9, dy: -60, size: 3.2, at: FAR + 0.03, spin: -220, tone: 2 },
  { x: 82, y: 91, dx: 36, dy: -10, size: 2.6, at: FAR + 0.01, spin: 360, tone: 0 },
  { x: 78, y: 88, dx: 20, dy: -38, size: 2.1, at: FAR + 0.05, spin: 400, tone: 2 },
]

/** Crumbs kicked up where each paw bites into the ground: small, quick, in front of him. */
const AT_PAWS: readonly Bit[] = [
  { x: 22, y: 95, dx: -12, dy: -12, size: 2.6, at: NEAR - 0.04, spin: 240, tone: 1 },
  { x: 25, y: 96, dx: -3, dy: -13, size: 2, at: NEAR - 0.03, spin: -200, tone: 2 },
  { x: 20, y: 96, dx: -16.8, dy: -10.2, size: 1.6, at: NEAR - 0.02, spin: 180, tone: 0 },
  { x: 27, y: 95, dx: 12.6, dy: -13.6, size: 1.8, at: NEAR - 0.01, spin: -260, tone: 1 },
  { x: 46, y: 97, dx: -7, dy: -13, size: 2.4, at: FAR - 0.04, spin: 220, tone: 2 },
  { x: 49, y: 97, dx: 11.2, dy: -15.3, size: 2, at: FAR - 0.03, spin: -240, tone: 0 },
  { x: 44, y: 98, dx: -14, dy: -10.2, size: 1.6, at: FAR - 0.02, spin: 200, tone: 1 },
  { x: 51, y: 97, dx: 16.8, dy: -14, size: 1.4, at: FAR - 0.01, spin: -180, tone: 2 },
]

/** A puff of dust where each paw strikes. */
const PUFFS: readonly { x: number; y: number; at: number }[] = [
  { x: 23, y: 94, at: NEAR - 0.05 },
  { x: 47, y: 96, at: FAR - 0.05 },
]

const bitStyle = (bit: Bit): CSSProperties =>
  ({
    left: `${bit.x}%`,
    top: `${bit.y}%`,
    width: `${bit.size}cqw`,
    '--dx': `${bit.dx}cqw`,
    '--dy': `${bit.dy}cqw`,
    '--spin': `${bit.spin}deg`,
    '--at': bit.at,
  }) as CSSProperties

function Bits({ bits, kind }: { bits: readonly Bit[]; kind: 'behind' | 'paws' }) {
  return bits.map((bit, i) => (
    <span key={i} className={`digging-dwoggle__bit digging-dwoggle__bit--${kind}`} style={bitStyle(bit)}>
      <i className={`digging-dwoggle__tone--${bit.tone}`} />
    </span>
  ))
}

/**
 * How many times faster he digs on his way down a layer than while he waits for an answer. The camera goes down a
 * whole screen in 900 ms (--duration-descend); at 3x a cycle takes 300 ms, so his paws scrape six times on the
 * way and keep up with the earth moving past instead of trailing it.
 */
const HARD_RATE = 3

interface DiggingDwoggleProps {
  className?: string
  /** Digging hard: going down a layer. Otherwise he paws at the earth while the visitor reads. */
  hard: boolean
}

/**
 * Dwoggle digging. He is layers cut from one drawing (scripts/mascot-dig.py): his front paws scrape in turn,
 * each about its shoulder (reach forward, bite, pull back hard), his body pitches with every stroke about his
 * planted hind foot, his tail wags, clods fly out behind him, crumbs and dust jump up where his paws strike, and
 * now and then he blinks. The same motion runs faster when he digs hard: the
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
      {/* Thrown out behind him: drawn behind his body, so they come out from under his hind legs. */}
      <Bits bits={BEHIND} kind="behind" />
      {/* The hole under his front paws: what they dig into, and what shows when a paw lifts. */}
      <span className="digging-dwoggle__hole" />
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
        {/* The logo's own clean head, so the digging Dwoggle is the same as the one in the logo. */}
        <img src="/brand/dwoggle-dig-head.webp" {...ART} />
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
      {PUFFS.map((puff) => (
        <span
          key={puff.x}
          className="digging-dwoggle__puff"
          style={{ left: `${puff.x}%`, top: `${puff.y}%`, '--at': puff.at } as CSSProperties}
        />
      ))}
      <Bits bits={AT_PAWS} kind="paws" />
    </span>
  )
}
