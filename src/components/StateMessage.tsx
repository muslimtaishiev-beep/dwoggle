import type { ReactNode } from 'react'
import './StateMessage.css'

export type StateKind = 'loading' | 'error' | 'empty'

interface StateMessageProps {
  kind: StateKind
  message: string
  action?: ReactNode
  /** Compact pill for overlays on the map. */
  floating?: boolean
}

/** The shared loading / error / no-data block used by every view. */
export function StateMessage({ kind, message, action, floating = false }: StateMessageProps) {
  const className = `state-message state-message--${kind}${floating ? ' state-message--floating' : ''}`
  return (
    <div className={className} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'loading' && <span className="state-message__spinner" aria-hidden="true" />}
      <p className="state-message__text">{message}</p>
      {action}
    </div>
  )
}
