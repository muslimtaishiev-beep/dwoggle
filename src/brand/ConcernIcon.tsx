import type { Concern } from '../auth/types.ts'

const PATHS: Record<Concern, string> = {
  // A house with water rising round it.
  flood: 'M5 11 12 5l7 6M7 10v5h10v-5M3 19c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0',
  // Rocks rolling down a slope.
  landslide: 'M3 20h18M3 20 17 6M14 14.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0M17.5 18a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0',
  // A seismograph trace.
  earthquake: 'M2 12h4l2-5 3 10 3-14 3 13 2-4h3',
  // A thermometer.
  heat: 'M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0ZM12 10v6M17 6h2M17 9h2',
}

export function ConcernIcon({ concern }: { concern: Concern }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[concern]} />
    </svg>
  )
}
