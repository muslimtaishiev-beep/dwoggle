/** Icons drawn on a 7 x 7 pixel grid, so they match the pixel face. '#' is a filled pixel. */
const ICONS = {
  'arrow-left': ['...#...', '..##...', '.######', '#######', '.######', '..##...', '...#...'],
  'arrow-right': ['...#...', '...##..', '######.', '#######', '######.', '...##..', '...#...'],
  close: ['#.....#', '##...##', '.##.##.', '..###..', '.##.##.', '##...##', '#.....#'],
  search: ['.###...', '#...#..', '#...#..', '#...#..', '.###...', '....##.', '.....##'],
  chart: ['#......', '#.....#', '#...#.#', '#.#.#.#', '#.#.#.#', '#.#.#.#', '#######'],
  'chevron-down': ['.......', '#.....#', '##...##', '.##.##.', '..###..', '...#...', '.......'],
  'chevron-up': ['.......', '...#...', '..###..', '.##.##.', '##...##', '#.....#', '.......'],
} as const

export type PixelIconName = keyof typeof ICONS

const GRID = 7

interface PixelIconProps {
  name: PixelIconName
  /** Rendered size in CSS pixels; multiples of 7 stay crisp. */
  size?: number
}

/** Decorative only: the button or link around it carries the accessible name. */
export function PixelIcon({ name, size = 14 }: PixelIconProps) {
  return (
    <svg
      className="pixel-icon"
      width={size}
      height={size}
      viewBox={`0 0 ${GRID} ${GRID}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name].flatMap((row, y) =>
        [...row].map((cell, x) => (cell === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)),
      )}
    </svg>
  )
}
