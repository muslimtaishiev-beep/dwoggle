import { flushSync } from 'react-dom'

/**
 * The animated changes of screen. Each kind has its own rules in pageTransition.css:
 * - enter-dig: after signing in, the form goes and Dwoggle drops to all fours to dig.
 * - question: one question of the dig gives way to the next.
 * - surface: the map opens out of the hole Dwoggle stands in.
 * - fade: a plain cross-fade, which is also what "reduce motion" gets in place of the others.
 */
export type TransitionKind = 'enter-dig' | 'question' | 'surface' | 'fade'

/**
 * Makes a change of screen as a view transition of the given kind, where the browser can; otherwise it just
 * makes the change. `update` must change React state; it is flushed at once so the browser can compare the
 * screen before and after.
 */
export function withTransition(kind: TransitionKind, update: () => void): void {
  if (typeof document.startViewTransition !== 'function') {
    update()
    return
  }
  const root = document.documentElement
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  root.dataset.transition = reduced ? 'fade' : kind
  placeReveal(root)
  const transition = document.startViewTransition(() => flushSync(update))
  const done = () => {
    delete root.dataset.transition
  }
  transition.finished.then(done, done)
}

/** The "surface" reveal opens from the middle of Dwoggle, wherever he is on the screen being left. */
function placeReveal(root: HTMLElement): void {
  const box = document.querySelector('[data-reveal-origin]')?.getBoundingClientRect()
  root.style.setProperty('--reveal-x', `${box ? box.left + box.width / 2 : window.innerWidth / 2}px`)
  root.style.setProperty('--reveal-y', `${box ? box.top + box.height / 2 : window.innerHeight / 2}px`)
}
