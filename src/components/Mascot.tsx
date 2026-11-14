import { useState } from 'react'
import type { Mood } from '../api/types.ts'
import './Mascot.css'

export type MascotPose = 'idle' | Mood

// Placeholder art lives in public/bekem/; replace the files to swap in the final mascot.
const POSE_IMAGES: Record<MascotPose, string> = {
  idle: '/bekem/idle.svg',
  relaxed: '/bekem/relaxed.svg',
  alert: '/bekem/alert.svg',
  whistling: '/bekem/whistling.svg',
}

// Fetch every pose up front, so a mood portrait never pops in late.
if (typeof Image !== 'undefined') {
  for (const src of Object.values(POSE_IMAGES)) new Image().src = src
}

interface MascotProps {
  pose: MascotPose
  size: 'sm' | 'md' | 'portrait'
  /** Text alternative. Leave out when a visible caption already says the same thing. */
  label?: string
}

/** Dwoggle in a fixed-size box, so artwork of any size can be dropped in without moving the layout. */
export function Mascot({ pose, size, label }: MascotProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const src = POSE_IMAGES[pose]
  const className = `mascot mascot--${size}`

  // If the image fails, the box keeps its size and still carries the label.
  if (src === failedSrc) {
    return <div className={`${className} mascot--missing`} role={label ? 'img' : undefined} aria-label={label} />
  }
  return (
    <div className={className}>
      <img className="mascot__image" src={src} alt={label ?? ''} draggable={false} onError={() => setFailedSrc(src)} />
    </div>
  )
}
