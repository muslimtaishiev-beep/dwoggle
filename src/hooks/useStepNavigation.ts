import { useEffect, useRef, type TouchEvent } from 'react'

const SWIPE_MIN_PX = 48

interface StepHandlers {
  onNext: () => void
  onBack: () => void
  enabled: boolean
}

/** Keys that the focused element needs for itself (map panning, form fields, open dialogs). */
function isBusyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest('.leaflet-container, .maplibregl-map, dialog[open], input, textarea, select') !== null
}

/**
 * Step navigation by arrow keys (anywhere on the page) and by horizontal swipe
 * (on the element that receives the returned touch handlers).
 */
export function useStepNavigation({ onNext, onBack, enabled }: StepHandlers) {
  const handlers = useRef({ onNext, onBack })
  useEffect(() => {
    handlers.current = { onNext, onBack }
  }, [onNext, onBack])

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isBusyTarget(event.target)) return
      if (document.querySelector('dialog[open]')) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        handlers.current.onNext()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        handlers.current.onBack()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])

  const start = useRef<{ x: number; y: number } | null>(null)

  return {
    onTouchStart(event: TouchEvent) {
      const touch = event.touches[0]
      start.current = touch && event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null
    },
    onTouchEnd(event: TouchEvent) {
      const from = start.current
      const touch = event.changedTouches[0]
      start.current = null
      if (!enabled || !from || !touch) return
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y
      // Mostly horizontal, so vertical scrolling of the layers is never mistaken for a swipe.
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return
      if (dx < 0) handlers.current.onNext()
      else handlers.current.onBack()
    },
  }
}
