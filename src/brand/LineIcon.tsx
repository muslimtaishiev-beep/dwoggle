/**
 * The line icons of the brand screens: drawn on a 24 grid with a round 2-unit stroke in the current colour,
 * like the designer's. Decorative: the button or row they sit in carries the words.
 */
const PATHS = {
  // A seismograph trace.
  earthquake: 'M2 12h4l2-5 3 10 3-14 3 13 2-4h3',
  // A house with water rising round it.
  flood: 'M5 11 12 5l7 6M7 10v5h10v-5M3 19c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0',
  // Rocks rolling down a slope.
  landslide: 'M3 20h18M3 20 17 6M14 14.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0M17.5 18a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0',
  // A thermometer.
  heat: 'M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0ZM12 10v6M17 6h2M17 9h2',
  // A leaf.
  green: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20',
  mic: 'M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3ZM6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V20M9 20h6',
  share: 'M12 15V4M8 8l4-4 4 4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  close: 'M6 6l12 12M18 6 6 18',
  // A page with a folded corner and two lines: the full report.
  document: 'M6 3h8l5 5v13H6V3ZM14 3v5h5M9 13h7M9 17h7',
  // A cog (Feather icons, MIT).
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5',
  // "Where am I": a navigation arrow.
  navigate: 'M20 4 4 11l7 2 2 7 7-16Z',
  bookmark: 'M7 4h10v16l-5-4-5 4V4Z',
  layers: 'M12 4 3 9l9 5 9-5-9-5ZM3 13.5l9 5 9-5',
  // A map pin.
  pin: 'M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11ZM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z',
  // A clock: a place looked up before.
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  back: 'M19 12H5M11 6l-6 6 6 6',
  // A paper plane.
  send: 'M21 3 3 10.5l7 2.5 2.5 7L21 3ZM10 13l4.5-4.5',
  // A loudspeaker with a sound wave.
  sound: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4v-5ZM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
} as const

export type LineIconName = keyof typeof PATHS

export function LineIcon({ name, size = 20, filled = false }: { name: LineIconName; size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      // A filled icon keeps its holes (the cog's centre).
      fillRule="evenodd"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
