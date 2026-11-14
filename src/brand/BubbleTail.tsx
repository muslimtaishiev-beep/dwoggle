import './brand.css'

interface BubbleTailProps {
  /** Both ends of the tail's base and its tip, in the tail's own box (viewBox units), as drawn by the designer. */
  base: readonly [number, number]
  tip: readonly [number, number]
  /** The box: its size in viewBox units. Where it sits and how big it is on screen is set in CSS. */
  width: number
  height: number
  className: string
}

/**
 * The tail of a speech bubble: a thin wedge from the bubble's bottom edge to a point near the speaker.
 * The fill starts a few units above the base so it covers the bubble's border there.
 */
export function BubbleTail({ base, tip, width, height, className }: BubbleTailProps) {
  const [left, right] = base
  const [tipX, tipY] = tip
  const top = 4
  return (
    <svg className={`bubble-tail ${className}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path className="bubble-tail__fill" d={`M${left} 0 L${right} 0 L${right} ${top} L${tipX} ${tipY} L${left} ${top} Z`} />
      <path className="bubble-tail__line" d={`M${left} ${top} L${tipX} ${tipY} L${right} ${top}`} />
    </svg>
  )
}
